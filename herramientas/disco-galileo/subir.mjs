// Sube el disco de Galileo («Mañana…») a su carpeta pública de Hugging Face (TheClavija/galileo-manana):
// una carpeta por canción con sus 6 pistas en MP3 y cancion.json, más la ficha README.md. De ahí las
// baja la app al tocarlas en el estuche del escritorio de la Mesa (lib/pistas/discoGalileo.ts).
// Lee los .zip que deja el separador del PC (herramientas/separador/paquetes-roformer.mjs), que se
// llaman «NN Título.zip»: el número dice cuál es. Al acabar escribe por pantalla las líneas de
// `temas` para pegar en lib/pistas/discoGalileo.ts (duración, frames y lo que ocupa cada una).
// Uso: node subir.mjs <carpeta-con-los-zip> <archivo-con-la-clave> [usuario/repo] [--solo-lista]
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const soloLista = args.includes("--solo-lista");
const [carpeta, archivoClave, repo = "TheClavija/galileo-manana"] = args.filter((a) => !a.startsWith("--"));
if (!carpeta || (!archivoClave && !soloLista)) throw new Error("Uso: node subir.mjs <carpeta-con-los-zip> <archivo-con-la-clave> [usuario/repo] [--solo-lista]");
const HUB = "https://huggingface.co";
const PISTAS = ["voz", "guitarra", "bajo", "bateria", "piano", "resto"];
/** El disco, en su orden: el número con que empieza el .zip → id (su carpeta) y título */
const TEMAS = [
  ["loco", "Loco"],
  ["un-segundo-mas", "Un segundo más"],
  ["manana", "Mañana"],
  ["no-mirar-atras", "No mirar atrás"],
  ["ultimo-cafe", "Último café"],
  ["descuido", "Descuido"],
  ["barco-de-papel", "Barco de Papel"],
  ["me-escape", "Me escapé"],
  ["confundido", "Confundido"],
];

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
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");

// 1. Lo que hay en los .zip
const temas = [];
const archivos = [];
for (const z of fs.readdirSync(carpeta).filter((a) => a.endsWith(".zip")).sort()) {
  const n = Number(z.slice(0, 2));
  const tema = TEMAS[n - 1];
  if (!tema) {
    console.log(`  salto ${z}: no empieza por el número de una canción del disco`);
    continue;
  }
  const e = leerZip(fs.readFileSync(path.join(carpeta, z)));
  const json = e.get("cancion.json");
  const faltan = PISTAS.filter((p) => !e.get(`${p}.mp3`)?.length);
  if (!json || faltan.length) {
    console.log(`  salto ${z}: le falta ${json ? faltan.join(", ") : "cancion.json"}`);
    continue;
  }
  const info = JSON.parse(json.toString("utf8"));
  const [id, titulo] = tema;
  const bytes = PISTAS.reduce((s, p) => s + e.get(`${p}.mp3`).length, 0);
  temas.push({ n, id, titulo, duracion: Math.round(info.duracion * 100) / 100, frames: info.frames, bytes });
  for (const p of PISTAS) archivos.push({ ruta: `${id}/${p}.mp3`, datos: e.get(`${p}.mp3`) });
  const ficha = { numero: n, titulo, artista: "Galileo", disco: "Mañana…", frames: info.frames, duracion: info.duracion, separador: "roformer" };
  archivos.push({ ruta: `${id}/cancion.json`, datos: Buffer.from(JSON.stringify(ficha, null, 2)) });
}
temas.sort((a, b) => a.n - b.n);
const minutos = (s) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, "0")}`;

const readme = `---
license: other
license_name: todos-los-derechos-reservados
pretty_name: Galileo · Mañana…
language:
- es
tags:
- music
- audio
- stems
---

# Galileo · «Mañana…»

Las canciones del disco «Mañana…», de **Galileo**, separadas en 6 pistas (voz, guitarra, bajo,
batería, piano y resto) para tocarlas en la app **GALILEO** (https://the-clavija.vercel.app): en la
Mesa, tocas el disco del escritorio, eliges una canción y se pone en la grabadora.

© Galileo. Todos los derechos reservados. Están aquí solo para que la app las baje: no se permite
redistribuirlas ni usarlas en otro sitio sin permiso del grupo.

Cada canción está separada con BS-RoFormer SW (jarredou) y guardada en MP3 a 112 kbps.

| N.º | Canción | Duración |
|---|---|---|
${temas.map((t) => `| ${t.n} | ${t.titulo} | ${minutos(t.duracion)} |`).join("\n")}
`;
archivos.push({ ruta: "README.md", datos: Buffer.from(readme) });

console.log(`${temas.length} de ${TEMAS.length} canciones · ${(archivos.reduce((s, a) => s + a.datos.length, 0) / 1e6).toFixed(0)} MB`);
console.log("\n  temas: [");
for (const t of temas) console.log(`    { id: "${t.id}", titulo: "${t.titulo}", duracion: ${t.duracion}, frames: ${t.frames}, bytes: ${t.bytes} },`);
console.log("  ],\n");
if (soloLista) process.exit(0);

const clave = fs.readFileSync(archivoClave, "utf8").trim();
const AUT = { Authorization: `Bearer ${clave}` };
async function json(url, opciones) {
  const r = await fetch(url, opciones);
  const t = await r.text();
  if (!r.ok) throw Object.assign(new Error(`${r.status} en ${url.replace(HUB, "")}: ${t.slice(0, 300)}`), { estado: r.status });
  // Algunas respuestas (la verificación de LFS) son solo «OK», sin JSON
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return t;
  }
}

// 2. La carpeta pública: se crea si no existe
const [usuario, nombre] = repo.split("/");
const yo = await json(`${HUB}/api/whoami-v2`, { headers: AUT });
try {
  await json(`${HUB}/api/repos/create`, {
    method: "POST",
    headers: { ...AUT, "Content-Type": "application/json" },
    body: JSON.stringify({ type: "dataset", name: nombre, private: false, ...(yo.name === usuario ? {} : { organization: usuario }) }),
  });
  console.log(`  creada la carpeta ${repo}`);
} catch (e) {
  if (e.estado !== 409) throw e;
  console.log(`  la carpeta ${repo} ya existía`);
}

// 3. Qué va por LFS (lo decide Hugging Face)
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

// 4. Subir por LFS lo que aún no esté (Hugging Face no pide lo que ya tiene)
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

// 5. Un solo cambio con todo
const lineas = [{ key: "header", value: { summary: `Galileo · Mañana…: ${temas.length} canciones`, description: "" } }];
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
