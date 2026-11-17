// Borra una canción de la nube (sus 6 pistas y su info.json).

import { asegurarBucket, BUCKET, idValido, PISTAS_NUBE, respuesta, sinPermiso, supabaseAdmin, usuarioDe } from "@/lib/nube/servidor";

export async function POST(req: Request) {
  const usuario = await usuarioDe(req);
  if (!usuario) return sinPermiso();
  const { id } = (await req.json().catch(() => ({}))) as { id?: unknown };
  if (!idValido(id)) return respuesta({ error: "Canción no válida." }, 400);
  try {
    await asegurarBucket();
    const rutas = [...PISTAS_NUBE.map((p) => `${usuario.id}/${id}/${p}.mp3`), `${usuario.id}/${id}/info.json`];
    const { error } = await supabaseAdmin().storage.from(BUCKET).remove(rutas);
    if (error) throw error;
    return respuesta({ ok: true });
  } catch (e) {
    return respuesta({ error: (e as Error).message || "No se ha podido borrar de la nube." }, 500);
  }
}
