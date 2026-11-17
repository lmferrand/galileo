// Prepara la subida de una canción: devuelve un permiso de subida por archivo
// (las 6 pistas en MP3 y el info.json). El navegador sube directo a Supabase.

import { asegurarBucket, BUCKET, idValido, PISTAS_NUBE, respuesta, sinPermiso, supabaseAdmin, usuarioDe } from "@/lib/nube/servidor";

export async function POST(req: Request) {
  const usuario = await usuarioDe(req);
  if (!usuario) return sinPermiso();
  const { id } = (await req.json().catch(() => ({}))) as { id?: unknown };
  if (!idValido(id)) return respuesta({ error: "Canción no válida." }, 400);
  try {
    await asegurarBucket();
    const sb = supabaseAdmin();
    const archivos = [...PISTAS_NUBE.map((p) => `${p}.mp3`), "info.json"];
    const permisos: Record<string, { path: string; token: string }> = {};
    for (const archivo of archivos) {
      const ruta = `${usuario.id}/${id}/${archivo}`;
      const { data, error } = await sb.storage.from(BUCKET).createSignedUploadUrl(ruta, { upsert: true });
      if (error || !data) throw error ?? new Error("Sin permiso de subida.");
      permisos[archivo] = { path: data.path, token: data.token };
    }
    return respuesta({ bucket: BUCKET, permisos });
  } catch (e) {
    return respuesta({ error: (e as Error).message || "No se ha podido preparar la subida." }, 500);
  }
}
