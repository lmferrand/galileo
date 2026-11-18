// El PC del estudio (herramientas/separador/clavija-pc.mjs). Solo responde a su clave.
// POST { accion: "siguiente" | "estado" | "subir" | "hecho", aparato, id, ... }

import { asegurarBucket, BUCKET, idValido, respuesta, supabaseAdmin } from "@/lib/nube/servidor";
import {
  aparatosConEncargos,
  aparatoValido,
  borrarEncargo,
  CADUCA_MS,
  esElPC,
  guardarEncargo,
  latido,
  leerEncargo,
  listarEncargos,
  PISTAS,
  rutaAudio,
  rutaResultado,
  SIN_NOTICIAS_MS,
  type Encargo,
} from "@/lib/estudio/servidor";

export async function POST(req: Request) {
  if (!(await esElPC(req))) return respuesta({ error: "No autorizado." }, 401);
  const cuerpo = (await req.json().catch(() => ({}))) as {
    accion?: string;
    aparato?: unknown;
    id?: unknown;
    progreso?: unknown;
    error?: unknown;
    frames?: unknown;
    duracion?: unknown;
  };
  try {
    await asegurarBucket();
    const sb = supabaseAdmin().storage.from(BUCKET);

    if (cuerpo.accion === "siguiente") {
      await latido();
      const ahora = Date.now();
      let elegido: { ap: string; e: Encargo } | null = null;
      for (const ap of await aparatosConEncargos()) {
        for (const e of await listarEncargos(ap)) {
          // Lo que nadie recoge (o se quedó a medias subiendo) se borra
          if (ahora - e.actualizado > CADUCA_MS || (e.estado === "subiendo" && ahora - e.actualizado > 24 * 3600 * 1000)) {
            await borrarEncargo(ap, e);
            continue;
          }
          const libre = e.estado === "pendiente" || (e.estado === "separando" && ahora - e.actualizado > SIN_NOTICIAS_MS);
          if (libre && (!elegido || e.creada < elegido.e.creada)) elegido = { ap, e };
        }
      }
      if (!elegido) return respuesta({ trabajo: null });
      const { ap, e } = elegido;
      const { data, error } = await sb.createSignedUrl(rutaAudio(ap, e), 3600);
      if (error || !data) {
        await guardarEncargo(ap, { ...e, estado: "error", error: "No llegó la canción. Vuelve a mandarla." });
        return respuesta({ trabajo: null });
      }
      await guardarEncargo(ap, { ...e, estado: "separando", progreso: 0 });
      return respuesta({ trabajo: { aparato: ap, id: e.id, nombre: e.nombre, ext: e.ext, creada: e.creada, url: data.signedUrl } });
    }

    if (!aparatoValido(cuerpo.aparato) || !idValido(cuerpo.id)) return respuesta({ error: "Datos no válidos." }, 400);
    const ap = cuerpo.aparato;
    const id = cuerpo.id;
    const encargo = await leerEncargo(ap, id);
    if (!encargo) return respuesta({ error: "Ese encargo ya no está." }, 404);

    if (cuerpo.accion === "estado") {
      const progreso = typeof cuerpo.progreso === "number" ? Math.max(0, Math.min(1, cuerpo.progreso)) : encargo.progreso;
      const error = typeof cuerpo.error === "string" ? cuerpo.error.slice(0, 300) : undefined;
      await guardarEncargo(ap, { ...encargo, estado: error ? "error" : "separando", progreso, error });
      return respuesta({ ok: true });
    }
    if (cuerpo.accion === "subir") {
      const permisos: Record<string, { path: string; token: string }> = {};
      for (const archivo of [...PISTAS.map((p) => `${p}.mp3`), "info.json"]) {
        const { data, error } = await sb.createSignedUploadUrl(rutaResultado(ap, id, archivo), { upsert: true });
        if (error || !data) throw error ?? new Error("Sin permiso de subida.");
        permisos[archivo] = { path: data.path, token: data.token };
      }
      return respuesta({ bucket: BUCKET, permisos });
    }
    if (cuerpo.accion === "hecho") {
      const frames = typeof cuerpo.frames === "number" ? Math.round(cuerpo.frames) : undefined;
      const duracion = typeof cuerpo.duracion === "number" ? cuerpo.duracion : undefined;
      await guardarEncargo(ap, { ...encargo, estado: "listo", progreso: 1, frames, duracion, error: undefined });
      // La canción original ya no hace falta
      await sb.remove([rutaAudio(ap, encargo)]);
      return respuesta({ ok: true });
    }
    return respuesta({ error: "Acción no válida." }, 400);
  } catch (e) {
    return respuesta({ error: (e as Error).message || "Error en el servidor." }, 500);
  }
}
