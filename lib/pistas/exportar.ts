// Guardar tu backing track: mezcla las 6 pistas con el volumen que tengas
// puesto en cada una y lo convierte en un WAV para llevártelo.

import { leerAudios } from "./almacen";
import { FRECUENCIA, PISTAS, type Cancion } from "./tipos";
import { crearWav, leerWav } from "./wav";
import { limpiarBajo } from "./limpiarBajo";
import { separadaConRoformer } from "./importar";

const IDS = PISTAS.map((p) => p.id);

/**
 * `encima`: lo que grabaste en la Mesa (intercalado, −1 a 1, ya a FRECUENCIA), que se suma a la
 * canción desde el fotograma `desde`.
 */
export async function mezclarCancion(cancion: Cancion, ganancias: number[], encima?: { muestras: Float32Array; desde: number }): Promise<Blob> {
  const audios = await leerAudios(cancion.id, IDS);
  const leer = async () => {
    const d: Int16Array[] = [];
    for (const id of IDS) d.push(await leerWav(audios[id], cancion.frames));
    return d;
  };
  // Igual que al escucharla: los graves colados en otras pistas, al bajo
  let pistas = separadaConRoformer(cancion) ? await leer() : await limpiarBajo(await leer());
  if (pistas.some((p) => p.length === 0)) pistas = await leer();
  const suma = new Float32Array(cancion.frames * 2);
  for (let s = 0; s < IDS.length; s++) {
    const g = ganancias[s];
    if (g < 0.0001) continue;
    const datos = pistas[s];
    const n = Math.min(datos.length, suma.length);
    for (let i = 0; i < n; i++) suma[i] += datos[i] * g;
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
  return crearWav(salida, FRECUENCIA);
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

export function nombreArchivo(cancion: Cancion, ganancias: number[]): string {
  const limpio = cancion.nombre.replace(/[\\/:*?"<>|]+/g, " ").trim() || "Canción";
  return `${limpio} (${describirMezcla(ganancias)}).wav`;
}

export type ResultadoGuardar = "compartido" | "descargado" | "cancelado";

/** En el móvil abre el menú de compartir (Archivos, WhatsApp…); en el ordenador, descarga. */
export async function guardarArchivo(blob: Blob, nombre: string): Promise<ResultadoGuardar> {
  const archivo = new File([blob], nombre, { type: "audio/wav" });
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
