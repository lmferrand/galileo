// Leer las 6 pistas de una canción guardada en el aparato, listas para el reproductor (Int16
// estéreo intercalado). Lo usan Pistas (Reproduccion), el modo escenario del repertorio y la
// exportación de la mezcla.
// Para que la canción se abra pronto (medido el 20-nov-2026: una de 2:36 en MP3 tardaba 7,5 s en un
// PC, de una en una y limpiando el bajo al final):
//  - se descodifican varias pistas a la vez (cada una en su hilo del navegador), las que quepan en
//    memoria según lo larga que sea la canción y el aparato;
//  - el bajo se limpia sobre la marcha: a cada pista se le quitan los graves en cuanto llega, en
//    otros hilos (lib/pistas/limpiarBajo), mientras las demás se siguen descodificando.

import { leerAudios } from "./almacen";
import type { ClickCancion } from "./ajustesCancion";
import { esMovil } from "./aparato";
import { sacarPulso } from "./pulso";
import { separadaConRoformer } from "./importar";
import { LimpiezaBajo } from "./limpiarBajo";
import { FRECUENCIA, PISTAS, type Cancion, type Pista } from "./tipos";
import { leerWav } from "./wav";

const IDS = PISTAS.map((p) => p.id);
const I_BAJO = IDS.indexOf("bajo");
/** Las pistas en las que el separador deja graves del bajo (la batería no: su bombo está ahí) */
const CON_GRAVES = new Set<Pista>(["voz", "guitarra", "piano", "resto"]);
/** El bajo, el primero: hace falta saber su largo para limpiar las demás */
const ORDEN = [...(I_BAJO >= 0 ? [I_BAJO] : []), ...IDS.map((_, i) => i).filter((i) => i !== I_BAJO)];

/**
 * Cuántas pistas se descodifican a la vez. Cada una, ya descodificada y antes de pasarla a Int16,
 * ocupa 8 bytes por fotograma (55 MB una de 2:36): en el móvil, las que quepan en unos 240 MB y
 * nunca más de tres; un ordenador con memoria de sobra, las seis.
 */
/** Un ordenador con memoria de sobra (los móviles, nunca: se quedan sin ella antes) */
function holgado(): boolean {
  const nav = typeof navigator === "undefined" ? undefined : (navigator as Navigator & { deviceMemory?: number });
  return !esMovil() && (nav?.deviceMemory ?? 0) >= 8;
}

function cuantasALaVez(frames: number): number {
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  const quepan = Math.floor(((holgado() ? 720 : 240) * 1024 * 1024) / (Math.max(1, frames) * 8));
  const nucleos = Math.max(1, (nav?.hardwareConcurrency ?? 4) - 1);
  return Math.max(1, Math.min(holgado() ? 6 : 3, nucleos, quepan));
}

/** Lee las 6 pistas (las que van en MP3 se descodifican), varias a la vez. `alLeer`: con cada una,
 *  según llega (puede cambiarla en `datos`). Da null si `vivo` deja de serlo. */
async function leerTodas(audios: Record<Pista, Blob>, frames: number, vivo: () => boolean, alLeer?: (i: number, datos: Int16Array[]) => void): Promise<Int16Array[] | null> {
  const datos: Int16Array[] = new Array(IDS.length);
  let turno = 0;
  const obrero = async () => {
    while (turno < ORDEN.length && vivo()) {
      const i = ORDEN[turno++];
      datos[i] = await leerWav(audios[IDS[i]], frames);
      if (vivo()) alLeer?.(i, datos);
    }
  };
  await Promise.all(Array.from({ length: Math.min(ORDEN.length, cuantasALaVez(frames)) }, obrero));
  return vivo() ? datos : null;
}

/** La limpieza del bajo ha fallado (y se ha llevado pistas consigo) */
class FalloLimpieza extends Error {}

/** Lee las pistas y, según llegan, pasa al bajo los graves de las otras. */
async function leerYLimpiar(audios: Record<Pista, Blob>, frames: number, vivo: () => boolean, limpieza: LimpiezaBajo): Promise<Int16Array[] | null> {
  let fallo: unknown = null;
  const apuntar = (e: unknown) => {
    fallo ??= e ?? new Error("Ha fallado la limpieza del bajo.");
  };
  let largoBajo = -1;
  let llegaElBajo: () => void = () => undefined;
  const hayBajo = new Promise<void>((ok) => {
    llegaElBajo = ok;
  });
  const quitando: Promise<void>[] = [];
  // Lo quitado se suma al bajo de una vez en una (el bajo viaja al worker en cada suma)
  let sumas: Promise<void> = Promise.resolve();
  const sumar = (d: Int16Array[]) => {
    sumas = sumas
      .then(async () => {
        if (fallo || largoBajo < 0 || !limpieza.pendiente) return;
        d[I_BAJO] = await limpieza.sumar(d[I_BAJO]);
      })
      .catch(apuntar);
  };
  const datos = await leerTodas(audios, frames, vivo, (i, d) => {
    if (i === I_BAJO) {
      largoBajo = d[i].length;
      llegaElBajo();
      sumar(d);
    } else if (CON_GRAVES.has(IDS[i])) {
      quitando.push(
        hayBajo
          .then(async () => {
            // Solo las que miden lo mismo que el bajo (todas, salvo que una pista esté a medias)
            if (fallo || d[i].length !== largoBajo) return;
            d[i] = await limpieza.quitar(d[i]);
            sumar(d);
          })
          .catch(apuntar),
      );
    }
  });
  if (!datos) return null;
  await Promise.all(quitando);
  sumar(datos);
  await sumas;
  if (fallo) throw new FalloLimpieza(fallo instanceof Error ? fallo.message : String(fallo));
  return vivo() ? datos : null;
}

/** `vivo`: si devuelve false, se deja de leer (la pantalla ya se cerró) y da null. */
export async function leerPistasDeCancion(cancion: Cancion, vivo: () => boolean = () => true): Promise<Int16Array[] | null> {
  const audios = await leerAudios(cancion.id, IDS);
  // Separada en el PC con BS-RoFormer: ya reparte bien los graves. Si no, los graves que el
  // separador dejó en otras pistas van al bajo.
  if (separadaConRoformer(cancion) || I_BAJO < 0 || !LimpiezaBajo.disponible()) return leerTodas(audios, cancion.frames, vivo);
  const limpieza = new LimpiezaBajo(holgado() ? 4 : 2);
  try {
    return await leerYLimpiar(audios, cancion.frames, vivo, limpieza);
  } catch (e) {
    if (!(e instanceof FalloLimpieza)) throw e;
    // La limpieza ha fallado y lo que tenía se ha perdido: se leen otra vez, tal cual
    return vivo() ? leerTodas(audios, cancion.frames, vivo) : null;
  } finally {
    limpieza.cerrar();
  }
}

/** El pulso de la canción, sacado de su pista de batería (para el click del directo y el metrónomo
 *  de la Mesa). Se calcula en otro hilo; si el navegador no puede, aquí mismo. */
export async function pulsoDeCancion(cancion: Cancion): Promise<ClickCancion | null> {
  const audios = await leerAudios(cancion.id, ["bateria", "bajo"]);
  if (!audios.bateria) return null;
  // La batería da los golpes y el compás; el bajo ayuda a saber cuál es el 1 (si no se puede leer,
  // se saca sin él)
  const leer = () =>
    Promise.all([leerWav(audios.bateria, cancion.frames), audios.bajo ? leerWav(audios.bajo, cancion.frames).catch(() => null) : Promise.resolve(null)]);
  const [datos, bajo] = await leer();
  try {
    return await pulsoEnOtroHilo(datos, bajo);
  } catch {
    const [d, b] = await leer();
    return sacarPulso(d, FRECUENCIA, { bajo: b });
  }
}

function pulsoEnOtroHilo(datos: Int16Array, bajo: Int16Array | null): Promise<ClickCancion | null> {
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
    // Se pasan sin copiar (si falla, se vuelven a leer)
    w.postMessage({ datos, bajo, frecuencia: FRECUENCIA }, bajo ? [datos.buffer, bajo.buffer] : [datos.buffer]);
  });
}
