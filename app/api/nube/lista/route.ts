// Canciones que el usuario tiene en la nube (lee el info.json de cada una).

import { asegurarBucket, BUCKET, respuesta, sinPermiso, supabaseAdmin, usuarioDe } from "@/lib/nube/servidor";

export async function GET(req: Request) {
  const usuario = await usuarioDe(req);
  if (!usuario) return sinPermiso();
  try {
    await asegurarBucket();
    const sb = supabaseAdmin();
    const { data: carpetas, error } = await sb.storage.from(BUCKET).list(usuario.id, { limit: 500 });
    if (error) throw error;
    const ids = (carpetas ?? []).filter((c) => !c.id).map((c) => c.name);
    const canciones = await Promise.all(
      ids.map(async (id) => {
        const { data } = await sb.storage.from(BUCKET).download(`${usuario.id}/${id}/info.json`);
        if (!data) return null;
        try {
          return JSON.parse(await data.text());
        } catch {
          return null;
        }
      }),
    );
    return respuesta({ canciones: canciones.filter(Boolean) });
  } catch (e) {
    return respuesta({ error: (e as Error).message || "No se ha podido leer la nube." }, 500);
  }
}
