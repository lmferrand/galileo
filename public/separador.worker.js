// Clavija: separa una canción en 6 pistas dentro del propio aparato.
// Modelo: htdemucs_6s (Demucs de Meta, licencia MIT) en ONNX:
// https://huggingface.co/kramp/htdemucs-6s-webgpu-onnx
// Entrada: trozos de 7,8 s en estéreo a 44,1 kHz. Salida por trozo: 6 pistas
// (batería, bajo, resto, voz, guitarra, piano). Los trozos se solapan un 25 %
// y se funden con rampas lineales, como en el infer.py de referencia.
//
// Va con el procesador (WebAssembly) usando todos los núcleos menos uno. Con
// la tarjeta gráfica (WebGPU) el primer trozo se quedaba colgado en una gráfica
// Intel y bloqueaba la pestaña entera, así que de momento no se usa.
//
// Mensajes que recibe:  { tipo: 'separar', izquierda: Float32Array, derecha: Float32Array }
// Mensajes que envía:   { tipo: 'fase', fase: 'descargando'|'cargando'|'separando' }
//                       { tipo: 'descarga', recibido, total }
//                       { tipo: 'motor', motor: 'wasm', nucleos }
//                       { tipo: 'progreso', hecho, total, msPorTrozo }
//                       { tipo: 'hecho', pistas: { [nombre]: Int16Array (L,R intercalados) }, frames }
//                       { tipo: 'error', mensaje }

const ORT_VERSION = "1.27.0";
const ORT_URL = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/ort.wasm.min.mjs`;
const MODELO_URL = "https://huggingface.co/kramp/htdemucs-6s-webgpu-onnx/resolve/main/htdemucs_6s.onnx";
const MODELO_BYTES = 284797240;
const CACHE_MODELO = "clavija-modelo-v1";
const BD_MODELO = "clavija-modelo";

const N = 343980; // 7,8 s a 44,1 kHz
const SOLAPE = Math.floor(N / 4);
const PASO = N - SOLAPE;
const NOMBRES = ["bateria", "bajo", "resto", "voz", "guitarra", "piano"];

let ortPromesa = null;
let sesionPromesa = null;

function avisar(mensaje, transferir) {
  self.postMessage(mensaje, transferir || []);
}

function nucleos() {
  if (!self.crossOriginIsolated) return 1;
  const n = navigator.hardwareConcurrency || 4;
  return Math.max(1, Math.min(n - 1, 8));
}

function cargarOrt() {
  if (!ortPromesa) {
    ortPromesa = import(ORT_URL).then((ort) => {
      ort.env.wasm.numThreads = nucleos();
      return ort;
    });
  }
  return ortPromesa;
}

// ---- Guardar el modelo en el aparato (Cache Storage y, si falla, IndexedDB) ----

function abrirBdModelo() {
  return new Promise((ok, mal) => {
    const pet = indexedDB.open(BD_MODELO, 1);
    pet.onupgradeneeded = () => pet.result.createObjectStore("archivos");
    pet.onsuccess = () => ok(pet.result);
    pet.onerror = () => mal(pet.error);
  });
}

async function leerGuardado() {
  try {
    const cache = await caches.open(CACHE_MODELO);
    const r = await cache.match(MODELO_URL);
    if (r) return new Uint8Array(await r.arrayBuffer());
  } catch {
    /* sin Cache Storage */
  }
  try {
    const db = await abrirBdModelo();
    const blob = await new Promise((ok) => {
      const pet = db.transaction("archivos").objectStore("archivos").get(MODELO_URL);
      pet.onsuccess = () => ok(pet.result || null);
      pet.onerror = () => ok(null);
    });
    db.close();
    if (blob && blob.size > MODELO_BYTES * 0.9) return new Uint8Array(await blob.arrayBuffer());
  } catch {
    /* sin IndexedDB */
  }
  return null;
}

async function guardar(bytes) {
  const blob = new Blob([bytes], { type: "application/octet-stream" });
  try {
    const cache = await caches.open(CACHE_MODELO);
    await cache.put(MODELO_URL, new Response(blob, { headers: { "Content-Type": "application/octet-stream" } }));
    return;
  } catch {
    /* algunos navegadores no aceptan archivos tan grandes en la caché */
  }
  try {
    const db = await abrirBdModelo();
    await new Promise((ok, mal) => {
      const tx = db.transaction("archivos", "readwrite");
      tx.objectStore("archivos").put(blob, MODELO_URL);
      tx.oncomplete = ok;
      tx.onerror = () => mal(tx.error);
      tx.onabort = () => mal(tx.error);
    });
    db.close();
  } catch {
    /* no se ha podido guardar: la próxima vez se volverá a descargar */
  }
}

async function bytesModelo() {
  const guardado = await leerGuardado();
  if (guardado) {
    avisar({ tipo: "fase", fase: "cargando" });
    return guardado;
  }

  avisar({ tipo: "fase", fase: "descargando" });
  const res = await fetch(MODELO_URL);
  if (!res.ok || !res.body) throw new Error(`No se ha podido descargar el separador (error ${res.status}).`);
  const total = Number(res.headers.get("content-length")) || MODELO_BYTES;

  let bytes = new Uint8Array(total);
  let recibido = 0;
  let ultimoAviso = 0;
  const lector = res.body.getReader();
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    if (recibido + value.length > bytes.length) {
      const mayor = new Uint8Array(Math.max(bytes.length * 1.5, recibido + value.length));
      mayor.set(bytes.subarray(0, recibido));
      bytes = mayor;
    }
    bytes.set(value, recibido);
    recibido += value.length;
    const ahora = Date.now();
    if (ahora - ultimoAviso > 200) {
      ultimoAviso = ahora;
      avisar({ tipo: "descarga", recibido, total });
    }
  }
  avisar({ tipo: "descarga", recibido, total: recibido });
  const final = recibido === bytes.length ? bytes : bytes.slice(0, recibido);
  await guardar(final);
  return final;
}

async function crearSesion() {
  const ort = await cargarOrt();
  let modelo = await bytesModelo();
  avisar({ tipo: "fase", fase: "cargando" });
  const sesion = await ort.InferenceSession.create(modelo, { graphOptimizationLevel: "all", executionProviders: ["wasm"] });
  modelo = null;
  avisar({ tipo: "motor", motor: "wasm", nucleos: nucleos() });
  return { ort, sesion };
}

function obtenerSesion() {
  if (!sesionPromesa) {
    sesionPromesa = crearSesion().catch((e) => {
      sesionPromesa = null;
      throw e;
    });
  }
  return sesionPromesa;
}

/** Rampa de subida y bajada en los extremos que se solapan con el trozo vecino. */
function ventana(conEntrada, conSalida) {
  const w = new Float32Array(N);
  const d = SOLAPE - 1;
  for (let i = 0; i < N; i++) {
    if (conEntrada && i < SOLAPE) w[i] = i / d;
    else if (conSalida && i >= N - SOLAPE) w[i] = (N - 1 - i) / d;
    else w[i] = 1;
  }
  return w;
}

function aInt16(v) {
  const s = v > 1 ? 1 : v < -1 ? -1 : v;
  return s < 0 ? Math.round(s * 32768) : Math.round(s * 32767);
}

async function separar(izquierda, derecha) {
  const { ort, sesion } = await obtenerSesion();
  avisar({ tipo: "fase", fase: "separando" });

  const total = izquierda.length;
  const trozos = Math.max(1, Math.ceil(Math.max(0, total - N) / PASO) + 1);
  const salida = NOMBRES.map(() => new Int16Array(total * 2));

  // Lo que el trozo anterior deja pendiente en la zona de solape (ya multiplicado por su rampa).
  const cola = new Float32Array(NOMBRES.length * 2 * SOLAPE);
  const colaPeso = new Float32Array(SOLAPE);

  const entrada = new Float32Array(2 * N);
  const nombreEntrada = sesion.inputNames[0];
  const nombreSalida = sesion.outputNames[0];
  const w0 = ventana(false, true);
  const wMedio = ventana(true, true);

  let hechos = 0;
  const inicio = performance.now();

  for (let comienzo = 0; ; comienzo += PASO) {
    const ultimo = comienzo + N >= total;
    const largo = Math.min(N, total - comienzo);
    const w = hechos === 0 ? (ultimo ? ventana(false, false) : w0) : ultimo ? ventana(true, false) : wMedio;

    entrada.fill(0);
    entrada.set(izquierda.subarray(comienzo, comienzo + largo), 0);
    entrada.set(derecha.subarray(comienzo, comienzo + largo), N);

    const resultado = await sesion.run({ [nombreEntrada]: new ort.Tensor("float32", entrada, [1, 2, N]) });
    const pistas = resultado[nombreSalida].data; // [1, 6, 2, N]

    // Hasta dónde queda cerrado el audio con este trozo (el resto espera al siguiente).
    const cierre = ultimo ? largo : PASO;

    for (let p = 0; p < NOMBRES.length; p++) {
      const baseL = (p * 2) * N;
      const baseR = (p * 2 + 1) * N;
      const colaL = (p * 2) * SOLAPE;
      const colaR = (p * 2 + 1) * SOLAPE;
      const destino = salida[p];
      for (let i = 0; i < largo; i++) {
        let l = pistas[baseL + i] * w[i];
        let r = pistas[baseR + i] * w[i];
        let peso = w[i];
        if (hechos > 0 && i < SOLAPE) {
          l += cola[colaL + i];
          r += cola[colaR + i];
          peso += colaPeso[i];
        }
        if (i < cierre) {
          const k = peso > 1e-6 ? 1 / peso : 1;
          const j = (comienzo + i) * 2;
          destino[j] = aInt16(l * k);
          destino[j + 1] = aInt16(r * k);
        } else {
          cola[colaL + i - PASO] = pistas[baseL + i] * w[i];
          cola[colaR + i - PASO] = pistas[baseR + i] * w[i];
          if (p === 0) colaPeso[i - PASO] = w[i];
        }
      }
    }

    hechos++;
    avisar({ tipo: "progreso", hecho: hechos, total: trozos, msPorTrozo: (performance.now() - inicio) / hechos });
    if (ultimo) break;
  }

  const final = {};
  NOMBRES.forEach((n, i) => (final[n] = salida[i]));
  avisar({ tipo: "hecho", pistas: final, frames: total }, salida.map((s) => s.buffer));
}

self.onmessage = async (e) => {
  const m = e.data;
  if (m?.tipo !== "separar") return;
  try {
    await separar(m.izquierda, m.derecha);
  } catch (err) {
    const texto = String(err?.message || err);
    avisar({ tipo: "error", mensaje: texto });
  }
};
