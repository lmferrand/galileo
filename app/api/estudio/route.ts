// Mandar canciones a separar al estudio (el PC con BS-RoFormer) desde cualquier aparato.
// GET: tus encargos, tu puesto en la cola y si el estudio está encendido.
// POST { accion: "nuevo" | "listo" | "bajar" | "recibido" | "quitar", id, ... }

import { asegurarBucket, BUCKET, idValido, respuesta, supabaseAdmin } from "@/lib/nube/servidor";
import {
  aparatoDe,
  aparatosConEncargos,
  borrarEncargo,
  DURACION_MAX_S,
  EXT_AUDIO,
  guardarEncargo,
  LIMITE_ACTIVOS,
  leerEncargo,
  listarEncargos,
  PISTAS,
  rutaAudio,
  rutaResultado,
  ultimoLatido,
  type Encargo,
} from "@/lib/estudio/servidor";

const sinAparato = () => respuesta({ error: "Falta la clave de este aparato." }, 401);
const activo = (e: Encargo) => e.estado !== "listo" && e.estado !== "error";

export async function GET(req: Request) {
  const ap = await aparatoDe(req);
  if (!ap) return sinAparato();
  try {
    await asegurarBucket();
    const mios = await listarEncargos(ap);
    // Puesto en la cola de todo el estudio (por orden de llegada)
    const cola: { ap: string; id: string; creada: number }[] = [];
    if (mios.some((e) => e.estado === "pendiente")) {
      for (const otro of await aparatosConEncargos()) {
        const lista = otro === ap ? mios : await listarEncargos(otro);
        for (const e of lista) if (e.estado === "pendiente" || e.estado === "separando") cola.push({ ap: otro, id: e.id, creada: e.creada });
      }
      cola.sort((a, b) => a.creada - b.creada);
    }
    const encargos = mios.map((e) => ({ ...e, puesto: e.estado === "pendiente" ? cola.findIndex((c) => c.ap === ap && c.id === e.id) + 1 : undefined }));
    const visto = await ultimoLatido();
    return respuesta({ encargos, pcVistoHace: visto ? Date.now() - visto : null, limite: LIMITE_ACTIVOS, duracionMax: DURACION_MAX_S });
  } catch (e) {
    return respuesta({ error: (e as Error).message || "El estudio no responde." }, 500);
  }
}

export async function POST(req: Request) {
  const ap = await aparatoDe(req);
  if (!ap) return sinAparato();
  const cuerpo = (await req.json().catch(() => ({}))) as { accion?: string; id?: unknown; nombre?: unknown; ext?: unknown; duracion?: unknown };
  if (!idValido(cuerpo.id)) return respuesta({ error: "Canción no válida." }, 400);
  const id = cuerpo.id;
  try {
    await asegurarBucket();
    const sb = supabaseAdmin().storage.from(BUCKET);

    if (cuerpo.accion === "nuevo") {
      const ext = typeof cuerpo.ext === "string" ? cuerpo.ext.toLowerCase() : "";
      const nombre = typeof cuerpo.nombre === "string" ? cuerpo.nombre.trim().slice(0, 140) : "";
      const duracion = typeof cuerpo.duracion === "number" ? cuerpo.duracion : 0;
      if (!EXT_AUDIO.includes(ext) || !nombre) return respuesta({ error: "Ese archivo no es una canción (mp3, m4a, wav…)." }, 400);
      if (duracion > DURACION_MAX_S) return respuesta({ error: `Como mucho ${DURACION_MAX_S / 60} minutos por canción.` }, 400);
      const activos = (await listarEncargos(ap)).filter(activo).length;
      if (activos >= LIMITE_ACTIVOS) return respuesta({ error: `Puedes tener ${LIMITE_ACTIVOS} canciones a la vez en el estudio. Espera a que acabe alguna.` }, 429);
      const ahora = Date.now();
      await guardarEncargo(ap, { id, nombre, ext, creada: ahora, estado: "subiendo", actualizado: ahora });
      const { data, error } = await sb.createSignedUploadUrl(rutaAudio(ap, { id, ext }), { upsert: true });
      if (error || !data) throw error ?? new Error("Sin permiso de subida.");
      return respuesta({ bucket: BUCKET, path: data.path, token: data.token });
    }

    const encargo = await leerEncargo(ap, id);
    if (!encargo) return respuesta({ error: "Esa canción ya no está en el estudio." }, 404);

    if (cuerpo.accion === "listo") {
      if (encargo.estado === "subiendo") await guardarEncargo(ap, { ...encargo, estado: "pendiente" });
      return respuesta({ ok: true });
    }
    if (cuerpo.accion === "bajar") {
      if (encargo.estado !== "listo") return respuesta({ error: "Todavía no está separada." }, 409);
      const archivos = PISTAS.map((p) => `${p}.mp3`);
      const { data, error } = await sb.createSignedUrls(
        archivos.map((a) => rutaResultado(ap, id, a)),
        3600,
      );
      if (error || !data) throw error ?? new Error("Sin enlaces.");
      const urls: Record<string, string> = {};
      data.forEach((d, i) => {
        if (d.signedUrl) urls[PISTAS[i]] = d.signedUrl;
      });
      if (Object.keys(urls).length !== PISTAS.length) return respuesta({ error: "Faltan pistas de esta canción." }, 404);
      return respuesta({ urls, frames: encargo.frames, duracion: encargo.duracion });
    }
    if (cuerpo.accion === "recibido" || cuerpo.accion === "quitar") {
      await borrarEncargo(ap, encargo);
      return respuesta({ ok: true });
    }
    return respuesta({ error: "Acción no válida." }, 400);
  } catch (e) {
    return respuesta({ error: (e as Error).message || "El estudio no responde." }, 500);
  }
}
