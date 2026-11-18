// Separa en el PC una carpeta de canciones con htdemucs_6s (onnxruntime-node, el
// mismo modelo que usa Clavija) y deja un .zip por canción, listo para añadirlo
// a Clavija ya separado: Pistas → «Elegir canciones» → elegir los .zip.
//
// Dentro de cada .zip (sin comprimir: los MP3 ya lo están):
//   cancion.json  { nombre, frames, duracion }
//   voz.mp3, guitarra.mp3, bajo.mp3, bateria.mp3, piano.mp3, resto.mp3
//
// Uso: node paquetes.mjs <carpeta-canciones> <htdemucs_6s.onnx> <carpeta-salida> [kbps]
// Si un .zip ya existe, esa canción se salta (se puede parar y seguir). Se pueden
// lanzar dos a la vez (REVES=1 en el segundo, que empieza por el final, y HILOS=4
// en los dos): cada uno marca la canción que está separando (.enmarcha).
// «Artista - Título.mp3» → «Título»; las repetidas por título se separan una vez.

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import decode from "audio-decode";
import ort from "onnxruntime-node";
import { Mp3Encoder } from "@breezystack/lamejs";

const [carpeta, modelo, salida, kbpsArg] = process.argv.slice(2);
const KBPS = Number(kbpsArg) || 112;
const SR = 44100;
const N = 343980;
const SOLAPE = Math.floor(N / 4);
const PASO = N - SOLAPE;
const NOMBRES = ["bateria", "bajo", "resto", "voz", "guitarra", "piano"];
const ORDEN_ZIP = ["voz", "guitarra", "bajo", "bateria", "piano", "resto"];

function titulo(archivo) {
  const base = archivo.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/_+/g, " ").replace(/\s+/g, " ").trim();
  const partes = base.split(" - ").map((p) => p.trim()).filter(Boolean);
  if (partes.length < 2) return base;
  const artista = partes[0];
  let resto = partes.slice(1);
  if (resto.length > 1 && resto[resto.length - 1].toLowerCase() === artista.toLowerCase()) resto = resto.slice(0, -1);
  return resto.join(" - ");
}

const nombreArchivo = (t) => t.replace(/[<>:"/\\|?*]/g, "").replace(/[. ]+$/, "").trim();

function remuestrear(x, de, a) {
  if (de === a) return Float32Array.from(x);
  const ratio = de / a;
  const corte = Math.min(1, a / de);
  const A = 16;
  const n = Math.floor(x.length / ratio);
  const y = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i * ratio;
    const k0 = Math.floor(t);
    let s = 0;
    let w = 0;
    for (let k = k0 - A + 1; k <= k0 + A; k++) {
      if (k < 0 || k >= x.length) continue;
      const d = (t - k) * corte;
      const sinc = d === 0 ? 1 : Math.sin(Math.PI * d) / (Math.PI * d);
      const z = (t - k) / A;
      const lanczos = Math.abs(z) < 1 ? (z === 0 ? 1 : Math.sin(Math.PI * z) / (Math.PI * z)) : 0;
      const h = sinc * lanczos;
      s += x[k] * h;
      w += h;
    }
    y[i] = w ? s / w : 0;
  }
  return y;
}

// ---- ZIP sin comprimir ----
const TABLA = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = TABLA[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function zip(entradas) {
  const partes = [];
  const central = [];
  let offset = 0;
  const FECHA = ((2026 - 1980) << 9) | (11 << 5) | 18;
  for (const { nombre, datos } of entradas) {
    const n = Buffer.from(nombre, "utf8");
    const crc = crc32(datos);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(0, 8);
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(FECHA, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(datos.length, 18);
    lh.writeUInt32LE(datos.length, 22);
    lh.writeUInt16LE(n.length, 26);
    lh.writeUInt16LE(0, 28);
    partes.push(lh, n, datos);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(FECHA, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(datos.length, 20);
    ch.writeUInt32LE(datos.length, 24);
    ch.writeUInt16LE(n.length, 28);
    ch.writeUInt32LE(offset, 42);
    central.push(ch, n);
    offset += 30 + n.length + datos.length;
  }
  const tam = central.reduce((s, b) => s + b.length, 0);
  const fin = Buffer.alloc(22);
  fin.writeUInt32LE(0x06054b50, 0);
  fin.writeUInt16LE(entradas.length, 8);
  fin.writeUInt16LE(entradas.length, 10);
  fin.writeUInt32LE(tam, 12);
  fin.writeUInt32LE(offset, 16);
  return Buffer.concat([...partes, ...central, fin]);
}

const aInt16 = (v) => {
  const s = v > 1 ? 1 : v < -1 ? -1 : v;
  return s < 0 ? Math.round(s * 32768) : Math.round(s * 32767);
};

function mp3(iL, iR) {
  const enc = new Mp3Encoder(2, SR, KBPS);
  const partes = [];
  for (let i = 0; i < iL.length; i += 1152) {
    const b = enc.encodeBuffer(iL.subarray(i, i + 1152), iR.subarray(i, i + 1152));
    if (b.length) partes.push(Buffer.from(b));
  }
  const fin = enc.flush();
  if (fin.length) partes.push(Buffer.from(fin));
  return Buffer.concat(partes);
}

// ---- Lista ----
fs.mkdirSync(salida, { recursive: true });
const archivos = fs
  .readdirSync(carpeta)
  .filter((a) => /\.(mp3|m4a|wav|flac|ogg|opus|aac)$/i.test(a))
  .sort((a, b) => a.localeCompare(b, "es"));
const vistos = new Set();
const lista = [];
for (const a of archivos) {
  const t = titulo(a);
  const clave = t.toLowerCase();
  if (vistos.has(clave)) {
    console.log("repetida, se salta:", a);
    continue;
  }
  vistos.add(clave);
  lista.push({ archivo: a, titulo: t, zip: path.join(salida, `${nombreArchivo(t)}.zip`) });
}
const pendientes = lista.filter((c) => !fs.existsSync(c.zip));
if (process.env.REVES) pendientes.reverse();
console.log(`${lista.length} canciones, ${lista.length - pendientes.length} ya hechas, ${pendientes.length} por separar`);
if (!pendientes.length) process.exit(0);

const nucleos = Number(process.env.HILOS) || Math.max(1, Math.min(os.cpus().length - 1, 8));
const sesion = await ort.InferenceSession.create(modelo, { executionProviders: ["cpu"], intraOpNumThreads: nucleos, graphOptimizationLevel: "all" });
const entradaT = new Float32Array(2 * N);
const ventana = new Float32Array(N);
for (let i = 0; i < N; i++) ventana[i] = i < SOLAPE ? i / (SOLAPE - 1) : i >= N - SOLAPE ? (N - 1 - i) / (SOLAPE - 1) : 1;
const tTotal = Date.now();

for (const [k, c] of pendientes.entries()) {
  const t0 = Date.now();
  const marca = c.zip + ".enmarcha";
  if (fs.existsSync(c.zip) || fs.existsSync(marca)) continue;
  fs.writeFileSync(marca, String(process.pid));
  try {
    const audio = await decode(fs.readFileSync(path.join(carpeta, c.archivo)));
    const L = remuestrear(audio.getChannelData(0), audio.sampleRate, SR);
    const R = remuestrear(audio.numberOfChannels > 1 ? audio.getChannelData(1) : audio.getChannelData(0), audio.sampleRate, SR);
    const total = L.length;
    const acum = NOMBRES.map(() => [new Float32Array(total), new Float32Array(total)]);
    const peso = new Float32Array(total);
    const trozos = Math.max(1, Math.ceil(Math.max(0, total - N) / PASO) + 1);
    let hecho = 0;
    for (let comienzo = 0; ; comienzo += PASO) {
      const ultimo = comienzo + N >= total;
      const largo = Math.min(N, total - comienzo);
      entradaT.fill(0);
      entradaT.set(L.subarray(comienzo, comienzo + largo), 0);
      entradaT.set(R.subarray(comienzo, comienzo + largo), N);
      const res = await sesion.run({ [sesion.inputNames[0]]: new ort.Tensor("float32", entradaT, [1, 2, N]) });
      const d = res[sesion.outputNames[0]].data;
      for (let i = 0; i < largo; i++) {
        let w = ventana[i];
        if (comienzo === 0 && i < SOLAPE) w = 1;
        if (ultimo && i >= N - SOLAPE) w = 1;
        peso[comienzo + i] += w;
        for (let p = 0; p < 6; p++) {
          acum[p][0][comienzo + i] += d[p * 2 * N + i] * w;
          acum[p][1][comienzo + i] += d[(p * 2 + 1) * N + i] * w;
        }
      }
      hecho++;
      process.stdout.write(`\r[${k + 1}/${pendientes.length}] ${c.titulo}: trozo ${hecho}/${trozos}   `);
      if (ultimo) break;
    }
    const pistas = {};
    for (let p = 0; p < 6; p++) {
      const [aL, aR] = acum[p];
      const iL = new Int16Array(total);
      const iR = new Int16Array(total);
      for (let i = 0; i < total; i++) {
        const f = peso[i] > 1e-6 ? 1 / peso[i] : 1;
        iL[i] = aInt16(aL[i] * f);
        iR[i] = aInt16(aR[i] * f);
      }
      pistas[NOMBRES[p]] = mp3(iL, iR);
    }
    const datos = { nombre: c.titulo, frames: total, duracion: total / SR };
    const paquete = zip([
      { nombre: "cancion.json", datos: Buffer.from(JSON.stringify(datos, null, 2)) },
      ...ORDEN_ZIP.map((p) => ({ nombre: `${p}.mp3`, datos: pistas[p] })),
    ]);
    fs.writeFileSync(c.zip + ".tmp", paquete);
    fs.renameSync(c.zip + ".tmp", c.zip);
    console.log(`\r[${k + 1}/${pendientes.length}] ${c.titulo}: ${(datos.duracion / 60).toFixed(1)} min, ${(paquete.length / 1e6).toFixed(1)} MB, ${((Date.now() - t0) / 1000).toFixed(0)} s`);
  } catch (e) {
    console.log(`\r[${k + 1}/${pendientes.length}] ${c.titulo}: ERROR ${e?.message || e}`);
  } finally {
    fs.rmSync(marca, { force: true });
  }
}
console.log(`listo en ${((Date.now() - tTotal) / 60000).toFixed(1)} min`);
