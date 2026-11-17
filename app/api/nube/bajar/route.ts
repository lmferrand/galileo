// Enlaces temporales (1 hora) para descargar las 6 pistas de una canción.

import { asegurarBucket, BUCKET, idValido, PISTAS_NUBE, respuesta, sinPermiso, supabaseAdmin, usuarioDe } from "@/lib/nube/servidor";

export async function POST(req: Request) {
  const usuario = await usuarioDe(req);
  if (!usuario) return sinPermiso();
  const { id } = (await req.json().catch(() => ({}))) as { id?: unknown };
  if (!idValido(id)) return respuesta({ error: "Canción no válida." }, 400);
  try {
    await asegurarBucket();
    const rutas = PISTAS_NUBE.map((p) => `${usuario.id}/${id}/${p}.mp3`);
    const { data, error } = await supabaseAdmin().storage.from(BUCKET).createSignedUrls(rutas, 3600);
    if (error || !data) throw error ?? new Error("Sin enlaces.");
    const urls: Record<string, string> = {};
    data.forEach((d, i) => {
      if (d.signedUrl) urls[PISTAS_NUBE[i]] = d.signedUrl;
    });
    if (Object.keys(urls).length !== PISTAS_NUBE.length) return respuesta({ error: "A esta canción le faltan pistas en la nube." }, 404);
    return respuesta({ urls });
  } catch (e) {
    return respuesta({ error: (e as Error).message || "No se ha podido preparar la descarga." }, 500);
  }
}
