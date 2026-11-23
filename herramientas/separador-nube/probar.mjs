// Prueba el Space como lo hace la app (lib/estudio/nube.ts): sube una canción, espera, baja el
// .zip, mira que traiga cancion.json + las 6 pistas y cuenta cuánto tarda cada paso.
// También comprueba que el Space deja llamar desde la app (CORS para galileomusic.vercel.app).
// Uso: node probar.mjs <https://usuario-separador.hf.space> <cancion.mp3> [nombre]
import fs from "node:fs";
import path from "node:path";

const [space, archivo, nombre = "Prueba del Space"] = process.argv.slice(2);
if (!space || !archivo) throw new Error("Uso: node probar.mjs <dirección del Space> <canción> [nombre]");
const ORIGEN = "https://galileomusic.vercel.app";
const t0 = Date.now();
const seg = () => ((Date.now() - t0) / 1000).toFixed(1) + " s";
const paso = (texto) => console.log(`[${seg()}] ${texto}`);

// 1. Despierto (como la app: JSON de /gradio_api/info)
for (let k = 0; ; k++) {
  const r = await fetch(`${space}/gradio_api/info`, { headers: { Origin: ORIGEN } }).catch(() => null);
  if (r?.ok && (r.headers.get("content-type") ?? "").includes("json")) {
    paso(`despierto · CORS para la app: ${r.headers.get("access-control-allow-origin") ?? "NINGUNO"}`);
    break;
  }
  if (k > 60) throw new Error("El Space no se despierta en 5 minutos.");
  if (k === 0) paso(`aún no responde (${r?.status ?? "sin conexión"}); esperando…`);
  await new Promise((ok) => setTimeout(ok, 5000));
}

// 2. Subir
const formulario = new FormData();
formulario.append("files", new Blob([fs.readFileSync(archivo)]), path.basename(archivo));
const subida = await fetch(`${space}/gradio_api/upload`, { method: "POST", body: formulario, headers: { Origin: ORIGEN } });
if (!subida.ok) throw new Error(`Subida: ${subida.status} ${await subida.text()}`);
const [ruta] = await subida.json();
paso(`subida (${(fs.statSync(archivo).size / 1e6).toFixed(1)} MB)`);

// 3. Separar
const llamada = await fetch(`${space}/gradio_api/call/separar`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Origin: ORIGEN },
  body: JSON.stringify({ data: [{ path: ruta, orig_name: path.basename(archivo), meta: { _type: "gradio.FileData" } }, nombre] }),
});
if (!llamada.ok) throw new Error(`Llamada: ${llamada.status} ${await llamada.text()}`);
const { event_id } = await llamada.json();
const tSeparar = Date.now();
const sse = await (await fetch(`${space}/gradio_api/call/separar/${event_id}`)).text();
let evento = "", resultado = null;
for (const linea of sse.split(/\r?\n/)) {
  if (linea.startsWith("event:")) evento = linea.slice(6).trim();
  else if (linea.startsWith("data:") && evento === "complete") resultado = JSON.parse(linea.slice(5));
  else if (linea.startsWith("data:") && evento === "error") throw new Error(`El Space dice: ${linea.slice(5).trim()}`);
}
if (!resultado) throw new Error(`Sin resultado. Respuesta: ${sse.slice(0, 500)}`);
paso(`separada en ${((Date.now() - tSeparar) / 1000).toFixed(1)} s (cola + gráfica + mp3)`);

// 4. Bajar y revisar el zip
const url = resultado[0].url ?? `${space}/gradio_api/file=${resultado[0].path}`;
const zip = Buffer.from(await (await fetch(url, { headers: { Origin: ORIGEN } })).arrayBuffer());
paso(`zip bajado (${(zip.length / 1e6).toFixed(1)} MB)`);
const fin = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
const total = zip.readUInt16LE(fin + 10);
let p = zip.readUInt32LE(fin + 16);
const entradas = {};
for (let i = 0; i < total; i++) {
  const largoNombre = zip.readUInt16LE(p + 28), extra = zip.readUInt16LE(p + 30), comentario = zip.readUInt16LE(p + 32);
  const local = zip.readUInt32LE(p + 42), tam = zip.readUInt32LE(p + 20);
  const n = zip.toString("utf8", p + 46, p + 46 + largoNombre);
  const ini = local + 30 + zip.readUInt16LE(local + 26) + zip.readUInt16LE(local + 28);
  entradas[n] = zip.subarray(ini, ini + tam);
  p += 46 + largoNombre + extra + comentario;
}
const faltan = ["cancion.json", ...["voz", "guitarra", "bajo", "bateria", "piano", "resto"].map((x) => x + ".mp3")].filter((n) => !entradas[n]);
const info = entradas["cancion.json"] ? JSON.parse(entradas["cancion.json"].toString("utf8")) : null;
console.log("contenido:", Object.entries(entradas).map(([n, d]) => `${n} ${(d.length / 1e6).toFixed(2)} MB`).join(" · "));
console.log("cancion.json:", JSON.stringify(info));
console.log(faltan.length ? `FALTAN: ${faltan.join(", ")}` : `TODO BIEN en ${seg()}`);
fs.writeFileSync(path.join(path.dirname(archivo), "prueba-space.zip"), zip);
