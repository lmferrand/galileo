// WAV de 16 bits: es como se guarda cada pista en el aparato (y como se
// descargará el backing track más adelante).

import { FRECUENCIA } from "./tipos";

export const CABECERA_WAV = 44;

export function crearWav(muestras: Int16Array, frecuencia: number, canales = 2): Blob {
  return new Blob([cabeceraWav(muestras.byteLength, frecuencia, canales), muestras.buffer as ArrayBuffer], { type: "audio/wav" });
}

/** WAV hecho de varios trozos ya guardados (Blobs), sin juntarlos en memoria. */
export function crearWavDePartes(partes: Blob[], frecuencia: number, canales = 2): Blob {
  const datos = partes.reduce((s, b) => s + b.size, 0);
  return new Blob([cabeceraWav(datos, frecuencia, canales), ...partes], { type: "audio/wav" });
}

function cabeceraWav(datos: number, frecuencia: number, canales: number): ArrayBuffer {
  const cabecera = new ArrayBuffer(CABECERA_WAV);
  const v = new DataView(cabecera);
  const escribir = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  escribir(0, "RIFF");
  v.setUint32(4, 36 + datos, true);
  escribir(8, "WAVE");
  escribir(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, canales, true);
  v.setUint32(24, frecuencia, true);
  v.setUint32(28, frecuencia * canales * 2, true);
  v.setUint16(32, canales * 2, true);
  v.setUint16(34, 16, true);
  escribir(36, "data");
  v.setUint32(40, datos, true);
  return cabecera;
}

/**
 * Las muestras de una pista guardada, en Int16 estéreo intercalado a 44,1 kHz.
 * Las que separa el aparato son WAV hechos con crearWav (se leen sin copiar más
 * de la cuenta); las que llegan ya separadas van en MP3 y se descodifican aquí.
 * Con `frames`, la pista sale justo de ese largo (las 6 de una canción, iguales).
 */
export async function leerWav(blob: Blob, frames?: number): Promise<Int16Array> {
  const buffer = await blob.arrayBuffer();
  if (esNuestroWav(buffer)) return new Int16Array(buffer, CABECERA_WAV, (buffer.byteLength - CABECERA_WAV) >> 1);
  return descodificar(buffer, frames);
}

function esNuestroWav(buffer: ArrayBuffer): boolean {
  if (buffer.byteLength < CABECERA_WAV) return false;
  const v = new DataView(buffer);
  const texto = (o: number) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3));
  return texto(0) === "RIFF" && texto(8) === "WAVE" && texto(12) === "fmt " && v.getUint16(20, true) === 1 && v.getUint16(34, true) === 16 && texto(36) === "data";
}

type CtxOffline = typeof OfflineAudioContext;

async function descodificar(buffer: ArrayBuffer, frames?: number): Promise<Int16Array> {
  const Ctor: CtxOffline = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext: CtxOffline }).webkitOfflineAudioContext;
  const ctx = new Ctor(2, 1, FRECUENCIA);
  let audio: AudioBuffer;
  try {
    audio = await ctx.decodeAudioData(buffer);
  } catch {
    throw new Error("Una de las pistas de esta canción está dañada. Bórrala y vuelve a añadirla.");
  }
  const L = audio.getChannelData(0);
  const R = audio.numberOfChannels > 1 ? audio.getChannelData(1) : L;
  const n = frames ?? audio.length;
  const m = Math.min(n, audio.length);
  const salida = new Int16Array(n * 2);
  for (let k = 0; k < m; k++) {
    const l = L[k] > 1 ? 1 : L[k] < -1 ? -1 : L[k];
    const r = R[k] > 1 ? 1 : R[k] < -1 ? -1 : R[k];
    salida[2 * k] = l < 0 ? l * 32768 : l * 32767;
    salida[2 * k + 1] = r < 0 ? r * 32768 : r * 32767;
  }
  return salida;
}
