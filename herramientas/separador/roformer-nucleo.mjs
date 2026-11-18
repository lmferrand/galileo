// Núcleo de BS-RoFormer SW (jarredou, CC BY-NC-SA 4.0) para el PC, en ONNX
// (huggingface.co/Ryan5453/unblend, bs_roformer_sw_fp32.onnx). El modelo trabaja con
// espectros: la STFT y la iSTFT van aquí, igual que torch.stft / torch.istft (Hann
// periódica de 2048, salto 512, centrada con reflejo). Trozos de 588 800 muestras
// (13,35 s) con solape del 50 % y fundidos lineales. Lo usan paquetes-roformer.mjs y el
// programa del estudio (clavija-pc.mjs).

import os from "node:os";
import decode from "audio-decode";
import ort from "onnxruntime-node";
import { Mp3Encoder } from "@breezystack/lamejs";

export const SR = 44100;
const NFFT = 2048;
const HOP = 512;
const F = NFFT / 2 + 1; // 1025
const T = 1151;
const C = (T - 1) * HOP; // 588 800
const PASO = C / 2;
const FUNDIDO = Math.floor(C / 10);
/** Orden de salida del modelo, con los nombres de Clavija */
export const MODELO = ["bajo", "bateria", "resto", "voz", "guitarra", "piano"];
export const ORDEN_ZIP = ["voz", "guitarra", "bajo", "bateria", "piano", "resto"];

// ---------- FFT compleja radix 2 ----------
const LOG = Math.log2(NFFT);
const REV = new Uint32Array(NFFT);
for (let i = 0; i < NFFT; i++) {
  let r = 0;
  for (let b = 0; b < LOG; b++) r |= ((i >> b) & 1) << (LOG - 1 - b);
  REV[i] = r;
}
const COS = new Float64Array(NFFT / 2);
const SIN = new Float64Array(NFFT / 2);
for (let i = 0; i < NFFT / 2; i++) {
  COS[i] = Math.cos((2 * Math.PI * i) / NFFT);
  SIN[i] = Math.sin((2 * Math.PI * i) / NFFT);
}
function fft(re, im, inversa) {
  for (let i = 0; i < NFFT; i++) {
    const j = REV[i];
    if (j > i) {
      let t = re[i];
      re[i] = re[j];
      re[j] = t;
      t = im[i];
      im[i] = im[j];
      im[j] = t;
    }
  }
  for (let tam = 2; tam <= NFFT; tam <<= 1) {
    const mitad = tam >> 1;
    const paso = NFFT / tam;
    for (let i = 0; i < NFFT; i += tam) {
      for (let j = 0, k = 0; j < mitad; j++, k += paso) {
        const wr = COS[k];
        const wi = inversa ? SIN[k] : -SIN[k];
        const a = i + j;
        const b = a + mitad;
        const tr = re[b] * wr - im[b] * wi;
        const ti = re[b] * wi + im[b] * wr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
      }
    }
  }
}
const VENT = new Float64Array(NFFT);
for (let n = 0; n < NFFT; n++) VENT[n] = 0.5 - 0.5 * Math.cos((2 * Math.PI * n) / NFFT);

const PAD = NFFT / 2;
const relleno = new Float64Array(C + 2 * PAD);
const bre = new Float64Array(NFFT);
const bim = new Float64Array(NFFT);

function stft(x, dRe, dIm, off) {
  for (let i = 0; i < C; i++) relleno[PAD + i] = x[i];
  for (let i = 1; i <= PAD; i++) {
    relleno[PAD - i] = x[i];
    relleno[PAD + C - 1 + i] = x[C - 1 - i];
  }
  for (let t = 0; t < T; t++) {
    const base = t * HOP;
    for (let n = 0; n < NFFT; n++) {
      bre[n] = relleno[base + n] * VENT[n];
      bim[n] = 0;
    }
    fft(bre, bim, false);
    for (let f = 0; f < F; f++) {
      dRe[off + f * T + t] = bre[f];
      dIm[off + f * T + t] = bim[f];
    }
  }
}

const acum = new Float64Array(C + 2 * PAD);
const env = new Float64Array(C + 2 * PAD);
for (let t = 0; t < T; t++) for (let n = 0; n < NFFT; n++) env[t * HOP + n] += VENT[n] * VENT[n];

function istft(oRe, oIm, off, y) {
  acum.fill(0);
  for (let t = 0; t < T; t++) {
    for (let f = 0; f < F; f++) {
      bre[f] = oRe[off + f * T + t];
      bim[f] = oIm[off + f * T + t];
    }
    for (let f = 1; f < NFFT / 2; f++) {
      bre[NFFT - f] = bre[f];
      bim[NFFT - f] = -bim[f];
    }
    bim[0] = 0;
    bim[NFFT / 2] = 0;
    fft(bre, bim, true);
    const base = t * HOP;
    for (let n = 0; n < NFFT; n++) acum[base + n] += (bre[n] / NFFT) * VENT[n];
  }
  for (let i = 0; i < C; i++) {
    const e = env[PAD + i];
    y[i] = e > 1e-11 ? acum[PAD + i] / e : 0;
  }
}

// ---------- Leer el audio ----------
/** Quita las etiquetas ID3 del principio (algunas vienen repetidas y el lector se lía). */
function sinId3(buf) {
  let p = 0;
  while (buf.length > p + 10 && buf.toString("latin1", p, p + 3) === "ID3") {
    const tam = (buf[p + 6] << 21) | (buf[p + 7] << 14) | (buf[p + 8] << 7) | buf[p + 9];
    p += 10 + tam + (buf[p + 5] & 0x10 ? 10 : 0);
  }
  while (p < buf.length && buf[p] === 0) p++;
  return new Uint8Array(p ? buf.subarray(p) : buf);
}

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
      const l = Math.abs(z) < 1 ? (z === 0 ? 1 : Math.sin(Math.PI * z) / (Math.PI * z)) : 0;
      s += x[k] * sinc * l;
      w += sinc * l;
    }
    y[i] = w ? s / w : 0;
  }
  return y;
}

/** Descodifica una canción (Buffer) a dos canales a 44,1 kHz. */
export async function leerCancion(buf, esMp3) {
  const audio = await decode(esMp3 ? sinId3(buf) : new Uint8Array(buf));
  const L = remuestrear(audio.getChannelData(0), audio.sampleRate, SR);
  const R = remuestrear(audio.numberOfChannels > 1 ? audio.getChannelData(1) : audio.getChannelData(0), audio.sampleRate, SR);
  return { L, R };
}

// ---------- MP3 ----------
const aInt16 = (v) => {
  const s = v > 1 ? 1 : v < -1 ? -1 : v;
  return s < 0 ? Math.round(s * 32768) : Math.round(s * 32767);
};
function mp3(iL, iR, kbps) {
  const enc = new Mp3Encoder(2, SR, kbps);
  const partes = [];
  for (let i = 0; i < iL.length; i += 1152) {
    const b = enc.encodeBuffer(iL.subarray(i, i + 1152), iR.subarray(i, i + 1152));
    if (b.length) partes.push(Buffer.from(b));
  }
  const f = enc.flush();
  if (f.length) partes.push(Buffer.from(f));
  return Buffer.concat(partes);
}

// ---------- Separar ----------
export async function crearSeparador(modelo, hilos) {
  const sesion = await ort.InferenceSession.create(modelo, {
    executionProviders: ["cpu"],
    intraOpNumThreads: hilos || Math.max(1, Math.min(os.cpus().length - 1, 8)),
    graphOptimizationLevel: "all",
  });
  const specRe = new Float32Array(2 * F * T);
  const specIm = new Float32Array(2 * F * T);
  const trozo = new Float64Array(C);
  const y = new Float64Array(C);
  const ventana = new Float32Array(C).fill(1);
  for (let i = 0; i < FUNDIDO; i++) {
    ventana[i] = i / FUNDIDO;
    ventana[C - 1 - i] = i / FUNDIDO;
  }

  /** Las 6 pistas en MP3 ({ voz, guitarra, … }). alAvanzar(hecho, total) en cada trozo. */
  async function separar(L, R, alAvanzar, kbps = 112) {
    const total = L.length;
    const BORDE = C - PASO;
    const largo = total + 2 * BORDE;
    const canal = [new Float32Array(largo), new Float32Array(largo)];
    canal[0].set(L, BORDE);
    canal[1].set(R, BORDE);
    const acumulado = MODELO.map(() => [new Float32Array(largo), new Float32Array(largo)]);
    const peso = new Float32Array(largo);
    const comienzos = [];
    for (let s0 = 0; comienzos.length === 0 || comienzos[comienzos.length - 1] + C < largo; s0 += PASO) comienzos.push(s0);
    for (let k = 0; k < comienzos.length; k++) {
      const s0 = comienzos[k];
      for (let c = 0; c < 2; c++) {
        for (let i = 0; i < C; i++) trozo[i] = s0 + i < largo ? canal[c][s0 + i] : 0;
        stft(trozo, specRe, specIm, c * F * T);
      }
      const res = await sesion.run({
        spec_real: new ort.Tensor("float32", specRe, [1, 2, F, T]),
        spec_imag: new ort.Tensor("float32", specIm, [1, 2, F, T]),
      });
      const oRe = res.out_spec_real.data;
      const oIm = res.out_spec_imag.data;
      for (let p = 0; p < 6; p++)
        for (let c = 0; c < 2; c++) {
          istft(oRe, oIm, (p * 2 + c) * F * T, y);
          const dst = acumulado[p][c];
          for (let i = 0; i < C && s0 + i < largo; i++) dst[s0 + i] += y[i] * ventana[i];
        }
      for (let i = 0; i < C && s0 + i < largo; i++) peso[s0 + i] += ventana[i];
      await alAvanzar?.(k + 1, comienzos.length);
    }
    const pistas = {};
    for (let p = 0; p < 6; p++) {
      const iL = new Int16Array(total);
      const iR = new Int16Array(total);
      for (let i = 0; i < total; i++) {
        const w = peso[BORDE + i] > 1e-6 ? 1 / peso[BORDE + i] : 0;
        iL[i] = aInt16(acumulado[p][0][BORDE + i] * w);
        iR[i] = aInt16(acumulado[p][1][BORDE + i] * w);
      }
      pistas[MODELO[p]] = mp3(iL, iR, kbps);
    }
    return pistas;
  }
  return { separar };
}
