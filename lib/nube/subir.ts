// Subir a la nube una canción separada en este aparato: cada pista se
// comprime a MP3 (en un worker) y se sube directa a Supabase con un permiso
// de un solo uso que da el servidor. Al final va el info.json.

import { actualizarCancion, leerAudios } from "@/lib/pistas/almacen";
import { leerWav } from "@/lib/pistas/wav";
import { PISTAS, type Cancion } from "@/lib/pistas/tipos";
import { nube, permisosSubida, type InfoNube } from "./cliente";

const KBPS = 112;

function codificar(datos: Int16Array): Promise<ArrayBuffer> {
  return new Promise((ok, mal) => {
    const w = new Worker("/codificador.worker.js", { type: "module" });
    w.onmessage = (e: MessageEvent) => {
      w.terminate();
      if (e.data.tipo === "hecho") ok(e.data.mp3);
      else mal(new Error(e.data.mensaje || "No se ha podido comprimir la pista."));
    };
    w.onerror = (e) => {
      w.terminate();
      mal(new Error(e.message || "No se ha podido comprimir la pista."));
    };
    w.postMessage({ datos, kbps: KBPS }, [datos.buffer]);
  });
}

export async function subirCancion(cancion: Cancion, alProgreso: (fraccion: number) => void) {
  const ids = PISTAS.map((p) => p.id);
  const { bucket, permisos } = await permisosSubida(cancion.id);
  const audios = await leerAudios(cancion.id, ids);
  const almacen = nube().storage.from(bucket);
  let bytesMp3 = 0;
  const pasos = ids.length * 2 + 1;
  let hecho = 0;

  for (const id of ids) {
    // Copia propia de las muestras: el worker se las queda.
    const datos = (await leerWav(audios[id])).slice();
    const mp3 = await codificar(datos);
    alProgreso(++hecho / pasos);
    const p = permisos[`${id}.mp3`];
    const { error } = await almacen.uploadToSignedUrl(p.path, p.token, new Blob([mp3], { type: "audio/mpeg" }), { contentType: "audio/mpeg", upsert: true });
    if (error) throw new Error("No se ha podido subir a la nube. Comprueba la conexión.");
    bytesMp3 += mp3.byteLength;
    alProgreso(++hecho / pasos);
  }

  const info: InfoNube = {
    id: cancion.id,
    nombre: cancion.nombre,
    duracion: cancion.duracion,
    frames: cancion.frames,
    creada: cancion.creada,
    bytesMp3,
  };
  const pi = permisos["info.json"];
  const { error } = await almacen.uploadToSignedUrl(pi.path, pi.token, new Blob([JSON.stringify(info)], { type: "application/json" }), {
    contentType: "application/json",
    upsert: true,
  });
  if (error) throw new Error("No se ha podido subir a la nube. Comprueba la conexión.");
  alProgreso(1);
  await actualizarCancion(cancion.id, { nube: true });
}
