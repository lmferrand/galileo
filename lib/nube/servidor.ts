// Solo servidor: acceso a Supabase con la clave de servicio (nunca llega al
// navegador). Cada usuario guarda sus canciones en <su id>/<canción>/ dentro de
// un bucket privado; nadie puede ver las de otro.

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

export const BUCKET = "clavija-pistas";
export const PISTAS_NUBE = ["voz", "guitarra", "bajo", "bateria", "piano", "resto"] as const;

let admin: SupabaseClient | null = null;
let bucketListo = false;

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
  if (!data) {
    const { error } = await sb.storage.createBucket(BUCKET, { public: false, fileSizeLimit: "60MB" });
    if (error && !/exist/i.test(error.message)) throw error;
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
