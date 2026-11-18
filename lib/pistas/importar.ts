// Canciones que llegan ya separadas, sin pasar por el separador: la de ejemplo,
// las de tu nube y los .zip que prepara el PC (uno por canción, con las 6 pistas
// en MP3 y cancion.json). Las pistas se guardan tal cual, comprimidas: ocupan
// unas diez veces menos que las que separa el aparato (WAV) y se descodifican
// al abrir la canción (leerWav).

import { guardarCancion } from "./almacen";
import { FRECUENCIA, PISTAS, type Cancion, type Pista } from "./tipos";
import { leerWav } from "./wav";

type Datos = Omit<Cancion, "duracion" | "frames" | "bytes"> & Partial<Pick<Cancion, "duracion" | "frames">>;

async function guardarYaSeparada(audios: Record<Pista, Blob>, datos: Datos): Promise<Cancion> {
  let frames = datos.frames;
  if (!frames) frames = (await leerWav(audios.voz)).length >> 1;
  const bytes = Object.values(audios).reduce((s, b) => s + b.size, 0);
  const cancion: Cancion = { ...datos, frames, duracion: datos.duracion ?? frames / FRECUENCIA, bytes };
  await guardarCancion(cancion, audios);
  return cancion;
}

/** Las 6 pistas en MP3 desde internet (la de ejemplo o una de tu nube). */
export async function importarPistas(urls: Record<Pista, string>, datos: Datos, alProgreso: (fraccion: number) => void): Promise<Cancion> {
  const audios = {} as Record<Pista, Blob>;
  for (const [i, p] of PISTAS.entries()) {
    const res = await fetch(urls[p.id]);
    if (!res.ok) throw new Error("No se han podido descargar las pistas. Comprueba la conexión.");
    audios[p.id] = new Blob([await res.arrayBuffer()], { type: res.headers.get("content-type") || "audio/mpeg" });
    alProgreso((i + 1) / PISTAS.length);
  }
  return guardarYaSeparada(audios, datos);
}

export const esPaquete = (archivo: File) => /\.zip$/i.test(archivo.name) || /zip/i.test(archivo.type);

/** Una canción ya separada en un .zip (lo prepara el PC: herramientas/separador/paquetes.mjs). */
export async function importarPaquete(archivo: File, datos: Omit<Datos, "nombre"> & { nombre: string }): Promise<Cancion> {
  const entradas = await leerZip(archivo);
  const buscar = (base: string) =>
    entradas.find((e) => {
      const nombre = e.nombre.split("/").pop() ?? "";
      return !nombre.startsWith(".") && nombre.replace(/\.[^.]+$/, "").toLowerCase() === base;
    });

  let info: { nombre?: string; frames?: number; duracion?: number } = {};
  const json = buscar("cancion");
  if (json) {
    try {
      info = JSON.parse(await (await abrir(json)).text());
    } catch {
      info = {};
    }
  }

  const audios = {} as Record<Pista, Blob>;
  for (const p of PISTAS) {
    const e = buscar(p.id);
    if (!e) throw new Error(`No es una canción separada: le falta la pista «${p.nombre}».`);
    const extension = e.nombre.split(".").pop()?.toLowerCase();
    // Copia propia de los datos: así no depende de que el archivo elegido siga ahí.
    const datosPista = await (await abrir(e)).arrayBuffer();
    audios[p.id] = new Blob([datosPista], { type: extension === "wav" ? "audio/wav" : extension === "m4a" ? "audio/mp4" : "audio/mpeg" });
  }

  return guardarYaSeparada(audios, {
    ...datos,
    nombre: (typeof info.nombre === "string" && info.nombre.trim()) || datos.nombre,
    frames: Number.isFinite(info.frames) && (info.frames as number) > 0 ? Math.round(info.frames as number) : undefined,
    duracion: Number.isFinite(info.duracion) && (info.duracion as number) > 0 ? info.duracion : undefined,
  });
}

// ---- ZIP: se lee el índice del final y cada archivo se corta del original sin cargarlo entero ----

interface EntradaZip {
  nombre: string;
  metodo: number;
  datos: Blob;
}

const NO_ES_ZIP = "Ese archivo no es un .zip de canción separada.";

async function leerZip(archivo: Blob): Promise<EntradaZip[]> {
  const largoCola = Math.min(archivo.size, 22 + 65535);
  const cola = new DataView(await archivo.slice(archivo.size - largoCola).arrayBuffer());
  let fin = -1;
  for (let i = largoCola - 22; i >= 0; i--) {
    if (cola.getUint32(i, true) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new Error(NO_ES_ZIP);
  const cuantas = cola.getUint16(fin + 10, true);
  const tamIndice = cola.getUint32(fin + 12, true);
  const inicioIndice = cola.getUint32(fin + 16, true);
  const indice = new DataView(await archivo.slice(inicioIndice, inicioIndice + tamIndice).arrayBuffer());
  const texto = new TextDecoder();
  const entradas: EntradaZip[] = [];
  let p = 0;
  for (let k = 0; k < cuantas; k++) {
    if (p + 46 > indice.byteLength || indice.getUint32(p, true) !== 0x02014b50) throw new Error(NO_ES_ZIP);
    const metodo = indice.getUint16(p + 10, true);
    const comprimido = indice.getUint32(p + 20, true);
    const largoNombre = indice.getUint16(p + 28, true);
    const largoExtra = indice.getUint16(p + 30, true);
    const largoComentario = indice.getUint16(p + 32, true);
    const local = indice.getUint32(p + 42, true);
    const nombre = texto.decode(new Uint8Array(indice.buffer, p + 46, largoNombre));
    p += 46 + largoNombre + largoExtra + largoComentario;
    if (nombre.endsWith("/")) continue;
    const cabecera = new DataView(await archivo.slice(local, local + 30).arrayBuffer());
    if (cabecera.getUint32(0, true) !== 0x04034b50) throw new Error(NO_ES_ZIP);
    const inicio = local + 30 + cabecera.getUint16(26, true) + cabecera.getUint16(28, true);
    entradas.push({ nombre, metodo, datos: archivo.slice(inicio, inicio + comprimido) });
  }
  return entradas;
}

async function abrir(e: EntradaZip): Promise<Blob> {
  if (e.metodo === 0) return e.datos;
  if (e.metodo === 8 && typeof DecompressionStream !== "undefined") {
    return new Response(e.datos.stream().pipeThrough(new DecompressionStream("deflate-raw"))).blob();
  }
  throw new Error("Ese .zip viene comprimido de una forma que este aparato no sabe abrir.");
}
