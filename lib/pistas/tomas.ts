// Tus tomas añadidas a una canción: lo que grabas con REC en la Mesa se puede quedar con la canción
// como una pista más (hasta MAX_TOMAS_CANCION), para grabar por capas (una voz, luego una guitarra…).
// Cada una se guarda en el aparato (su audio en WAV junto a las pistas de la canción y su ficha en
// la de la canción: lib/pistas/almacen) y suena con la canción desde su sitio, dentro del mismo
// motor de audio que las pistas (public/mezclador.worklet.js): va clavada al pausar, mover la
// canción, repetir un trozo o tocar más lento. Lleva ya los efectos con que se grabó; aquí solo
// tiene volumen y silencio.

import { tomaInt16, type Toma } from "../mesa/toma";
import { guardarTomaCancion, leerAudioToma, leerCancion } from "./almacen";
import { FRECUENCIA, type TomaCancion } from "./tipos";
import { crearWav, leerWav } from "./wav";

export const MAX_TOMAS_CANCION = 8;

/** Una toma lista para el reproductor: su ficha y su sonido (Int16 estéreo intercalado, a FRECUENCIA) */
export interface TomaLista {
  ficha: TomaCancion;
  datos: Int16Array;
}

/** Las tomas guardadas con la canción (las que no tengan su audio en el aparato se saltan). */
export async function leerTomasDeCancion(id: string): Promise<TomaLista[]> {
  const cancion = await leerCancion(id);
  const fichas = cancion?.tomas ?? [];
  const listas: TomaLista[] = [];
  for (const ficha of fichas) {
    try {
      const audio = await leerAudioToma(id, ficha.id);
      if (!audio) continue;
      const datos = await leerWav(audio);
      listas.push({ ficha: { ...ficha, frames: datos.length >> 1 }, datos });
    } catch {
      /* esa toma no se puede leer: la canción suena sin ella */
    }
  }
  return listas;
}

/** Añade a la canción una toma grabada con ella. Devuelve su ficha y su sonido para ponerla a sonar ya. */
export async function anadirTomaACancion(id: string, toma: Toma, nombre: string): Promise<TomaLista> {
  if (toma.desde === null) throw new Error("Esta toma se grabó sin canción: no se puede añadir a una.");
  const datos = tomaInt16(toma, FRECUENCIA);
  if (datos.length < 2) throw new Error("La toma está vacía.");
  const ficha: TomaCancion = {
    id: `${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`,
    nombre: nombre.trim().slice(0, 40) || "Mi toma",
    desde: Math.max(0, Math.round(toma.desde * FRECUENCIA)),
    frames: datos.length >> 1,
    volumen: 1,
    silencio: false,
    creada: Date.now(),
  };
  await guardarTomaCancion(id, ficha, crearWav(datos, FRECUENCIA), MAX_TOMAS_CANCION);
  return { ficha, datos };
}

/** Lo que suena de una toma: su volumen, o nada si está silenciada */
export const gananciaDeToma = (t: TomaCancion) => (t.silencio ? 0 : Math.max(0, Math.min(1.5, t.volumen)));
