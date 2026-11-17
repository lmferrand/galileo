// Separar una canción: se lee el archivo, se manda al separador (un worker
// con el procesador del aparato) y se guardan las 6 pistas en la biblioteca.
// El trabajo vive fuera de la pantalla: si te vas al afinador y vuelves, sigue.
// Las pistas llegan por bloques y se van guardando en el aparato, así la
// canción entera no está nunca en memoria (en el móvil no cabría).

import { FRECUENCIA, PISTAS, type Cancion, type Pista } from "./tipos";
import { crearWavDePartes } from "./wav";
import { guardarAudio, guardarCancion, pedirPersistencia } from "./almacen";
import { guardarBloque, leerBloques, vaciarTemporal } from "./temporal";
import { esMovil } from "./aparato";

export type Fase = "leyendo" | "descargando" | "cargando" | "separando" | "guardando";

export interface Trabajo {
  nombre: string;
  fase: Fase;
  recibido?: number;
  total?: number;
  hecho?: number;
  trozos?: number;
  msPorTrozo?: number;
  motor?: string;
}

export interface EstadoSeparacion {
  trabajo: Trabajo | null;
  error: string | null;
  /** Última canción terminada (para abrirla al acabar). */
  terminada: Cancion | null;
}

const MAX_MINUTOS_ORDENADOR = 12;
const MAX_MINUTOS_MOVIL = 8;
// Marca de «separando»: si la página se recarga a medias (el móvil se ha quedado
// sin memoria o ha cerrado Safari), al volver se avisa.
const MARCA = "clavija-separando";

function ponerMarca(nombre: string) {
  try {
    localStorage.setItem(MARCA, JSON.stringify({ nombre, desde: Date.now() }));
  } catch {
    /* sin almacenamiento local */
  }
}

function quitarMarca() {
  try {
    localStorage.removeItem(MARCA);
  } catch {
    /* sin almacenamiento local */
  }
}

/** Si la última separación se cortó sin acabar, el nombre de la canción (y se olvida). */
export function separacionCortada(): string | null {
  if (estado.trabajo) return null;
  try {
    const marca = localStorage.getItem(MARCA);
    if (!marca) return null;
    quitarMarca();
    void vaciarTemporal();
    return (JSON.parse(marca) as { nombre?: string }).nombre || "la canción";
  } catch {
    return null;
  }
}

let estado: EstadoSeparacion = { trabajo: null, error: null, terminada: null };
const oyentes = new Set<(e: EstadoSeparacion) => void>();
let trabajador: Worker | null = null;
let cancelar: ((e: Error) => void) | null = null;

function publicar(cambio: Partial<EstadoSeparacion>) {
  estado = { ...estado, ...cambio };
  oyentes.forEach((f) => f(estado));
}

export function suscribirSeparacion(f: (e: EstadoSeparacion) => void): () => void {
  oyentes.add(f);
  f(estado);
  return () => {
    oyentes.delete(f);
  };
}

export function olvidarAviso() {
  publicar({ error: null, terminada: null });
}

export function pararSeparacion() {
  trabajador?.terminate();
  trabajador = null;
  cancelar?.(new Error("parada"));
}

function nombreBonito(archivo: string): string {
  const sin = archivo.replace(/\.[a-z0-9]{2,5}$/i, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim();
  return sin || "Canción sin nombre";
}

type CtxOffline = typeof OfflineAudioContext;

async function decodificar(archivo: File) {
  const datos = await archivo.arrayBuffer();
  const Ctor: CtxOffline = window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext: CtxOffline }).webkitOfflineAudioContext;
  const ctx = new Ctor(2, FRECUENCIA, FRECUENCIA);
  let audio: AudioBuffer;
  try {
    audio = await ctx.decodeAudioData(datos);
  } catch {
    throw new Error("No reconozco ese archivo como audio. Prueba con un mp3, m4a o wav.");
  }
  const max = esMovil() ? MAX_MINUTOS_MOVIL : MAX_MINUTOS_ORDENADOR;
  if (audio.duration > max * 60)
    throw new Error(esMovil() ? `En el móvil el máximo son ${max} minutos por canción. Las más largas, en el ordenador.` : `La canción dura más de ${max} minutos. De momento el máximo son ${max}.`);
  const izquierda = audio.getChannelData(0).slice();
  const derecha = audio.numberOfChannels > 1 ? audio.getChannelData(1).slice() : izquierda.slice();
  return { izquierda, derecha, duracion: audio.duration };
}

export async function separarCancion(archivo: File): Promise<Cancion | null> {
  if (estado.trabajo) throw new Error("Ya hay una canción separándose.");
  const nombre = nombreBonito(archivo.name);
  const inicio = performance.now();
  publicar({ trabajo: { nombre, fase: "leyendo" }, error: null, terminada: null });
  ponerMarca(nombre);

  try {
    await vaciarTemporal();
    const { izquierda, derecha, duracion } = await decodificar(archivo);
    if (!trabajador) trabajador = new Worker("/separador.worker.js", { type: "module" });
    const w = trabajador;

    // Los bloques se guardan en orden según llegan.
    let escrituras: Promise<void> = Promise.resolve();
    const r = await new Promise<{ bloques: number; frames: number; motor?: string }>((ok, mal) => {
      let motor: string | undefined;
      cancelar = mal;
      const actualizar = (c: Partial<Trabajo>) => publicar({ trabajo: { ...(estado.trabajo ?? { nombre, fase: "leyendo" }), ...c } });
      w.onmessage = (e: MessageEvent) => {
        const m = e.data;
        if (m.tipo === "fase") actualizar({ fase: m.fase });
        else if (m.tipo === "descarga") actualizar({ fase: "descargando", recibido: m.recibido, total: m.total });
        else if (m.tipo === "motor") {
          motor = m.motor;
          actualizar({ motor });
        } else if (m.tipo === "progreso") actualizar({ fase: "separando", hecho: m.hecho, trozos: m.total, msPorTrozo: m.msPorTrozo });
        else if (m.tipo === "bloque") {
          const { pistas, indice } = m as { pistas: Record<string, Int16Array>; indice: number };
          escrituras = escrituras.then(() => guardarBloque(pistas, indice));
          escrituras.catch(mal);
        } else if (m.tipo === "hecho") ok({ bloques: m.bloques, frames: m.frames, motor });
        else if (m.tipo === "error") mal(new Error(m.mensaje));
      };
      w.onerror = (e) => {
        e.preventDefault?.();
        mal(new Error(e.message || "El separador se ha parado de golpe. Puede que el aparato se haya quedado sin memoria."));
      };
      w.postMessage({ tipo: "separar", izquierda, derecha }, [izquierda.buffer, derecha.buffer]);
    });
    cancelar = null;
    publicar({ trabajo: { nombre, motor: r.motor, fase: "guardando" } });
    await escrituras;
    if (esMovil()) {
      // En el móvil se suelta ya la memoria del separador (la próxima vez se vuelve a preparar).
      trabajador?.terminate();
      trabajador = null;
    }

    const id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `c${Date.now().toString(36)}`;
    let bytes = 0;
    for (const { id: pista } of PISTAS) {
      const wav = crearWavDePartes(await leerBloques(pista, r.bloques), FRECUENCIA);
      await guardarAudio(id, pista as Pista, wav);
      bytes += wav.size;
    }
    const cancion: Cancion = {
      id,
      nombre,
      duracion,
      frames: r.frames,
      creada: Date.now(),
      bytes,
      motor: r.motor,
      segundosSeparando: Math.round((performance.now() - inicio) / 1000),
    };
    await guardarCancion(cancion, {} as Record<Pista, Blob>);
    void vaciarTemporal();
    quitarMarca();
    pedirPersistencia();
    publicar({ trabajo: null, terminada: cancion });
    return cancion;
  } catch (e) {
    cancelar = null;
    quitarMarca();
    void vaciarTemporal();
    const parada = (e as Error).message === "parada";
    if (!parada && trabajador) {
      // Tras un fallo el worker puede quedar a medias: se empieza limpio la próxima vez.
      trabajador.terminate();
      trabajador = null;
    }
    publicar({ trabajo: null, error: parada ? null : traducirError((e as Error).message) });
    return null;
  }
}

function traducirError(m: string): string {
  if (/quota|QuotaExceeded|lleno/i.test(m)) return "No cabe en el aparato. Borra alguna canción y vuelve a probar.";
  if (/fetch|network|Failed to fetch|descargar/i.test(m)) return "No se ha podido descargar el separador. Comprueba la conexión y vuelve a probar.";
  if (/memory|memoria|allocation|OOM/i.test(m)) return "El aparato se ha quedado sin memoria. Prueba con una canción más corta o desde el ordenador.";
  return m;
}
