// Solo servidor. «El estudio»: el PC de Leonardo separa con BS-RoFormer (más calidad) las
// canciones que le manda cualquier usuario de la app, y se las devuelve a ese mismo aparato.
//
// Sin cuentas: cada aparato tiene una clave secreta propia (la guarda la app) y su carpeta
// es la huella de esa clave. Todo va en el bucket privado de la nube:
//   encargos/<aparato>/<id>.json     la ficha (estado, progreso…)
//   encargos/<aparato>/<id>.<ext>    la canción que sube el aparato
//   resultados/<aparato>/<id>/       las 6 pistas en MP3 + info.json que deja el PC
//   estudio/pc.json                  cuándo dio señales el PC por última vez
// El PC (herramientas/separador/clavija-pc.mjs) se identifica con su clave; aquí solo está
// su huella. Al recibir sus pistas, el aparato borra todo lo suyo; si no las recoge, se
// borran a los 7 días.

import { BUCKET, PISTAS_NUBE, supabaseAdmin } from "@/lib/nube/servidor";

/** Huella (SHA-256) de la clave del PC. La clave solo está en ese PC (C:\Users\lmfer\Clavija-PC). */
const HUELLA_PC = "c9a7f9aa04dbb664bd9d2daec7aa7fe2d70a616111d3c11f871e5352cc3f8b29";

export const LIMITE_ACTIVOS = 3;
export const DURACION_MAX_S = 10 * 60;
export const EXT_AUDIO = ["mp3", "m4a", "wav", "aac", "flac", "ogg", "opus"];
/** Si el PC deja de dar noticias de una que separaba, se vuelve a poner en la cola. */
export const SIN_NOTICIAS_MS = 10 * 60 * 1000;
/** Lo que nadie recoge se borra. */
export const CADUCA_MS = 7 * 24 * 3600 * 1000;
export const PISTAS = PISTAS_NUBE;

export interface Encargo {
  id: string;
  nombre: string;
  ext: string;
  creada: number;
  estado: "subiendo" | "pendiente" | "separando" | "listo" | "error";
  /** 0–1 mientras se separa */
  progreso?: number;
  error?: string;
  frames?: number;
  duracion?: number;
  actualizado: number;
}

export async function sha256(texto: string): Promise<string> {
  const datos = new TextEncoder().encode(texto);
  return Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", datos)), (b) => b.toString(16).padStart(2, "0")).join("");
}

function bearer(req: Request): string {
  const cabecera = req.headers.get("authorization") ?? "";
  return cabecera.startsWith("Bearer ") ? cabecera.slice(7) : "";
}

export async function esElPC(req: Request): Promise<boolean> {
  const clave = bearer(req);
  return clave.length >= 32 && (await sha256(clave)) === HUELLA_PC;
}

/** El aparato que llama: la huella de su clave (cabecera «X-Clavija-Aparato»), o null. */
export async function aparatoDe(req: Request): Promise<string | null> {
  const clave = req.headers.get("x-clavija-aparato") ?? "";
  if (!/^[0-9a-f]{32,128}$/.test(clave)) return null;
  return (await sha256(`aparato:${clave}`)).slice(0, 32);
}

export const aparatoValido = (a: unknown): a is string => typeof a === "string" && /^[0-9a-f]{32}$/.test(a);

const rutaFicha = (ap: string, id: string) => `encargos/${ap}/${id}.json`;
export const rutaAudio = (ap: string, e: Pick<Encargo, "id" | "ext">) => `encargos/${ap}/${e.id}.${e.ext}`;
export const rutaResultado = (ap: string, id: string, archivo: string) => `resultados/${ap}/${id}/${archivo}`;

export async function leerEncargo(ap: string, id: string): Promise<Encargo | null> {
  const { data } = await supabaseAdmin().storage.from(BUCKET).download(rutaFicha(ap, id));
  if (!data) return null;
  try {
    return JSON.parse(await data.text()) as Encargo;
  } catch {
    return null;
  }
}

export async function guardarEncargo(ap: string, e: Encargo) {
  const { error } = await supabaseAdmin()
    .storage.from(BUCKET)
    .upload(rutaFicha(ap, e.id), new Blob([JSON.stringify({ ...e, actualizado: Date.now() })], { type: "application/json" }), {
      upsert: true,
      contentType: "application/json",
    });
  if (error) throw error;
}

export async function listarEncargos(ap: string): Promise<Encargo[]> {
  const { data, error } = await supabaseAdmin().storage.from(BUCKET).list(`encargos/${ap}`, { limit: 100 });
  if (error) throw error;
  const ids = (data ?? []).filter((f) => f.name.endsWith(".json")).map((f) => f.name.slice(0, -5));
  const fichas = await Promise.all(ids.map((id) => leerEncargo(ap, id)));
  return fichas.filter((e): e is Encargo => !!e).sort((a, b) => a.creada - b.creada);
}

/** Todos los aparatos con algo encargado. */
export async function aparatosConEncargos(): Promise<string[]> {
  const { data } = await supabaseAdmin().storage.from(BUCKET).list("encargos", { limit: 1000 });
  return (data ?? []).filter((f) => !f.id && aparatoValido(f.name)).map((f) => f.name);
}

/** Borra la canción subida, la ficha y las pistas que dejó el PC. */
export async function borrarEncargo(ap: string, e: Pick<Encargo, "id" | "ext">) {
  const sb = supabaseAdmin().storage.from(BUCKET);
  await sb.remove([rutaFicha(ap, e.id), rutaAudio(ap, e), ...[...PISTAS.map((p) => `${p}.mp3`), "info.json"].map((a) => rutaResultado(ap, e.id, a))]);
}

export async function ultimoLatido(): Promise<number | null> {
  const { data } = await supabaseAdmin().storage.from(BUCKET).download("estudio/pc.json");
  if (!data) return null;
  try {
    return (JSON.parse(await data.text()) as { visto: number }).visto;
  } catch {
    return null;
  }
}

export async function latido() {
  await supabaseAdmin()
    .storage.from(BUCKET)
    .upload("estudio/pc.json", new Blob([JSON.stringify({ visto: Date.now() })], { type: "application/json" }), {
      upsert: true,
      contentType: "application/json",
    });
}
