// Una toma: lo que grabaste con REC en la Mesa (las entradas con sus efectos), en estéreo.
// `desde` es el segundo de la canción en el que empezó (null si no había canción) y `recorte` las
// muestras del principio que sobran: lo que tarda el sonido en salir por los cascos y en volver
// por la interfaz, para que la toma caiga a tiempo con la canción.

import { crearWav } from "../pistas/wav";

export interface Toma {
  /** Intercalada: izquierda, derecha, izquierda… (−1 a 1) */
  muestras: Float32Array;
  frecuencia: number;
  desde: number | null;
  recorte: number;
}

export const duracionToma = (t: Toma) => Math.max(0, t.muestras.length / 2 - t.recorte) / t.frecuencia;

/** La toma ya recortada y pasada a otra frecuencia (interpolando), intercalada. */
export function tomaA(t: Toma, frecuencia: number): Float32Array {
  const frames = t.muestras.length / 2 - t.recorte;
  if (frames <= 0) return new Float32Array(0);
  const paso = t.frecuencia / frecuencia;
  const n = Math.floor(frames / paso);
  const out = new Float32Array(n * 2);
  for (let i = 0; i < n; i++) {
    const p = t.recorte + i * paso;
    const a = Math.floor(p);
    const f = p - a;
    const b = Math.min(a + 1, t.muestras.length / 2 - 1);
    out[i * 2] = t.muestras[a * 2] * (1 - f) + t.muestras[b * 2] * f;
    out[i * 2 + 1] = t.muestras[a * 2 + 1] * (1 - f) + t.muestras[b * 2 + 1] * f;
  }
  return out;
}

/** Solo la toma, en WAV */
export function wavDeToma(t: Toma): Blob {
  const frames = t.muestras.length / 2 - t.recorte;
  const s = new Int16Array(Math.max(0, frames) * 2);
  for (let i = 0; i < s.length; i++) {
    const v = Math.round(t.muestras[t.recorte * 2 + i] * 32767);
    s[i] = v > 32767 ? 32767 : v < -32768 ? -32768 : v;
  }
  return crearWav(s, t.frecuencia);
}
