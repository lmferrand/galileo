// Prepara un sonido corto para la app: sin silencio al principio, como mucho N segundos,
// fundido al final, volumen igualado y en MP3 de 128 kbps.
// Uso: node preparar-sonido.mjs <entrada.mp3> <salida.mp3> [segundos] [dB objetivo]
import fs from "node:fs";
import decode from "audio-decode";
import { Mp3Encoder } from "@breezystack/lamejs";

const [entrada, salida, segArg, dbArg] = process.argv.slice(2);
const MAX = Number(segArg) || 2.8;
const OBJETIVO_DB = Number(dbArg) || -16;
const crudo = fs.readFileSync(entrada);
const audio = await decode(new Uint8Array(crudo));
const sr = audio.sampleRate;
if (sr !== 44100) throw new Error("frecuencia " + sr);
const L0 = audio.getChannelData(0);
const R0 = audio.numberOfChannels > 1 ? audio.getChannelData(1) : L0;
// Empieza donde suena de verdad (−45 dB), con 10 ms de margen
const umbral = Math.pow(10, -45 / 20);
let ini = 0;
while (ini < L0.length && Math.max(Math.abs(L0[ini]), Math.abs(R0[ini])) < umbral) ini++;
ini = Math.max(0, ini - Math.round(0.01 * sr));
const n = Math.min(L0.length - ini, Math.round(MAX * sr));
const L = L0.slice(ini, ini + n);
const R = R0.slice(ini, ini + n);
// Volumen: el del trozo que más suena (ventanas de 0,4 s), hasta el objetivo; pico máximo −1 dB
const V = Math.round(0.4 * sr);
let maxRms = 0;
for (let s = 0; s + V <= n; s += Math.round(V / 4)) { let q = 0; for (let i = s; i < s + V; i++) q += (L[i] * L[i] + R[i] * R[i]) / 2; maxRms = Math.max(maxRms, Math.sqrt(q / V)); }
if (n < V) { let q = 0; for (let i = 0; i < n; i++) q += (L[i] * L[i] + R[i] * R[i]) / 2; maxRms = Math.sqrt(q / n); }
let pico = 0; for (let i = 0; i < n; i++) pico = Math.max(pico, Math.abs(L[i]), Math.abs(R[i]));
let g = Math.pow(10, OBJETIVO_DB / 20) / maxRms;
g = Math.min(g, Math.pow(10, -1 / 20) / pico);
// Fundidos: 5 ms al entrar y 0,45 s al salir (solo si se ha recortado o acaba con sonido)
const entra = Math.round(0.005 * sr), sale = Math.round(0.45 * sr);
const iL = new Int16Array(n), iR = new Int16Array(n);
for (let i = 0; i < n; i++) {
  let f = g;
  if (i < entra) f *= i / entra;
  if (i > n - sale) f *= Math.max(0, (n - i) / sale) ** 1.5;
  const a = Math.max(-1, Math.min(1, L[i] * f)), b = Math.max(-1, Math.min(1, R[i] * f));
  iL[i] = a < 0 ? a * 32768 : a * 32767; iR[i] = b < 0 ? b * 32768 : b * 32767;
}
const enc = new Mp3Encoder(2, sr, 128);
const partes = [];
for (let i = 0; i < n; i += 1152) { const b = enc.encodeBuffer(iL.subarray(i, i + 1152), iR.subarray(i, i + 1152)); if (b.length) partes.push(Buffer.from(b)); }
const fin = enc.flush(); if (fin.length) partes.push(Buffer.from(fin));
fs.writeFileSync(salida, Buffer.concat(partes));
console.log(`${salida.split("/").pop()}: original ${audio.duration.toFixed(2)} s, empieza en ${(ini / sr).toFixed(2)} s, queda ${(n / sr).toFixed(2)} s, ganancia ${(20 * Math.log10(g)).toFixed(1)} dB, pico final ${(20 * Math.log10(pico * g)).toFixed(1)} dB, ${fs.statSync(salida).size} bytes`);
