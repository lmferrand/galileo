// Sube las canciones «Para tocar» a la carpeta pública de Hugging Face (TheClavija/para-tocar):
// una carpeta por canción con sus 6 pistas y cancion.json, más catalogo.json (lo que lee la app,
// lib/pistas/paraTocar.ts) y la ficha README.md con los créditos. Las pistas van por LFS.
// Lee los .zip que hace la tanda del PC (paquetes-roformer.mjs con metadatos.json).
// Uso: node subir.mjs <carpeta-con-los-zip> <archivo-con-la-clave> [usuario/repo]
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const [carpeta, archivoClave, repo = "TheClavija/para-tocar"] = process.argv.slice(2);
if (!carpeta || !archivoClave) throw new Error("Uso: node subir.mjs <carpeta-con-los-zip> <archivo-con-la-clave> [usuario/repo]");
const clave = fs.readFileSync(archivoClave, "utf8").trim();
const HUB = "https://huggingface.co";
const AUT = { Authorization: `Bearer ${clave}` };
const PISTAS = ["voz", "guitarra", "bajo", "bateria", "piano", "resto"];
const ORDEN_ESTILOS = ["Blues", "Rock and roll", "Rock", "Funk", "Reggae", "Jazz y bossa", "Surf"];
const CREDITO = "Música de Kevin MacLeod (incompetech.com), licencia CC BY 4.0. Separada en pistas por The Clavija.";

function leerZip(buf) {
  const fin = buf.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (fin < 0) throw new Error("no es un .zip");
  const entradas = new Map();
  let p = buf.readUInt32LE(fin + 16);
  for (let i = 0, total = buf.readUInt16LE(fin + 10); i < total; i++) {
    const metodo = buf.readUInt16LE(p + 10), tam = buf.readUInt32LE(p + 20), local = buf.readUInt32LE(p + 42);
    const n = buf.readUInt16LE(p + 28), extra = buf.readUInt16LE(p + 30), comentario = buf.readUInt16LE(p + 32);
    const nombre = buf.toString("utf8", p + 46, p + 46 + n);
    if (metodo !== 0) throw new Error(`${nombre} va comprimido; se esperaba sin comprimir`);
    const ini = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
    entradas.set(nombre, buf.subarray(ini, ini + tam));
    p += 46 + n + extra + comentario;
  }
  return entradas;
}

const slug = (t) =>
  t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");

// 1. Lo que hay en los .zip
const canciones = [];
const archivos = [];
for (const z of fs.readdirSync(carpeta).filter((a) => a.endsWith(".zip")).sort()) {
  const e = leerZip(fs.readFileSync(path.join(carpeta, z)));
  const json = e.get("cancion.json");
  const faltan = PISTAS.filter((p) => !e.get(`${p}.mp3`)?.length);
  if (!json || faltan.length) {
    console.log(`  salto ${z}: le falta ${json ? faltan.join(", ") : "cancion.json"}`);
    continue;
  }
  const info = JSON.parse(json.toString("utf8"));
  const id = slug(info.nombre);
  const bytes = PISTAS.reduce((s, p) => s + e.get(`${p}.mp3`).length, 0);
  canciones.push({
    id,
    titulo: info.nombre,
    estilo: info.estilo ?? "Otros",
    autor: info.autor ?? "",
    licencia: info.licencia ?? "",
    ...(info.bpm ? { bpm: info.bpm } : {}),
    duracion: info.duracion,
    frames: info.frames,
    bytes,
    carpeta: id,
    credito: info.credito,
  });
  for (const p of PISTAS) archivos.push({ ruta: `${id}/${p}.mp3`, datos: e.get(`${p}.mp3`) });
  archivos.push({ ruta: `${id}/cancion.json`, datos: json });
}
const lugar = (s) => (ORDEN_ESTILOS.includes(s) ? ORDEN_ESTILOS.indexOf(s) : 99);
canciones.sort((a, b) => lugar(a.estilo) - lugar(b.estilo) || a.titulo.localeCompare(b.titulo, "es"));
const estilos = [...new Set(canciones.map((c) => c.estilo))];
const catalogo = { version: 1, actualizado: new Date().toISOString(), credito: CREDITO, estilos, canciones };
archivos.push({ ruta: "catalogo.json", datos: Buffer.from(JSON.stringify(catalogo, null, 2)) });

const ficha = `---
license: cc-by-4.0
pretty_name: The Clavija · Para tocar
language:
- es
tags:
- music
- audio
- stems
- backing-tracks
---

# The Clavija · Para tocar

Canciones libres separadas en 6 pistas (voz, guitarra, bajo, batería, piano y resto) para tocar
encima con la app **The Clavija** (https://the-clavija.vercel.app): quitas la guitarra o el bajo y tocas tú.

- Música: **Kevin MacLeod** (incompetech.com), licencia **CC BY 4.0** (https://creativecommons.org/licenses/by/4.0/).
- Cambios: cada canción está separada en pistas con BS-RoFormer SW (jarredou) y guardada en MP3 a 112 kbps.

| Estilo | Canción | Crédito |
|---|---|---|
${canciones.map((c) => `| ${c.estilo} | ${c.titulo} | «${c.titulo}», Kevin MacLeod (incompetech.com), CC BY 4.0 |`).join("\n")}
`;
archivos.push({ ruta: "README.md", datos: Buffer.from(ficha) });
console.log(`${canciones.length} canciones en ${estilos.length} estilos · ${(archivos.reduce((s, a) => s + a.datos.length, 0) / 1e6).toFixed(0)} MB`);

async function json(url, opciones) {
  const r = await fetch(url, opciones);
  const t = await r.text();
  if (!r.ok) throw new Error(`${r.status} en ${url.replace(HUB, "")}: ${t.slice(0, 300)}`);
  return t ? JSON.parse(t) : null;
}

// 2. Qué va por LFS (lo decide Hugging Face)
const modo = new Map();
for (let i = 0; i < archivos.length; i += 100) {
  const parte = archivos.slice(i, i + 100);
  const r = await json(`${HUB}/api/datasets/${repo}/preupload/main`, {
    method: "POST",
    headers: { ...AUT, "Content-Type": "application/json" },
    body: JSON.stringify({ files: parte.map((a) => ({ path: a.ruta, size: a.datos.length, sample: a.datos.subarray(0, 512).toString("base64") })) }),
  });
  for (const f of r.files) modo.set(f.path, f.uploadMode);
}
const lfs = archivos.filter((a) => modo.get(a.ruta) === "lfs").map((a) => ({ ...a, oid: sha256(a.datos), size: a.datos.length }));

// 3. Subir por LFS lo que aún no esté (Hugging Face no pide lo que ya tiene)
const LFS = { ...AUT, Accept: "application/vnd.git-lfs+json", "Content-Type": "application/vnd.git-lfs+json" };
let subidos = 0;
for (let i = 0; i < lfs.length; i += 100) {
  const parte = lfs.slice(i, i + 100);
  const r = await json(`${HUB}/datasets/${repo}.git/info/lfs/objects/batch`, {
    method: "POST",
    headers: LFS,
    body: JSON.stringify({ operation: "upload", transfers: ["basic", "multipart"], hash_algo: "sha256", ref: { name: "main" }, objects: parte.map(({ oid, size }) => ({ oid, size })) }),
  });
  const tareas = r.objects.filter((o) => o.actions?.upload);
  for (let k = 0; k < tareas.length; k += 4) {
    await Promise.all(
      tareas.slice(k, k + 4).map(async (o) => {
        const a = parte.find((x) => x.oid === o.oid);
        const { href, header = {} } = o.actions.upload;
        if (header.chunk_size) {
          // Por partes: cada parte a su dirección y al final se avisa con las etiquetas
          const tam = Number(header.chunk_size), partes = [];
          for (const [n, url] of Object.entries(header).filter(([n]) => /^\d+$/.test(n)).sort((x, y) => x[0] - y[0])) {
            const r2 = await fetch(url, { method: "PUT", body: a.datos.subarray((Number(n) - 1) * tam, Number(n) * tam) });
            if (!r2.ok) throw new Error(`parte ${n} de ${a.ruta}: ${r2.status}`);
            partes.push({ partNumber: Number(n), etag: r2.headers.get("etag") });
          }
          await json(href, { method: "POST", headers: LFS, body: JSON.stringify({ oid: a.oid, parts: partes }) });
        } else {
          const r2 = await fetch(href, { method: "PUT", headers: header, body: a.datos });
          if (!r2.ok) throw new Error(`${a.ruta}: ${r2.status} ${(await r2.text()).slice(0, 200)}`);
        }
        if (o.actions.verify) {
          await json(o.actions.verify.href, { method: "POST", headers: { ...LFS, ...(o.actions.verify.header ?? {}) }, body: JSON.stringify({ oid: a.oid, size: a.size }) });
        }
        subidos++;
      }),
    );
    process.stdout.write(`\r  pistas subidas: ${subidos}   `);
  }
}
console.log(`\n  ${subidos} archivos nuevos por LFS (${lfs.length - subidos} ya estaban)`);

// 4. Un solo cambio con todo
const lineas = [{ key: "header", value: { summary: `Para tocar: ${canciones.length} canciones`, description: "" } }];
for (const a of archivos) {
  if (modo.get(a.ruta) === "lfs") {
    const l = lfs.find((x) => x.ruta === a.ruta);
    lineas.push({ key: "lfsFile", value: { path: a.ruta, algo: "sha256", oid: l.oid, size: l.size } });
  } else {
    lineas.push({ key: "file", value: { path: a.ruta, content: a.datos.toString("base64"), encoding: "base64" } });
  }
}
const r = await json(`${HUB}/api/datasets/${repo}/commit/main`, {
  method: "POST",
  headers: { ...AUT, "Content-Type": "application/x-ndjson" },
  body: lineas.map((l) => JSON.stringify(l)).join("\n"),
});
console.log(`Subido: ${r?.commitUrl ?? `${HUB}/datasets/${repo}`}`);
