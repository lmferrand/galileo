// Canciones que llegan ya separadas, sin pasar por el separador: la de ejemplo,
// las de tu nube y los .zip que prepara el PC (uno por canción, con las 6 pistas
// en MP3 y cancion.json). Las pistas se guardan tal cual, comprimidas: ocupan
// unas diez veces menos que las que separa el aparato (WAV) y se descodifican
// al abrir la canción (leerWav).

import { guardarCancion } from "./almacen";
import { FRECUENCIA, PISTAS, type Cancion, type Pista } from "./tipos";
import { leerWav } from "./wav";
import { nombreBonito } from "./separar";

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

const EXT_AUDIO = /\.(mp3|m4a|wav|aac|flac|ogg|opus)$/i;
const base = (ruta: string) => ruta.split("/").pop() ?? "";
const sinExtension = (nombre: string) => nombre.replace(/\.[^.]+$/, "");
// Lo que añaden el Mac y otros programas al comprimir (__MACOSX, ._algo, .DS_Store).
const oculto = (ruta: string) => ruta.split("/").some((p) => p.startsWith(".") || p === "__MACOSX");
const tipoAudio = (nombre: string) => {
  const ext = nombre.split(".").pop()?.toLowerCase();
  return ext === "wav" ? "audio/wav" : ext === "m4a" || ext === "aac" ? "audio/mp4" : ext === "flac" ? "audio/flac" : ext === "ogg" || ext === "opus" ? "audio/ogg" : "audio/mpeg";
};

/** Una canción ya separada que viene dentro de un .zip (se abre al añadirla). */
export interface CancionEnZip {
  nombre: string;
  entradas: () => Promise<EntradaZip[]>;
}

/**
 * Lo que trae un .zip: canciones ya separadas (las 6 pistas en una carpeta, o un .zip
 * por canción dentro) y archivos de música sueltos, que se separan como si los eligieras.
 */
export async function contenidoZip(archivo: Blob, nombreZip: string): Promise<{ separadas: CancionEnZip[]; audios: File[] }> {
  const entradas = (await leerZip(archivo)).filter((e) => !oculto(e.nombre));
  const separadas: CancionEnZip[] = [];
  const audios: File[] = [];
  const usadas = new Set<EntradaZip>();

  // Cada carpeta con las 6 pistas es una canción ya separada.
  const porCarpeta = new Map<string, EntradaZip[]>();
  for (const e of entradas) {
    const carpeta = e.nombre.includes("/") ? e.nombre.slice(0, e.nombre.lastIndexOf("/")) : "";
    const lista = porCarpeta.get(carpeta) ?? [];
    lista.push(e);
    porCarpeta.set(carpeta, lista);
  }
  for (const [carpeta, lista] of porCarpeta) {
    const pistas = PISTAS.map((p) => lista.find((e) => EXT_AUDIO.test(e.nombre) && sinExtension(base(e.nombre)).toLowerCase() === p.id));
    if (pistas.some((e) => !e)) continue;
    const json = lista.find((e) => base(e.nombre).toLowerCase() === "cancion.json");
    const suyas = [...(pistas as EntradaZip[]), ...(json ? [json] : [])];
    suyas.forEach((e) => usadas.add(e));
    separadas.push({ nombre: nombreBonito(carpeta ? base(carpeta) : nombreZip), entradas: async () => suyas });
  }

  for (const e of entradas) {
    if (usadas.has(e)) continue;
    const nombre = base(e.nombre);
    if (/\.zip$/i.test(nombre)) {
      // Un .zip dentro: una canción ya separada. Se abre al añadirla, de una en una.
      separadas.push({ nombre: nombreBonito(nombre), entradas: async () => (await leerZip(await abrir(e))).filter((x) => !oculto(x.nombre)) });
    } else if (EXT_AUDIO.test(nombre)) {
      audios.push(new File([await abrir(e)], nombre, { type: tipoAudio(nombre) }));
    }
  }
  return { separadas, audios };
}

/** Una canción ya separada: sus 6 pistas (y cancion.json si lo trae) pasan a la biblioteca. */
export async function importarSeparada(cancion: CancionEnZip, datos: Omit<Datos, "nombre"> & { nombre: string }): Promise<Cancion> {
  const entradas = await cancion.entradas();
  const buscar = (nombre: string) => entradas.find((e) => sinExtension(base(e.nombre)).toLowerCase() === nombre);

  let info: { nombre?: string; frames?: number; duracion?: number; separador?: string; credito?: string } = {};
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
    if (!e || !EXT_AUDIO.test(e.nombre)) throw new Error(`No es una canción separada: le falta la pista «${p.nombre}».`);
    // Copia propia de los datos: así no depende de que el archivo elegido siga ahí.
    const datosPista = await (await abrir(e)).arrayBuffer();
    audios[p.id] = new Blob([datosPista], { type: tipoAudio(e.nombre) });
  }

  return guardarYaSeparada(audios, {
    ...datos,
    nombre: (typeof info.nombre === "string" && info.nombre.trim()) || datos.nombre,
    frames: Number.isFinite(info.frames) && (info.frames as number) > 0 ? Math.round(info.frames as number) : undefined,
    duracion: Number.isFinite(info.duracion) && (info.duracion as number) > 0 ? info.duracion : undefined,
    // Con qué se separó en el PC (p. ej. «roformer») y su crédito (licencia del separador)
    ...(typeof info.separador === "string" ? { motor: info.separador } : {}),
    ...(typeof info.credito === "string" ? { credito: info.credito } : {}),
  });
}

/** Separada en el PC con BS-RoFormer: ya reparte bien los graves (no hace falta limpiar el bajo). */
export const separadaConRoformer = (c: { motor?: string }) => c.motor === "roformer";

// ---- ZIP: se lee el índice del final y cada archivo se corta del original sin cargarlo entero ----

export interface EntradaZip {
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
