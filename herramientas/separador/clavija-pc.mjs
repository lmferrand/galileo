// El estudio: este PC separa con BS-RoFormer las canciones que le mandan desde la app
// y se las devuelve a quien las mandó. Se deja abierto; pregunta cada 15 s si hay algo.
// Uso (desde su carpeta, con token.txt, config.json y el modelo al lado):
//   node clavija-pc.mjs
// config.json: { "servidor": "https://galileomusic.vercel.app", "supabaseUrl": "…", "anonKey": "…",
//                "modelo": "bs_roformer_sw_fp32.onnx", "hilos": 7 }

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { crearSeparador, leerCancion, ORDEN_ZIP, SR } from "./roformer-nucleo.mjs";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const config = JSON.parse(fs.readFileSync(path.join(AQUI, "config.json"), "utf8"));
const CLAVE = fs.readFileSync(path.join(AQUI, "token.txt"), "utf8").trim();
const CREDITO = "Separada en el estudio con BS-RoFormer SW (jarredou), licencia CC BY-NC-SA 4.0.";
const ESPERA_MS = 15000;
const DURACION_MAX_S = 12 * 60;

const hora = () => new Date().toLocaleTimeString("es-ES");
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function pc(accion, datos = {}) {
  const res = await fetch(`${config.servidor}/api/estudio/pc`, {
    method: "POST",
    headers: { Authorization: `Bearer ${CLAVE}`, "Content-Type": "application/json" },
    body: JSON.stringify({ accion, ...datos }),
  });
  const r = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(r.error || `El servidor respondió ${res.status}`);
  return r;
}

async function subir(bucket, permiso, datos, tipo) {
  const url = `${config.supabaseUrl}/storage/v1/object/upload/sign/${bucket}/${permiso.path}?token=${encodeURIComponent(permiso.token)}`;
  const res = await fetch(url, {
    method: "PUT",
    headers: { "Content-Type": tipo, "x-upsert": "true", apikey: config.anonKey, Authorization: `Bearer ${config.anonKey}` },
    body: datos,
  });
  if (!res.ok) throw new Error(`No se pudo subir (${res.status}): ${(await res.text()).slice(0, 200)}`);
}

console.log(`[${hora()}] Cargando el separador…`);
const { separar } = await crearSeparador(path.join(AQUI, config.modelo), config.hilos);
console.log(`[${hora()}] El estudio está abierto. Esperando canciones…`);

let avisoError = 0;
for (;;) {
  let trabajo = null;
  try {
    trabajo = (await pc("siguiente")).trabajo;
    avisoError = 0;
  } catch (e) {
    if (Date.now() - avisoError > 10 * 60 * 1000) {
      console.log(`[${hora()}] Sin conexión con la app: ${e.message}`);
      avisoError = Date.now();
    }
  }
  if (!trabajo) {
    await dormir(ESPERA_MS);
    continue;
  }
  const { aparato, id, nombre, ext } = trabajo;
  const t0 = Date.now();
  console.log(`[${hora()}] «${nombre}»: separando…`);
  try {
    const res = await fetch(trabajo.url);
    if (!res.ok) throw new Error("No se pudo bajar la canción.");
    const buf = Buffer.from(await res.arrayBuffer());
    const { L, R } = await leerCancion(buf, ext === "mp3");
    if (L.length / SR > DURACION_MAX_S) throw new Error("La canción es demasiado larga.");
    let ultimoAviso = 0;
    const pistas = await separar(L, R, async (hecho, total) => {
      if (Date.now() - ultimoAviso > 8000 || hecho === total) {
        ultimoAviso = Date.now();
        await pc("estado", { aparato, id, progreso: (hecho / total) * 0.95 }).catch(() => undefined);
      }
    });
    const { bucket, permisos } = await pc("subir", { aparato, id });
    for (const p of ORDEN_ZIP) await subir(bucket, permisos[`${p}.mp3`], pistas[p], "audio/mpeg");
    const info = { id, nombre, frames: L.length, duracion: L.length / SR, separador: "roformer", credito: CREDITO };
    await subir(bucket, permisos["info.json"], Buffer.from(JSON.stringify(info)), "application/json");
    await pc("hecho", { aparato, id, frames: L.length, duracion: L.length / SR });
    console.log(`[${hora()}] «${nombre}»: lista en ${((Date.now() - t0) / 60000).toFixed(1)} min y devuelta.`);
  } catch (e) {
    console.log(`[${hora()}] «${nombre}»: ERROR ${e.message}`);
    await pc("estado", { aparato, id, error: "No se ha podido separar en el estudio. Prueba con otro archivo." }).catch(() => undefined);
  }
}
