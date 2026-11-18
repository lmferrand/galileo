// Solo servidor: acceso a Supabase con la clave de servicio (nunca llega al
// navegador). Cada usuario guarda sus canciones en <su id>/<canción>/ dentro de
// un bucket privado; nadie puede ver las de otro.

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export const BUCKET = "clavija-pistas";
export const PISTAS_NUBE = ["voz", "guitarra", "bajo", "bateria", "piano", "resto"] as const;

let admin: SupabaseClient | null = null;
let bucketListo = false;
const LIMITE_ARCHIVO = "50MB";
const LIMITE_BYTES = 50 * 1024 * 1024;

export function supabaseAdmin(): SupabaseClient {
  if (!admin) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !clave) throw new Error("Falta la configuración de Supabase en el servidor.");
    admin = createClient(url, clave, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  return admin;
}

/** El usuario de la sesión que manda el navegador (cabecera Authorization). */
export async function usuarioDe(req: Request): Promise<User | null> {
  const cabecera = req.headers.get("authorization") ?? "";
  const token = cabecera.startsWith("Bearer ") ? cabecera.slice(7) : "";
  if (!token) return null;
  const { data, error } = await supabaseAdmin().auth.getUser(token);
  return error ? null : data.user;
}

export async function asegurarBucket() {
  if (bucketListo) return;
  const sb = supabaseAdmin();
  const { data } = await sb.storage.getBucket(BUCKET);
  // Como mucho 50 MB por archivo: es el máximo del plan gratis de Supabase. Si el almacén
  // pide más que el plan (antes eran 60 MB), Supabase rechaza TODAS las subidas con
  // «The object exceeded the maximum allowed size».
  if (!data) {
    const { error } = await sb.storage.createBucket(BUCKET, { public: false, fileSizeLimit: LIMITE_ARCHIVO });
    if (error && !/exist/i.test(error.message)) throw error;
  } else if (data.file_size_limit !== LIMITE_BYTES) {
    const { error } = await sb.storage.updateBucket(BUCKET, { public: false, fileSizeLimit: LIMITE_ARCHIVO });
    if (error) throw error;
  }
  bucketListo = true;
}

export function idValido(id: unknown): id is string {
  return typeof id === "string" && /^[a-zA-Z0-9-]{4,64}$/.test(id);
}

export function respuesta(datos: unknown, estado = 200) {
  return Response.json(datos, { status: estado, headers: { "Cache-Control": "no-store" } });
}

export function sinPermiso() {
  return respuesta({ error: "Entra con tu cuenta para usar la nube." }, 401);
}
