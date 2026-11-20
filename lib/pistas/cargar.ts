// Leer las 6 pistas de una canción guardada en el aparato, listas para el reproductor (Int16
// estéreo intercalado). Lo usan Pistas (Reproduccion) y el modo escenario del repertorio.

import { leerAudios } from "./almacen";
import type { ClickCancion } from "./ajustesCancion";
import { sacarPulso } from "./pulso";
import { separadaConRoformer } from "./importar";
import { limpiarBajo } from "./limpiarBajo";
import { FRECUENCIA, PISTAS, type Cancion } from "./tipos";
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

/** El pulso de la canción, sacado de su pista de batería (para el click del directo y el metrónomo
 *  de la Mesa). Se calcula en otro hilo; si el navegador no puede, aquí mismo. */
export async function pulsoDeCancion(cancion: Cancion): Promise<ClickCancion | null> {
  const audios = await leerAudios(cancion.id, ["bateria"]);
  if (!audios.bateria) return null;
  const datos = await leerWav(audios.bateria, cancion.frames);
  try {
    return await pulsoEnOtroHilo(datos);
  } catch {
    return sacarPulso(await leerWav(audios.bateria, cancion.frames), FRECUENCIA);
  }
}

function pulsoEnOtroHilo(datos: Int16Array): Promise<ClickCancion | null> {
  return new Promise((ok, mal) => {
    let w: Worker;
    try {
      w = new Worker(new URL("./pulso.worker.ts", import.meta.url), { type: "module" });
    } catch (e) {
      mal(e);
      return;
    }
    const acabar = () => {
      clearTimeout(tope);
      w.terminate();
    };
    const tope = setTimeout(() => {
      acabar();
      mal(new Error("El pulso tarda demasiado"));
    }, 90_000);
    w.onmessage = (e: MessageEvent<ClickCancion | null>) => {
      acabar();
      ok(e.data);
    };
    w.onerror = (e) => {
      acabar();
      mal(e);
    };
    // Se pasa sin copiar (si falla, se vuelve a leer la batería)
    w.postMessage({ datos, frecuencia: FRECUENCIA }, [datos.buffer]);
  });
}
