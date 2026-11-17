// Canción de ejemplo ya separada (en el PC, con el mismo modelo), para ver
// cómo quedan las pistas sin tener que descargar el separador en el móvil.
// «Time Poor», de The Basics, licencia CC BY 3.0, de Wikimedia Commons:
// https://commons.wikimedia.org/wiki/File:The_Basics_-_Time_Poor.opus

import { guardarCancion, listarCanciones } from "./almacen";
import { FRECUENCIA, PISTAS, type Cancion, type Pista } from "./tipos";
import { crearWav } from "./wav";

const BASE = "/ejemplo/time-poor/";
export const ID_EJEMPLO = "ejemplo-time-poor";
export const PESO_EJEMPLO = "11 MB";

const CREDITO =
  "«Time Poor», de The Basics. Licencia CC BY 3.0 (Wikimedia Commons). Separada en pistas por Clavija.";

type CtxOffline = typeof OfflineAudioContext;

export async function cargarEjemplo(alProgreso: (fraccion: number) => void): Promise<Cancion> {
  const ya = (await listarCanciones()).find((c) => c.id === ID_EJEMPLO);
  if (ya) return ya;

  const Ctor: CtxOffline = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext: CtxOffline }).webkitOfflineAudioContext;
  const ctx = new Ctor(2, FRECUENCIA, FRECUENCIA);
  const audios = {} as Record<Pista, Blob>;
  let bytes = 0;
  let frames = Infinity;
  let duracion = 0;

  for (const [i, p] of PISTAS.entries()) {
    const res = await fetch(`${BASE}${p.id}.mp3`);
    if (!res.ok) throw new Error("No se ha podido descargar la canción de ejemplo. Comprueba la conexión.");
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

  const cancion: Cancion = {
    id: ID_EJEMPLO,
    nombre: "Time Poor (ejemplo)",
    duracion,
    frames,
    creada: Date.now(),
    bytes,
    credito: CREDITO,
  };
  await guardarCancion(cancion, audios);
  return cancion;
}
