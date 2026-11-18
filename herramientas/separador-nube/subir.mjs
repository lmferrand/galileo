// Crea (si falta) el Space «separador» en la cuenta de Hugging Face de la clave y sube esta
// carpeta. La clave se lee de un archivo y nunca se muestra.
// Uso: node subir.mjs <archivo-con-la-clave> [nombre-del-space]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = path.dirname(fileURLToPath(import.meta.url));
const [archivoClave, nombre = "separador"] = process.argv.slice(2);
if (!archivoClave) throw new Error("Falta el archivo con la clave.");
const clave = fs.readFileSync(archivoClave, "utf8").trim();
if (!/^hf_[A-Za-z0-9]{20,}$/.test(clave)) throw new Error("El archivo no tiene una clave de Hugging Face (empieza por hf_).");
const HUB = "https://huggingface.co";
const cabeceras = { Authorization: `Bearer ${clave}` };

async function pedir(url, opciones = {}) {
  const r = await fetch(url, { ...opciones, headers: { ...cabeceras, ...(opciones.headers ?? {}) } });
  const texto = await r.text();
  let datos = null;
  try {
    datos = JSON.parse(texto);
  } catch {
    datos = texto;
  }
  return { ok: r.ok, estado: r.status, datos };
}

const yo = await pedir(`${HUB}/api/whoami-v2`);
if (!yo.ok) throw new Error(`La clave no vale (${yo.estado}).`);
const usuario = yo.datos.name;
const permiso = yo.datos.auth?.accessToken?.role;
console.log(`Cuenta: ${usuario} · correo verificado: ${yo.datos.emailVerified ? "sí" : "NO"} · permiso de la clave: ${permiso}`);
if (permiso && permiso !== "write" && permiso !== "fineGrained") throw new Error("La clave es de solo lectura: hace falta una de tipo «Write».");

const repo = `${usuario}/${nombre}`;
const creado = await pedir(`${HUB}/api/repos/create`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ type: "space", name: nombre, private: false, sdk: "gradio" }),
});
if (creado.ok) console.log(`Space creado: ${repo}`);
else if (creado.estado === 409) console.log(`El Space ${repo} ya existía: se actualiza.`);
else throw new Error(`No se ha podido crear el Space (${creado.estado}): ${JSON.stringify(creado.datos).slice(0, 300)}`);

// Todo lo de esta carpeta menos este programa
const archivos = [];
(function recorrer(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const ruta = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "__pycache__") recorrer(ruta);
    } else if (e.name !== "subir.mjs") archivos.push(ruta);
  }
})(AQUI);

const lineas = [{ key: "header", value: { summary: "Separador de The Clavija", description: "" } }];
for (const ruta of archivos) {
  const relativa = path.relative(AQUI, ruta).split(path.sep).join("/");
  const contenido = fs.readFileSync(ruta).toString("utf8").replace(/\r\n/g, "\n");
  lineas.push({ key: "file", value: { path: relativa, content: Buffer.from(contenido, "utf8").toString("base64"), encoding: "base64" } });
  console.log(`  ${relativa}`);
}
const subida = await pedir(`${HUB}/api/spaces/${repo}/commit/main`, {
  method: "POST",
  headers: { "Content-Type": "application/x-ndjson" },
  body: lineas.map((l) => JSON.stringify(l)).join("\n"),
});
if (!subida.ok) throw new Error(`No se ha podido subir (${subida.estado}): ${JSON.stringify(subida.datos).slice(0, 300)}`);
console.log(`Subido. Página: ${HUB}/spaces/${repo}`);
console.log(`Dirección para la app: https://${repo.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.hf.space`);
