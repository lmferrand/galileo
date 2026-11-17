// Pasa las etapas (con pesos apuntando al archivo original) a pesos «compactos» por
// etapa: cada etapa dice qué trozos del archivo original necesita, en orden, y sus
// pesos apuntan a un búfer propio («pesos») que se arma con esos trozos.
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const { onnx } = require("./onnx-proto.cjs");
const [carpetaEntrada, carpetaSalida] = process.argv.slice(2);
const info = JSON.parse(fs.readFileSync(`${carpetaEntrada}/etapas.json`, "utf8"));
fs.mkdirSync(carpetaSalida, { recursive: true });
const etapas = [];
for (const e of info.etapas) {
  const m = onnx.ModelProto.decode(fs.readFileSync(`${carpetaEntrada}/${e.archivo}`));
  const ext = m.graph.initializer.filter(t => t.dataLocation === 1);
  const pos = (t, k) => Number(t.externalData.find(x => x.key === k).value);
  ext.sort((a, b) => pos(a, "offset") - pos(b, "offset"));
  const trozos = []; let compacto = 0;
  for (const t of ext) {
    const off = pos(t, "offset"), len = pos(t, "length");
    const ult = trozos.at(-1);
    let dentro;
    if (ult && off >= ult[0] && off + len <= ult[0] + ult[1]) dentro = ult[2] + (off - ult[0]); // ya incluido (compartido)
    else if (ult && off === ult[0] + ult[1]) { dentro = ult[2] + ult[1]; ult[1] += len; compacto += len; }
    else { trozos.push([off, len, compacto]); dentro = compacto; compacto += len; }
    t.externalData = [onnx.StringStringEntryProto.create({ key: "location", value: "pesos" }), onnx.StringStringEntryProto.create({ key: "offset", value: String(dentro) }), onnx.StringStringEntryProto.create({ key: "length", value: String(len) })];
  }
  fs.writeFileSync(`${carpetaSalida}/${e.archivo}`, onnx.ModelProto.encode(m).finish());
  etapas.push({ archivo: e.archivo, entradas: e.entradas, salidas: e.salidas, pesos: compacto, trozos: trozos.map(([o, l]) => [o, l]) });
}
const salida = { version: 2, modelo: "htdemucs_6s", entrada: info.entrada, salida: info.salida, etapas };
fs.writeFileSync(`${carpetaSalida}/etapas.json`, JSON.stringify(salida));
for (const e of etapas) console.log(e.archivo, "grafo", (fs.statSync(`${carpetaSalida}/${e.archivo}`).size / 1e3).toFixed(0), "KB | pesos", (e.pesos / 1e6).toFixed(1), "MB en", e.trozos.length, "trozos");
