// «Para tocar»: canciones libres (CC BY) ya separadas, por estilos, para tocar la guitarra o el
// bajo encima. Viven en una carpeta pública de Hugging Face (TheClavija/para-tocar):
// catalogo.json y una carpeta por canción con sus 6 pistas en MP3 (las sube
// herramientas/para-tocar/subir.mjs). Al tocar una, se baja como la de ejemplo y queda en el aparato.

import { importarPistas } from "./importar";
import { PISTAS, type Cancion, type Pista } from "./tipos";

export const BASE_PARA_TOCAR = "https://huggingface.co/datasets/TheClavija/para-tocar/resolve/main/";

export interface TemaParaTocar {
  id: string;
  titulo: string;
  estilo: string;
  autor: string;
  licencia: string;
  bpm?: number;
  /** segundos */
  duracion: number;
  frames: number;
  /** lo que ocupan sus 6 pistas */
  bytes: number;
  carpeta: string;
  credito: string;
}

export interface CatalogoParaTocar {
  /** Autoría y licencia de toda la lista, para el pie */
  credito: string;
  estilos: string[];
  canciones: TemaParaTocar[];
}

/** El id con que se guarda en el aparato (así se sabe cuáles ya tienes). */
export const idParaTocar = (t: TemaParaTocar) => `tocar-${t.id}`;

export async function cargarCatalogo(): Promise<CatalogoParaTocar> {
  const r = await fetch(`${BASE_PARA_TOCAR}catalogo.json`, { cache: "no-cache" });
  if (!r.ok) throw new Error("No se ha podido cargar la lista. Comprueba la conexión.");
  const c = (await r.json()) as CatalogoParaTocar;
  if (!Array.isArray(c.canciones)) throw new Error("La lista ha llegado mal.");
  return c;
}

export function bajarTema(t: TemaParaTocar, alProgreso: (fraccion: number) => void): Promise<Cancion> {
  const urls = Object.fromEntries(PISTAS.map((p) => [p.id, `${BASE_PARA_TOCAR}${encodeURIComponent(t.carpeta)}/${p.id}.mp3`])) as Record<Pista, string>;
  return importarPistas(
    urls,
    // motor «roformer»: separadas con BS-RoFormer, no se les limpia el bajo al reproducir
    { id: idParaTocar(t), nombre: t.titulo, creada: Date.now(), credito: t.credito, motor: "roformer", frames: t.frames, duracion: t.duracion },
    alProgreso,
  );
}
