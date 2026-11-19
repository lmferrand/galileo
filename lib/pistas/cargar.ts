// Leer las 6 pistas de una canción guardada en el aparato, listas para el reproductor (Int16
// estéreo intercalado). Lo usan Pistas (Reproduccion) y el modo escenario del repertorio.

import { leerAudios } from "./almacen";
import { separadaConRoformer } from "./importar";
import { limpiarBajo } from "./limpiarBajo";
import { PISTAS, type Cancion } from "./tipos";
import { leerWav } from "./wav";

const IDS = PISTAS.map((p) => p.id);

/** `vivo`: si devuelve false, se deja de leer (la pantalla ya se cerró) y da null. */
export async function leerPistasDeCancion(cancion: Cancion, vivo: () => boolean = () => true): Promise<Int16Array[] | null> {
  const audios = await leerAudios(cancion.id, IDS);
  // De una en una: las que llegan en MP3 se descodifican y así no se juntan seis a la vez en memoria.
  const leer = async () => {
    const d: Int16Array[] = [];
    for (const id of IDS) {
      if (!vivo()) return null;
      d.push(await leerWav(audios[id], cancion.frames));
    }
    return d;
  };
  const datos = await leer();
  if (!datos || !vivo()) return null;
  // Separada en el PC con BS-RoFormer: ya reparte bien los graves. Si no, los graves que el
  // separador dejó en otras pistas van al bajo (si falla, se leen otra vez tal cual).
  if (separadaConRoformer(cancion)) return datos;
  const limpias = await limpiarBajo(datos);
  return limpias.some((p) => p.length === 0) ? leer() : limpias;
}
