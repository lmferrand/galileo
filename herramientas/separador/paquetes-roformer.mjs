// Separa una canción en 6 pistas con BS-RoFormer SW (jarredou, CC BY-NC-SA 4.0), en ONNX
// (Ryan5453/unblend). El modelo trabaja con espectros: la STFT y la iSTFT van aquí, igual
// que torch.stft / torch.istft (Hann periódica de 2048, salto 512, centrada con reflejo).
// Trozos de 588 800 muestras (13,35 s) con solape del 50 % y fundidos lineales.
// Uso: node roformer.mjs <carpeta-canciones> <modelo.onnx> <carpeta-salida> [kbps]
//   REVES=1 empieza por el final, HILOS=n hilos; marca .enmarcha para ir dos a la vez.

import fs from "node:fs";
import os from "node:os";
import decode from "audio-decode";
import ort from "onnxruntime-node";
import { Mp3Encoder } from "@breezystack/lamejs";

const [carpeta, modelo, carpetaSalida, kbpsArg] = process.argv.slice(2);
const KBPS = Number(kbpsArg) || 112;
const SR = 44100;
const NFFT = 2048;
const HOP = 512;
const F = NFFT / 2 + 1; // 1025
const T = 1151;
const C = (T - 1) * HOP; // 588800
const PASO = C / 2;
const FUNDIDO = Math.floor(C / 10);
// Orden del modelo → nombres de Clavija
const MODELO = ["bajo", "bateria", "resto", "voz", "guitarra", "piano"];
const ORDEN_ZIP = ["voz", "guitarra", "bajo", "bateria", "piano", "resto"];

// ---------- FFT compleja radix 2 (en el sitio) ----------
const LOG = Math.log2(NFFT);
const REV = new Uint32Array(NFFT);
for (let i = 0; i < NFFT; i++) { let r = 0; for (let b = 0; b < LOG; b++) r |= ((i >> b) & 1) << (LOG - 1 - b); REV[i] = r; }
const COS = new Float64Array(NFFT / 2), SIN = new Float64Array(NFFT / 2);
for (let i = 0; i < NFFT / 2; i++) { COS[i] = Math.cos((2 * Math.PI * i) / NFFT); SIN[i] = Math.sin((2 * Math.PI * i) / NFFT); }
function fft(re, im, inversa) {
  for (let i = 0; i < NFFT; i++) { const j = REV[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
  for (let tam = 2; tam <= NFFT; tam <<= 1) {
    const mitad = tam >> 1, paso = NFFT / tam;
    for (let i = 0; i < NFFT; i += tam) {
      for (let j = 0, k = 0; j < mitad; j++, k += paso) {
        const wr = COS[k], wi = inversa ? SIN[k] : -SIN[k];
        const a = i + j, b = a + mitad;
        const tr = re[b] * wr - im[b] * wi, ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
      }
    }
  }
}
const VENT = new Float64Array(NFFT);
for (let n = 0; n < NFFT; n++) VENT[n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / NFFT); // Hann periódica

/** STFT centrada (reflejo) de un trozo de C muestras → re/im en [F][T] dentro de destino (desplazamiento off). */
const PAD = NFFT / 2;
const relleno = new Float64Array(C + 2 * PAD);
const bre = new Float64Array(NFFT), bim = new Float64Array(NFFT);
function stft(x, dRe, dIm, off) {
  for (let i = 0; i < C; i++) relleno[PAD + i] = x[i];
  for (let i = 1; i <= PAD; i++) { relleno[PAD - i] = x[i]; relleno[PAD + C - 1 + i] = x[C - 1 - i]; }
  for (let t = 0; t < T; t++) {
    const base = t * HOP;
    for (let n = 0; n < NFFT; n++) { bre[n] = relleno[base + n] * VENT[n]; bim[n] = 0; }
    fft(bre, bim, false);
    for (let f = 0; f < F; f++) { dRe[off + f * T + t] = bre[f]; dIm[off + f * T + t] = bim[f]; }
  }
}
/** iSTFT (como torch.istft, center=True, length=C) desde re/im [F][T] en (oRe, oIm, off) → y (C muestras). */
const acum = new Float64Array(C + 2 * PAD), env = new Float64Array(C + 2 * PAD);
for (let t = 0; t < T; t++) for (let n = 0; n < NFFT; n++) env[t * HOP + n] += VENT[n] * VENT[n];
function istft(oRe, oIm, off, y) {
  acum.fill(0);
  for (let t = 0; t < T; t++) {
    for (let f = 0; f < F; f++) { bre[f] = oRe[off + f * T + t]; bim[f] = oIm[off + f * T + t]; }
    for (let f = 1; f < NFFT / 2; f++) { bre[NFFT - f] = bre[f]; bim[NFFT - f] = -bim[f]; }
    bim[0] = 0; bim[NFFT / 2] = 0;
    fft(bre, bim, true);
    const base = t * HOP;
    for (let n = 0; n < NFFT; n++) acum[base + n] += (bre[n] / NFFT) * VENT[n];
  }
  for (let i = 0; i < C; i++) { const e = env[PAD + i]; y[i] = e > 1e-11 ? acum[PAD + i] / e : 0; }
}

// ---------- Utilidades (de paquetes.mjs) ----------
function sinId3(buf) { let p = 0; while (buf.length > p + 10 && buf.toString("latin1", p, p + 3) === "ID3") { const tam = (buf[p + 6] << 21) | (buf[p + 7] << 14) | (buf[p + 8] << 7) | buf[p + 9]; p += 10 + tam + (buf[p + 5] & 0x10 ? 10 : 0); } while (p < buf.length && buf[p] === 0) p++; return p ? new Uint8Array(buf.subarray(p)) : buf; }
function remuestrear(x, de, a) { if (de === a) return Float32Array.from(x); const ratio = de / a, corte = Math.min(1, a / de), A = 16, n = Math.floor(x.length / ratio), y = new Float32Array(n); for (let i = 0; i < n; i++) { const t = i * ratio, k0 = Math.floor(t); let s = 0, w = 0; for (let k = k0 - A + 1; k <= k0 + A; k++) { if (k < 0 || k >= x.length) continue; const d = (t - k) * corte, sinc = d === 0 ? 1 : Math.sin(Math.PI * d) / (Math.PI * d), z = (t - k) / A, l = Math.abs(z) < 1 ? (z === 0 ? 1 : Math.sin(Math.PI * z) / (Math.PI * z)) : 0, h = sinc * l; s += x[k] * h; w += h; } y[i] = w ? s / w : 0; } return y; }
const TABLA = new Uint32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = TABLA[(c ^ b[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(entradas) { const partes = [], central = []; let offset = 0; const FECHA = ((2026 - 1980) << 9) | (11 << 5) | 18; for (const { nombre, datos } of entradas) { const n = Buffer.from(nombre, "utf8"), crc = crc32(datos), lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0x0800, 6); lh.writeUInt16LE(FECHA, 12); lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(datos.length, 18); lh.writeUInt32LE(datos.length, 22); lh.writeUInt16LE(n.length, 26); partes.push(lh, n, datos); const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0x0800, 8); ch.writeUInt16LE(FECHA, 14); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(datos.length, 20); ch.writeUInt32LE(datos.length, 24); ch.writeUInt16LE(n.length, 28); ch.writeUInt32LE(offset, 42); central.push(ch, n); offset += 30 + n.length + datos.length; } const tam = central.reduce((s, b) => s + b.length, 0), fin = Buffer.alloc(22); fin.writeUInt32LE(0x06054b50, 0); fin.writeUInt16LE(entradas.length, 8); fin.writeUInt16LE(entradas.length, 10); fin.writeUInt32LE(tam, 12); fin.writeUInt32LE(offset, 16); return Buffer.concat([...partes, ...central, fin]); }
const aInt16 = (v) => { const s = v > 1 ? 1 : v < -1 ? -1 : v; return s < 0 ? Math.round(s * 32768) : Math.round(s * 32767); };
function mp3(iL, iR) { const enc = new Mp3Encoder(2, SR, KBPS), partes = []; for (let i = 0; i < iL.length; i += 1152) { const b = enc.encodeBuffer(iL.subarray(i, i + 1152), iR.subarray(i, i + 1152)); if (b.length) partes.push(Buffer.from(b)); } const f = enc.flush(); if (f.length) partes.push(Buffer.from(f)); return Buffer.concat(partes); }


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

const sesion = await ort.InferenceSession.create(modelo, { executionProviders: ["cpu"], intraOpNumThreads: Number(process.env.HILOS) || Math.max(1, Math.min(os.cpus().length - 1, 8)), graphOptimizationLevel: "all" });
const specRe = new Float32Array(2 * F * T), specIm = new Float32Array(2 * F * T);
const trozo = new Float64Array(C), y = new Float64Array(C);
const ventana = new Float32Array(C).fill(1);
for (let i = 0; i < FUNDIDO; i++) { ventana[i] = i / FUNDIDO; ventana[C - 1 - i] = i / FUNDIDO; }

async function separar(L, R, alAvanzar) {
  const total = L.length, BORDE = C - PASO, largo = total + 2 * BORDE;
  const canal = [new Float32Array(largo), new Float32Array(largo)];
  canal[0].set(L, BORDE); canal[1].set(R, BORDE);
  const acumulado = MODELO.map(() => [new Float32Array(largo), new Float32Array(largo)]);
  const peso = new Float32Array(largo);
  const comienzos = [];
  for (let s0 = 0; comienzos.length === 0 || comienzos[comienzos.length - 1] + C < largo; s0 += PASO) comienzos.push(s0);
  for (let k = 0; k < comienzos.length; k++) {
    const s0 = comienzos[k];
    for (let c = 0; c < 2; c++) { for (let i = 0; i < C; i++) trozo[i] = s0 + i < largo ? canal[c][s0 + i] : 0; stft(trozo, specRe, specIm, c * F * T); }
    const res = await sesion.run({ spec_real: new ort.Tensor("float32", specRe, [1, 2, F, T]), spec_imag: new ort.Tensor("float32", specIm, [1, 2, F, T]) });
    const oRe = res.out_spec_real.data, oIm = res.out_spec_imag.data;
    for (let p = 0; p < 6; p++) for (let c = 0; c < 2; c++) {
      istft(oRe, oIm, (p * 2 + c) * F * T, y);
      const dst = acumulado[p][c];
      for (let i = 0; i < C && s0 + i < largo; i++) dst[s0 + i] += y[i] * ventana[i];
    }
    for (let i = 0; i < C && s0 + i < largo; i++) peso[s0 + i] += ventana[i];
    alAvanzar(k + 1, comienzos.length);
  }
  const pistas = {};
  for (let p = 0; p < 6; p++) {
    const iL = new Int16Array(total), iR = new Int16Array(total);
    for (let i = 0; i < total; i++) { const w = peso[BORDE + i] > 1e-6 ? 1 / peso[BORDE + i] : 0; iL[i] = aInt16(acumulado[p][0][BORDE + i] * w); iR[i] = aInt16(acumulado[p][1][BORDE + i] * w); }
    pistas[MODELO[p]] = mp3(iL, iR);
  }
  return pistas;
}

fs.mkdirSync(carpetaSalida, { recursive: true });
const archivos = fs.readdirSync(carpeta).filter((a) => /\.(mp3|m4a|wav|flac|ogg|opus|aac)$/i.test(a)).sort((a, b) => a.localeCompare(b, "es"));
const vistos = new Set(), lista = [];
for (const a of archivos) { const t = titulo(a), clave = t.toLowerCase(); if (vistos.has(clave)) continue; vistos.add(clave); lista.push({ archivo: a, titulo: t, zip: carpetaSalida + "/" + nombreArchivo(t) + ".zip" }); }
let pendientes = lista.filter((c) => !fs.existsSync(c.zip));
if (process.env.REVES) pendientes = pendientes.reverse();
console.log(lista.length + " canciones, " + (lista.length - pendientes.length) + " ya hechas");
const tTotal = Date.now();
for (const [k, c] of pendientes.entries()) {
  const marca = c.zip + ".enmarcha";
  if (fs.existsSync(c.zip) || fs.existsSync(marca)) continue;
  fs.writeFileSync(marca, String(process.pid));
  const t0 = Date.now();
  try {
    const crudo = fs.readFileSync(carpeta + "/" + c.archivo);
    const audio = await decode(/\.mp3$/i.test(c.archivo) ? sinId3(crudo) : new Uint8Array(crudo));
    const L = remuestrear(audio.getChannelData(0), audio.sampleRate, SR);
    const R = remuestrear(audio.numberOfChannels > 1 ? audio.getChannelData(1) : audio.getChannelData(0), audio.sampleRate, SR);
    const pistas = await separar(L, R, (h, t) => process.stdout.write("\rtrozo " + h + "/" + t + "   "));
    const datos = { nombre: c.titulo, frames: L.length, duracion: L.length / SR, separador: "roformer", credito: "Separada con BS-RoFormer SW (jarredou), licencia CC BY-NC-SA 4.0." };
    const paquete = zip([{ nombre: "cancion.json", datos: Buffer.from(JSON.stringify(datos, null, 2)) }, ...ORDEN_ZIP.map((p) => ({ nombre: p + ".mp3", datos: pistas[p] }))]);
    fs.writeFileSync(c.zip + ".tmp", paquete);
    fs.renameSync(c.zip + ".tmp", c.zip);
    console.log("\r[" + (k + 1) + "/" + pendientes.length + "] " + c.titulo + ": " + ((Date.now() - t0) / 60000).toFixed(1) + " min");
  } catch (e) {
    console.log("\r[" + (k + 1) + "/" + pendientes.length + "] " + c.titulo + ": ERROR " + (e?.message || e));
  } finally {
    fs.rmSync(marca, { force: true });
  }
}
console.log("listo en " + ((Date.now() - tTotal) / 60000).toFixed(1) + " min");
