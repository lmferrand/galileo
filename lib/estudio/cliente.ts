// El estudio desde la app: mandar canciones a separar al PC (BS-RoFormer, más calidad),
// ver cómo van y recibirlas en la biblioteca de este aparato. Sin cuentas: el aparato
// tiene su propia clave secreta (se guarda aquí, en el navegador).

import { nube } from "@/lib/nube/cliente";
import { importarPistas } from "@/lib/pistas/importar";
import type { Cancion, Pista } from "@/lib/pistas/tipos";

const CLAVE = "clavija-aparato";
const CREDITO = "Separada en el estudio con BS-RoFormer SW (jarredou), licencia CC BY-NC-SA 4.0.";

export interface EncargoEstudio {
  id: string;
  nombre: string;
  creada: number;
  estado: "subiendo" | "pendiente" | "separando" | "listo" | "error";
  progreso?: number;
  error?: string;
  puesto?: number;
  frames?: number;
  duracion?: number;
}

export interface EstadoEstudio {
  encargos: EncargoEstudio[];
  /** ms desde la última señal del PC, o null si nunca */
  pcVistoHace: number | null;
  limite: number;
  duracionMax: number;
}

function claveAparato(): string {
  let c = localStorage.getItem(CLAVE);
  if (!c || !/^[0-9a-f]{64}$/.test(c)) {
    const b = new Uint8Array(32);
    crypto.getRandomValues(b);
    c = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
    localStorage.setItem(CLAVE, c);
  }
  return c;
}

async function llamar<T>(cuerpo?: unknown): Promise<T> {
  const res = await fetch("/api/estudio", {
    method: cuerpo === undefined ? "GET" : "POST",
    headers: { "X-Clavija-Aparato": claveAparato(), ...(cuerpo === undefined ? {} : { "Content-Type": "application/json" }) },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    cache: "no-store",
  });
  const datos = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(datos.error || "El estudio no responde. Comprueba la conexión.");
  return datos;
}

export const estadoEstudio = () => llamar<EstadoEstudio>();

/** El estudio está encendido si el PC ha dado señales hace poco. */
export const estudioEncendido = (e: EstadoEstudio | null) => !!e && e.pcVistoHace !== null && e.pcVistoHace < 2 * 60 * 1000;

function duracionDe(archivo: File): Promise<number> {
  return new Promise((ok) => {
    const url = URL.createObjectURL(archivo);
    const a = new Audio();
    const fin = (d: number) => {
      URL.revokeObjectURL(url);
      ok(d);
    };
    a.preload = "metadata";
    a.onloadedmetadata = () => fin(Number.isFinite(a.duration) ? a.duration : 0);
    a.onerror = () => fin(0);
    a.src = url;
  });
}

/** Sube una canción al estudio. Devuelve su id. */
export async function mandarAlEstudio(archivo: File, nombre: string): Promise<string> {
  const id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `e${Date.now().toString(36)}`;
  const ext = (archivo.name.split(".").pop() ?? "").toLowerCase();
  const duracion = await duracionDe(archivo);
  const { bucket, path, token } = await llamar<{ bucket: string; path: string; token: string }>({ accion: "nuevo", id, nombre, ext, duracion });
  const { error } = await nube().storage.from(bucket).uploadToSignedUrl(path, token, archivo, { contentType: archivo.type || "audio/mpeg", upsert: true });
  if (error) {
    await llamar({ accion: "quitar", id }).catch(() => undefined);
    throw new Error("No se ha podido subir la canción. Comprueba la conexión.");
  }
  await llamar({ accion: "listo", id });
  return id;
}

/** Trae a la biblioteca una canción que el estudio ya separó y la borra del estudio. */
export async function recogerDelEstudio(e: EncargoEstudio, alProgreso: (f: number) => void): Promise<Cancion> {
  const r = await llamar<{ urls: Record<Pista, string>; frames?: number; duracion?: number }>({ accion: "bajar", id: e.id });
  const cancion = await importarPistas(
    r.urls,
    { id: e.id, nombre: e.nombre, creada: Date.now(), motor: "roformer", credito: CREDITO, frames: r.frames, duracion: r.duracion },
    alProgreso,
  );
  await llamar({ accion: "recibido", id: e.id }).catch(() => undefined);
  return cancion;
}

export const quitarDelEstudio = (id: string) => llamar({ accion: "quitar", id });
