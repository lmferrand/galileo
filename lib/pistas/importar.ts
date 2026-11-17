// Traer a la biblioteca del aparato una canción ya separada que está en MP3
// en algún sitio (la de ejemplo, o una de tu nube): se descargan las 6 pistas,
// se decodifican y se guardan como cualquier otra canción.

import { guardarCancion } from "./almacen";
import { FRECUENCIA, PISTAS, type Cancion, type Pista } from "./tipos";
import { crearWav } from "./wav";

type CtxOffline = typeof OfflineAudioContext;

export async function importarPistas(
  urls: Record<Pista, string>,
  datos: Omit<Cancion, "duracion" | "frames" | "bytes"> & Partial<Pick<Cancion, "duracion" | "frames">>,
  alProgreso: (fraccion: number) => void,
): Promise<Cancion> {
  const Ctor: CtxOffline = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext: CtxOffline }).webkitOfflineAudioContext;
  const ctx = new Ctor(2, FRECUENCIA, FRECUENCIA);
  const audios = {} as Record<Pista, Blob>;
  let bytes = 0;
  let frames = Infinity;
  let duracion = 0;

  for (const [i, p] of PISTAS.entries()) {
    const res = await fetch(urls[p.id]);
    if (!res.ok) throw new Error("No se han podido descargar las pistas. Comprueba la conexión.");
    const audio = await ctx.decodeAudioData(await res.arrayBuffer());
    const L = audio.getChannelData(0);
    const R = audio.numberOfChannels > 1 ? audio.getChannelData(1) : L;
    const intercalado = new Int16Array(audio.length * 2);
    for (let k = 0; k < audio.length; k++) {
      const l = Math.max(-1, Math.min(1, L[k]));
      const r = Math.max(-1, Math.min(1, R[k]));
      intercalado[2 * k] = l < 0 ? l * 32768 : l * 32767;
      intercalado[2 * k + 1] = r < 0 ? r * 32768 : r * 32767;
    }
    const blob = crearWav(intercalado, FRECUENCIA);
    audios[p.id] = blob;
    bytes += blob.size;
    frames = Math.min(frames, audio.length);
    duracion = Math.max(duracion, audio.duration);
    alProgreso((i + 1) / PISTAS.length);
  }

  const cancion: Cancion = { ...datos, duracion, frames, bytes };
  await guardarCancion(cancion, audios);
  return cancion;
}
