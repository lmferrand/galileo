// Guardar tu backing track: mezcla las 6 pistas con el volumen que tengas
// puesto en cada una (y tus tomas añadidas) y lo convierte en un archivo para llevártelo: MP3 (pesa
// unas 9 veces menos, para mandarlo) o WAV (sin comprimir); lo eliges tú (lib/pistas/formato).
// El MP3 lo hace un worker (public/codificador.worker.js, el mismo que comprime para la nube) que
// carga el codificador de internet: sin conexión no se puede y el archivo sale en WAV.

import { leerPistasDeCancion } from "./cargar";
import { gananciaDeToma, leerTomasDeCancion } from "./tomas";
import { FRECUENCIA, PISTAS, type Cancion } from "./tipos";
import { crearWav } from "./wav";
import { tomaInt16, wavDeToma, type Toma } from "../mesa/toma";
import type { Formato } from "./formato";

const IDS = PISTAS.map((p) => p.id);
/** Calidad del MP3 (kilobits por segundo): 1,2 MB por minuto; el WAV, 10,6 */
const KBPS = 160;

/** Un archivo listo para llevarse: si se pidió MP3 y no se ha podido, viene en WAV y `aviso` lo dice. */
export interface Archivo {
  blob: Blob;
  formato: Formato;
  aviso?: string;
}

/** Por dónde va el MP3 (de 0 a 1): tarda unos segundos en un ordenador y hasta un minuto en un móvil */
export type AlProgreso = (hecho: number) => void;

/** Comprime a MP3 (Int16 estéreo intercalado a 44,1 kHz). Las muestras se transfieren al worker. */
function aMp3(datos: Int16Array, alProgreso?: AlProgreso): Promise<Blob> {
  return new Promise((ok, mal) => {
    let w: Worker;
    try {
      w = new Worker("/codificador.worker.js", { type: "module" });
    } catch (e) {
      mal(e);
      return;
    }
    const acabar = () => {
      clearTimeout(tope);
      w.terminate();
    };
    // Una canción larga en un móvil lento puede tardar más de un minuto
    const tope = setTimeout(() => {
      acabar();
      mal(new Error("El MP3 tarda demasiado."));
    }, 240_000);
    w.onmessage = (e: MessageEvent) => {
      if (e.data?.tipo === "progreso") return alProgreso?.(Number(e.data.hecho) || 0);
      acabar();
      if (e.data?.tipo === "hecho") ok(new Blob([e.data.mp3], { type: "audio/mpeg" }));
      else mal(new Error(e.data?.mensaje || "No se ha podido hacer el MP3."));
    };
    w.onerror = (e) => {
      acabar();
      mal(new Error(e.message || "No se ha podido hacer el MP3."));
    };
    w.postMessage({ datos, kbps: KBPS, progreso: !!alProgreso }, [datos.buffer]);
  });
}

/** El audio (Int16 estéreo intercalado a FRECUENCIA) en el formato pedido. */
export async function empaquetar(datos: Int16Array, formato: Formato, alProgreso?: AlProgreso): Promise<Archivo> {
  if (formato === "mp3") {
    try {
      // Una copia para el worker: si falla, el WAV sale de las muestras de aquí
      return { blob: await aMp3(datos.slice(), alProgreso), formato: "mp3" };
    } catch {
      return { blob: crearWav(datos, FRECUENCIA), formato: "wav", aviso: "No se ha podido hacer el MP3 (hace falta conexión): va en WAV." };
    }
  }
  return { blob: crearWav(datos, FRECUENCIA), formato: "wav" };
}

/** Solo la toma, en el formato pedido. */
export async function archivoDeToma(t: Toma, formato: Formato, alProgreso?: AlProgreso): Promise<Archivo> {
  if (formato === "wav") return { blob: wavDeToma(t), formato: "wav" };
  return empaquetar(tomaInt16(t, FRECUENCIA), "mp3", alProgreso);
}

/**
 * La canción como suena: sus pistas con su volumen y tus tomas añadidas (lib/pistas/tomas) con el suyo.
 * `encima`: lo que grabaste en la Mesa (intercalado, −1 a 1, ya a FRECUENCIA), que se suma a la
 * canción desde el fotograma `desde`.
 */
export async function mezclarCancion(cancion: Cancion, ganancias: number[], encima?: { muestras: Float32Array; desde: number }, formato: Formato = "wav", alProgreso?: AlProgreso): Promise<Archivo> {
  // Igual que al escucharla: los graves colados en otras pistas, al bajo
  const pistas = await leerPistasDeCancion(cancion);
  if (!pistas) throw new Error("No se han podido leer las pistas de la canción.");
  const suma = new Float32Array(cancion.frames * 2);
  for (let s = 0; s < IDS.length; s++) {
    const g = ganancias[s];
    if (g < 0.0001) continue;
    const datos = pistas[s];
    const n = Math.min(datos.length, suma.length);
    for (let i = 0; i < n; i++) suma[i] += datos[i] * g;
  }
  // Tus tomas añadidas, cada una desde su sitio
  for (const { ficha, datos } of await leerTomasDeCancion(cancion.id).catch(() => [])) {
    const g = gananciaDeToma(ficha);
    if (g < 0.0001) continue;
    const ini = Math.max(0, ficha.desde) * 2;
    const n = Math.min(datos.length, suma.length - ini);
    for (let i = 0; i < n; i++) suma[ini + i] += datos[i] * g;
  }
  if (encima) {
    const ini = Math.max(0, Math.round(encima.desde)) * 2;
    const n = Math.min(encima.muestras.length, suma.length - ini);
    for (let i = 0; i < n; i++) suma[ini + i] += encima.muestras[i] * 32767;
  }
  const salida = new Int16Array(suma.length);
  for (let i = 0; i < suma.length; i++) {
    const v = Math.round(suma[i]);
    salida[i] = v > 32767 ? 32767 : v < -32768 ? -32768 : v;
  }
  return empaquetar(salida, formato, alProgreso);
}

/** «sin guitarra», «sin guitarra ni voz», «solo bajo»… para el nombre del archivo. */
export function describirMezcla(ganancias: number[]): string {
  const fuera = PISTAS.filter((_, i) => ganancias[i] < 0.0001).map((p) => p.nombre.toLowerCase());
  const dentro = PISTAS.filter((_, i) => ganancias[i] >= 0.0001).map((p) => p.nombre.toLowerCase());
  if (fuera.length === 0) return "mezcla";
  if (dentro.length === 0) return "silencio";
  const lista = (xs: string[], y: string) => (xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(", ")} ${y} ${xs[xs.length - 1]}`);
  if (dentro.length <= 2) return `solo ${lista(dentro, "y")}`;
  return `sin ${lista(fuera, "ni")}`;
}

export function nombreArchivo(cancion: Cancion, ganancias: number[], formato: Formato = "wav"): string {
  const limpio = cancion.nombre.replace(/[\\/:*?"<>|]+/g, " ").trim() || "Canción";
  return `${limpio} (${describirMezcla(ganancias)}).${formato}`;
}

export type ResultadoGuardar = "compartido" | "descargado" | "cancelado";

/** En el móvil abre el menú de compartir (Archivos, WhatsApp…); en el ordenador, descarga. */
export async function guardarArchivo(blob: Blob, nombre: string): Promise<ResultadoGuardar> {
  const archivo = new File([blob], nombre, { type: /\.mp3$/i.test(nombre) ? "audio/mpeg" : "audio/wav" });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const esMovil = /iPhone|iPad|Android/i.test(navigator.userAgent);
  if (esMovil && nav.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: nombre });
      return "compartido";
    } catch (e) {
      if ((e as DOMException)?.name === "AbortError") return "cancelado";
      // Si el navegador no deja compartir, se descarga.
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
  return "descargado";
}
