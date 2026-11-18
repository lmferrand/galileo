// La nube desde el navegador: tu sesión (cuenta de Clavija en Supabase) y las
// llamadas a /api/nube/*. Las pistas viajan en MP3 entre Supabase y el aparato.

import { createClient, type Session, type SupabaseClient } from "@supabase/supabase-js";
import type { Cancion, Pista } from "@/lib/pistas/tipos";

let cliente: SupabaseClient | null = null;

export function nube(): SupabaseClient {
  if (!cliente) {
    cliente = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "", {
      auth: { persistSession: true, autoRefreshToken: true, storageKey: "clavija-sesion" },
    });
  }
  return cliente;
}

export async function sesionActual(): Promise<Session | null> {
  try {
    const { data } = await nube().auth.getSession();
    return data.session;
  } catch {
    return null;
  }
}

export async function entrar(correo: string, contrasena: string) {
  const { error } = await nube().auth.signInWithPassword({ email: correo.trim(), password: contrasena });
  if (error) {
    if (/invalid login|invalid credentials/i.test(error.message)) throw new Error("El correo o la contraseña no son correctos.");
    if (/rate|too many/i.test(error.message)) throw new Error("Demasiados intentos. Espera un poco y vuelve a probar.");
    throw new Error("No se ha podido entrar. Comprueba la conexión.");
  }
}

export async function salir() {
  await nube().auth.signOut();
}

async function llamar<T>(ruta: string, cuerpo?: unknown): Promise<T> {
  const sesion = await sesionActual();
  if (!sesion) throw new Error("Entra con tu cuenta para usar la nube.");
  const res = await fetch(ruta, {
    method: cuerpo === undefined ? "GET" : "POST",
    headers: {
      Authorization: `Bearer ${sesion.access_token}`,
      ...(cuerpo === undefined ? {} : { "Content-Type": "application/json" }),
    },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const datos = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(datos.error || "La nube no responde. Vuelve a probar en un momento.");
  return datos;
}

/** Lo que se guarda de cada canción en la nube (info.json). */
export type InfoNube = Pick<Cancion, "id" | "nombre" | "duracion" | "frames" | "creada"> & { bytesMp3?: number; credito?: string };

export async function listarNube(): Promise<InfoNube[]> {
  const r = await llamar<{ canciones: InfoNube[] }>("/api/nube/lista");
  return r.canciones.sort((a, b) => b.creada - a.creada);
}

export async function permisosSubida(id: string) {
  return llamar<{ bucket: string; permisos: Record<string, { path: string; token: string }> }>("/api/nube/subir", { id });
}

export async function enlacesBajada(id: string) {
  const r = await llamar<{ urls: Record<Pista, string> }>("/api/nube/bajar", { id });
  return r.urls;
}

export async function borrarDeNube(id: string) {
  await llamar("/api/nube/borrar", { id });
}
