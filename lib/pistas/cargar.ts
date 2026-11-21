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

/** La memoria del aparato en GB, según el navegador (el iPhone no lo dice: como si tuviera poca) */
function memoriaAparato(): number {
  const nav = typeof navigator === "undefined" ? undefined : (navigator as Navigator & { deviceMemory?: number });
  return nav?.deviceMemory ?? 0;
}

/** Un ordenador con memoria de sobra (los móviles, nunca: se quedan sin ella antes) */
function holgado(): boolean {
  return !esMovil() && memoriaAparato() >= 8;
}

/**
 * Lo que pide una pista mientras se descodifica y se pasa a Int16, en bytes por fotograma. Medido
 * el 21-nov-2026 mirando la memoria del navegador: unos 190 MB cada pista de 2:36 (ya descodificada
 * ocupa 8 bytes por fotograma, pero el navegador gasta el triple mientras lo hace).
 */
const BYTES_EN_MARCHA = 28;

/**
 * Cuántas pistas se descodifican a la vez. Un ordenador con memoria de sobra, las seis.
 * En el móvil, las que quepan en el presupuesto (casi siempre una, dos si la canción es corta o el
 * móvil tiene 8 GB): antes iban tres a la vez contando solo 8 bytes por fotograma, y abrir una
 * canción de 2:36 pedía de golpe unos 500 MB (tres veces lo que ocupa luego); una de 4 minutos, más
 * de 800. El sistema cerraba la app y la pantalla se quedaba en blanco (al cambiar de canción).
 */
function cuantasALaVez(frames: number): number {
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  const nucleos = Math.max(1, (nav?.hardwareConcurrency ?? 4) - 1);
  const f = Math.max(1, frames);
  if (esMovil()) {
    const presupuesto = (memoriaAparato() >= 8 ? 480 : 300) * 1024 * 1024;
    return Math.max(1, Math.min(3, nucleos, Math.floor(presupuesto / (f * BYTES_EN_MARCHA))));
  }
  const quepan = Math.floor(((holgado() ? 720 : 240) * 1024 * 1024) / (f * 8));
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
  // (en el móvil, un solo hilo limpiando: cada uno gasta mientras trabaja lo que ocupan dos pistas,
  // y tarda poco más porque va a la vez que se descodifica)
  const limpieza = new LimpiezaBajo(holgado() ? 4 : esMovil() ? 1 : 2);
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
  const leer = async (): Promise<[Int16Array, Int16Array | null]> => {
    const elBajo = () => (audios.bajo ? leerWav(audios.bajo, cancion.frames).catch(() => null) : Promise.resolve(null));
    // En el móvil, de una en una: descodificar las dos a la vez pide de golpe el doble de memoria,
    // con la canción ya cargada
    if (!esMovil()) return Promise.all([leerWav(audios.bateria, cancion.frames), elBajo()]);
    const bateria = await leerWav(audios.bateria, cancion.frames);
    return [bateria, await elBajo()];
  };
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
