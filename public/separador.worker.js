// Clavija: separa una canción en 6 pistas dentro del propio aparato, también en
// el móvil.
// Modelo: htdemucs_6s (Demucs de Meta, licencia MIT) en ONNX:
// https://huggingface.co/kramp/htdemucs-6s-webgpu-onnx
//
// Entero pedía unos 2,4 GB de memoria y en el iPhone no cabía. Ahora va partido
// en 6 etapas que se ejecutan una detrás de otra (public/separador/v2, cómo se
// hacen en herramientas/separador). El cálculo es el mismo, pero pide unos
// 740 MB. Los pesos siguen saliendo del archivo original de Hugging Face, que se
// guarda en el aparato por piezas para no tenerlo entero en memoria.
//
// Entrada: trozos de 7,8 s en estéreo a 44,1 kHz. Salida por trozo: 6 pistas
// (batería, bajo, resto, voz, guitarra, piano). Los trozos se solapan un 25 %
// y se funden con rampas lineales, como en el infer.py de referencia.
// Va con el procesador (WebAssembly) y varios núcleos. Con la tarjeta gráfica
// (WebGPU) se colgaba en una gráfica Intel, así que no se usa.
//
// Mensajes que recibe:  { tipo: 'separar', izquierda: Float32Array, derecha: Float32Array }
// Mensajes que envía:   { tipo: 'fase', fase: 'descargando'|'cargando'|'separando' }
//                       { tipo: 'descarga', recibido, total }
//                       { tipo: 'motor', motor: 'wasm', nucleos }
//                       { tipo: 'progreso', hecho, total, msPorTrozo }
//                       { tipo: 'bloque', indice, frames, pistas: { [nombre]: Int16Array (L,R intercalados) } }
//                       { tipo: 'hecho', frames, bloques }
//                       { tipo: 'error', mensaje }

const ORT_VERSION = "1.27.0";
const ORT_URL = `https://cdn.jsdelivr.net/npm/onnxruntime-web@${ORT_VERSION}/dist/ort.wasm.min.mjs`;
const MODELO_URL = "https://huggingface.co/kramp/htdemucs-6s-webgpu-onnx/resolve/main/htdemucs_6s.onnx";
const MODELO_BYTES = 284797240;
const ETAPAS = "/separador/v2/";
const CACHE_MODELO = "clavija-modelo-v1";
const BD_MODELO = "clavija-modelo";
const PIEZA = 8 * 1024 * 1024;

const N = 343980; // 7,8 s a 44,1 kHz
const SOLAPE = Math.floor(N / 4);
const PASO = N - SOLAPE;
const NOMBRES = ["bateria", "bajo", "resto", "voz", "guitarra", "piano"];
// Las pistas salen en bloques de unos 15 s: así no se acumula la canción entera en memoria.
const BLOQUE = 44100 * 15;

let ortPromesa = null;
let motorPromesa = null;

function avisar(mensaje, transferir) {
  self.postMessage(mensaje, transferir || []);
}

function nucleos() {
  if (!self.crossOriginIsolated) return 1;
  const ua = navigator.userAgent || "";
  // Safari en el iPhone dice siempre «2 núcleos» (por privacidad) aunque tenga 6.
  if (/iPhone|iPad|iPod/.test(ua)) return 4;
  const n = navigator.hardwareConcurrency || 4;
  // En el móvil, como mucho 4: cada hilo de más también gasta memoria.
  return Math.max(1, Math.min(n - 1, /Android/i.test(ua) ? 4 : 8));
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

// ---- El archivo del modelo en el aparato ----
// Tres formas de tenerlo guardado: por piezas en IndexedDB (la de ahora) y, de
// antes, entero en Cache Storage o entero en IndexedDB. De cada una se leen solo
// los trozos que pide cada etapa.

function abrirBdModelo() {
  return new Promise((ok, mal) => {
    const pet = indexedDB.open(BD_MODELO, 2);
    pet.onupgradeneeded = () => {
      const db = pet.result;
      if (!db.objectStoreNames.contains("archivos")) db.createObjectStore("archivos");
      if (!db.objectStoreNames.contains("piezas")) db.createObjectStore("piezas");
    };
    pet.onsuccess = () => ok(pet.result);
    pet.onerror = () => mal(pet.error);
  });
}

function pedir(db, almacen, clave) {
  return new Promise((ok) => {
    const pet = db.transaction(almacen).objectStore(almacen).get(clave);
    pet.onsuccess = () => ok(pet.result ?? null);
    pet.onerror = () => ok(null);
  });
}

function poner(db, almacen, clave, valor) {
  return new Promise((ok, mal) => {
    const tx = db.transaction(almacen, "readwrite");
    tx.objectStore(almacen).put(valor, clave);
    tx.oncomplete = () => ok();
    tx.onerror = () => mal(tx.error);
    tx.onabort = () => mal(tx.error || new Error("No cabe el separador en el aparato."));
  });
}

async function aBytes(valor) {
  if (valor instanceof ArrayBuffer) return new Uint8Array(valor);
  return new Uint8Array(await valor.arrayBuffer());
}

/** Fuente que lee trozos de un Blob guardado entero. */
function fuenteBlob(blob) {
  return {
    async copiar(destino, pos, desde, largo) {
      for (let hecho = 0; hecho < largo; hecho += PIEZA) {
        const n = Math.min(PIEZA, largo - hecho);
        destino.set(new Uint8Array(await blob.slice(desde + hecho, desde + hecho + n).arrayBuffer()), pos + hecho);
      }
    },
  };
}

/** Fuente que lee de las piezas de 8 MB guardadas en IndexedDB. */
function fuentePiezas(db) {
  let ultima = { i: -1, bytes: null };
  const pieza = async (i) => {
    if (ultima.i !== i) {
      const v = await pedir(db, "piezas", `${MODELO_URL}#${i}`);
      if (!v) throw new Error("Falta una parte del separador guardado.");
      ultima = { i, bytes: await aBytes(v) };
    }
    return ultima.bytes;
  };
  return {
    async copiar(destino, pos, desde, largo) {
      let hecho = 0;
      while (hecho < largo) {
        const abs = desde + hecho;
        const i = Math.floor(abs / PIEZA);
        const p = await pieza(i);
        const dentro = abs - i * PIEZA;
        const n = Math.min(largo - hecho, p.length - dentro);
        destino.set(p.subarray(dentro, dentro + n), pos + hecho);
        hecho += n;
      }
    },
  };
}

async function fuenteGuardada(db) {
  const info = await pedir(db, "piezas", `${MODELO_URL}#info`);
  if (info?.completo) return fuentePiezas(db);
  try {
    const r = await (await caches.open(CACHE_MODELO)).match(MODELO_URL);
    if (r) {
      const blob = await r.blob();
      if (blob.size > MODELO_BYTES * 0.9) return fuenteBlob(blob);
    }
  } catch {
    /* sin Cache Storage */
  }
  const blob = await pedir(db, "archivos", MODELO_URL);
  if (blob && blob.size > MODELO_BYTES * 0.9) return fuenteBlob(blob);
  return null;
}

/** Descarga el modelo y lo guarda por piezas, sin tenerlo nunca entero en memoria. */
async function descargar(db) {
  avisar({ tipo: "fase", fase: "descargando" });
  const res = await fetch(MODELO_URL);
  if (!res.ok || !res.body) throw new Error(`No se ha podido descargar el separador (error ${res.status}).`);
  const total = Number(res.headers.get("content-length")) || MODELO_BYTES;
  const lector = res.body.getReader();
  let pieza = new Uint8Array(PIEZA);
  let lleno = 0;
  let indice = 0;
  let recibido = 0;
  let ultimoAviso = 0;
  const guardarPieza = async (bytes) => {
    await poner(db, "piezas", `${MODELO_URL}#${indice}`, bytes.buffer.byteLength === bytes.length ? bytes.buffer : bytes.slice().buffer);
    indice++;
  };
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    let v = value;
    while (v.length) {
      const n = Math.min(v.length, PIEZA - lleno);
      pieza.set(v.subarray(0, n), lleno);
      lleno += n;
      v = v.subarray(n);
      if (lleno === PIEZA) {
        await guardarPieza(pieza);
        pieza = new Uint8Array(PIEZA);
        lleno = 0;
      }
    }
    recibido += value.length;
    const ahora = Date.now();
    if (ahora - ultimoAviso > 200) {
      ultimoAviso = ahora;
      avisar({ tipo: "descarga", recibido, total });
    }
  }
  if (lleno) await guardarPieza(pieza.slice(0, lleno));
  avisar({ tipo: "descarga", recibido, total: recibido });
  if (recibido < MODELO_BYTES * 0.9) throw new Error("La descarga del separador se ha cortado. Vuelve a probar.");
  await poner(db, "piezas", `${MODELO_URL}#info`, { completo: true, bytes: recibido, piezas: indice });
  return fuentePiezas(db);
}

async function crearMotor() {
  const ort = await cargarOrt();
  const info = await (await fetch(`${ETAPAS}etapas.json`)).json();
  const db = await abrirBdModelo();
  const fuente = (await fuenteGuardada(db)) || (await descargar(db));
  avisar({ tipo: "fase", fase: "cargando" });

  const sesiones = [];
  for (const etapa of info.etapas) {
    const grafo = new Uint8Array(await (await fetch(`${ETAPAS}${etapa.archivo}`)).arrayBuffer());
    let pesos = new Uint8Array(etapa.pesos);
    let pos = 0;
    for (const [desde, largo] of etapa.trozos) {
      await fuente.copiar(pesos, pos, desde, largo);
      pos += largo;
    }
    sesiones.push(
      await ort.InferenceSession.create(grafo, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
        externalData: [{ path: "pesos", data: pesos }],
      }),
    );
    pesos = null;
  }
  db.close();

  // Lo que se puede soltar tras cada etapa (nadie más lo necesita).
  const soltar = info.etapas.map((e, i) => e.entradas.filter((n) => !info.etapas.slice(i + 1).some((z) => z.entradas.includes(n))));
  avisar({ tipo: "motor", motor: "wasm", nucleos: nucleos() });
  return { ort, info, sesiones, soltar };
}

function obtenerMotor() {
  if (!motorPromesa) {
    motorPromesa = crearMotor().catch((e) => {
      motorPromesa = null;
      throw e;
    });
  }
  return motorPromesa;
}

async function correr(motor, entrada) {
  const { ort, info, sesiones, soltar } = motor;
  const pool = new Map([[info.entrada, new ort.Tensor("float32", entrada, [1, 2, N])]]);
  for (let i = 0; i < sesiones.length; i++) {
    const s = sesiones[i];
    const feeds = {};
    for (const n of s.inputNames) feeds[n] = pool.get(n);
    const r = await s.run(feeds);
    for (const n of soltar[i]) pool.delete(n);
    for (const [k, v] of Object.entries(r)) pool.set(k, v);
  }
  return pool.get(info.salida).data; // [1, 6, 2, N]
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
  const motor = await obtenerMotor();
  avisar({ tipo: "fase", fase: "separando" });

  const total = izquierda.length;
  const trozos = Math.max(1, Math.ceil(Math.max(0, total - N) / PASO) + 1);

  // Lo que el trozo anterior deja pendiente en la zona de solape (ya multiplicado por su rampa).
  const cola = new Float32Array(NOMBRES.length * 2 * SOLAPE);
  const colaPeso = new Float32Array(SOLAPE);
  // Lo que cierra cada trozo, antes de pasar al bloque.
  const cerrado = NOMBRES.map(() => new Int16Array(N * 2));

  // Bloque en curso.
  let bloque = NOMBRES.map(() => new Int16Array(BLOQUE * 2));
  let enBloque = 0;
  let bloques = 0;
  const soltarBloque = () => {
    if (!enBloque) return;
    const pistas = {};
    const transferir = [];
    NOMBRES.forEach((n, p) => {
      const datos = enBloque === BLOQUE ? bloque[p] : bloque[p].slice(0, enBloque * 2);
      pistas[n] = datos;
      transferir.push(datos.buffer);
    });
    avisar({ tipo: "bloque", indice: bloques, frames: enBloque, pistas }, transferir);
    bloques++;
    bloque = NOMBRES.map(() => new Int16Array(BLOQUE * 2));
    enBloque = 0;
  };
  const pasarAlBloque = (frames) => {
    let hecho = 0;
    while (hecho < frames) {
      const n = Math.min(frames - hecho, BLOQUE - enBloque);
      for (let p = 0; p < NOMBRES.length; p++) bloque[p].set(cerrado[p].subarray(hecho * 2, (hecho + n) * 2), enBloque * 2);
      enBloque += n;
      hecho += n;
      if (enBloque === BLOQUE) soltarBloque();
    }
  };

  const entrada = new Float32Array(2 * N);
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

    const pistas = await correr(motor, entrada);

    // Hasta dónde queda cerrado el audio con este trozo (el resto espera al siguiente).
    const cierre = ultimo ? largo : PASO;

    for (let p = 0; p < NOMBRES.length; p++) {
      const baseL = p * 2 * N;
      const baseR = (p * 2 + 1) * N;
      const colaL = p * 2 * SOLAPE;
      const colaR = (p * 2 + 1) * SOLAPE;
      const destino = cerrado[p];
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
          destino[i * 2] = aInt16(l * k);
          destino[i * 2 + 1] = aInt16(r * k);
        } else {
          cola[colaL + i - PASO] = pistas[baseL + i] * w[i];
          cola[colaR + i - PASO] = pistas[baseR + i] * w[i];
          if (p === 0) colaPeso[i - PASO] = w[i];
        }
      }
    }
    pasarAlBloque(cierre);

    hechos++;
    avisar({ tipo: "progreso", hecho: hechos, total: trozos, msPorTrozo: (performance.now() - inicio) / hechos });
    if (ultimo) break;
  }

  soltarBloque();
  avisar({ tipo: "hecho", frames: total, bloques });
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
