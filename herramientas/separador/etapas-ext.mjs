// Etapas con los pesos apuntando DENTRO del archivo original (htdemucs_6s.onnx de
// Hugging Face): la app sigue descargando ese mismo archivo y estas etapas solo
// llevan el grafo. Además encoge la constante /Mul_5 (igual en todo el tiempo).
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const { onnx } = require("./onnx-proto.cjs");
const [ligero, original, carpeta, cortesTxt, nombreExterno] = process.argv.slice(2);
const bufO = fs.readFileSync(original);
const go = onnx.ModelProto.decode(bufO).graph;
const enOriginal = new Map();
for (const t of go.initializer) if (t.rawData?.length) enOriginal.set(t.name, { off: t.rawData.byteOffset - bufO.byteOffset, len: t.rawData.length, raw: t.rawData });
const base = onnx.ModelProto.decode(fs.readFileSync(ligero));
const g = base.graph;
// /Mul_5_output_0: [1,48,512,336] constante en el tiempo -> [1,48,512,1]
for (const t of g.initializer) if (t.name === "/Mul_5_output_0" && t.dims.map(Number).join() === "1,48,512,336") {
  const f = new Float32Array(t.rawData.buffer.slice(t.rawData.byteOffset, t.rawData.byteOffset + t.rawData.length));
  const p = new Float32Array(48 * 512); for (let c = 0; c < p.length; c++) p[c] = f[c * 336];
  t.dims = [1, 48, 512, 1]; t.rawData = new Uint8Array(p.buffer); t.name = "/Mul_5_columna";
  g.node.forEach(n => n.input.forEach((x, i) => { if (x === "/Mul_5_output_0") n.input[i] = "/Mul_5_columna"; }));
}
const cortes = [0, ...cortesTxt.split(",").filter(Boolean).map(Number), g.node.length];
const inits = new Map(g.initializer.map(t => [t.name, t]));
const entradaG = g.input[0].name;
const salidaG = g.output.map(o => o.name);
const vi = (name) => onnx.ValueInfoProto.create({ name, type: onnx.TypeProto.create({ tensorType: onnx.TypeProto.Tensor.create({ elemType: 1 }) }) });
const ext = (t) => {
  const o = enOriginal.get(t.name);
  if (!o || o.len < 4096 || o.len !== t.rawData?.length || Buffer.compare(Buffer.from(o.raw), Buffer.from(t.rawData)) !== 0) return t;
  return onnx.TensorProto.create({ name: t.name, dims: t.dims, dataType: t.dataType, dataLocation: 1, externalData: [
    onnx.StringStringEntryProto.create({ key: "location", value: nombreExterno }),
    onnx.StringStringEntryProto.create({ key: "offset", value: String(o.off) }),
    onnx.StringStringEntryProto.create({ key: "length", value: String(o.len) })] });
};
fs.mkdirSync(carpeta, { recursive: true });
const etapas = []; let externos = 0, internos = 0;
for (let e = 0; e < cortes.length - 1; e++) {
  const nodos = g.node.slice(cortes[e], cortes[e + 1]);
  const producidos = new Set(nodos.flatMap(n => n.output));
  const usados = new Set(nodos.flatMap(n => n.input).filter(Boolean));
  const ins = [...usados].filter(t => !producidos.has(t) && !inits.has(t));
  const despues = new Set(g.node.slice(cortes[e + 1]).flatMap(n => n.input));
  const outs = [...producidos].filter(t => despues.has(t) || salidaG.includes(t));
  const ini = [...usados].filter(t => inits.has(t)).map(t => { const r = ext(inits.get(t)); r.dataLocation === 1 ? externos++ : internos++; return r; });
  const m = onnx.ModelProto.create({ ...base, graph: onnx.GraphProto.create({ name: `etapa${e}`, node: nodos, initializer: ini, input: ins.map(t => t === entradaG ? g.input[0] : vi(t)), output: outs.map(t => salidaG.includes(t) ? g.output.find(o => o.name === t) : vi(t)), valueInfo: [] }) });
  const archivo = `etapa${e}.onnx`;
  fs.writeFileSync(`${carpeta}/${archivo}`, onnx.ModelProto.encode(m).finish());
  etapas.push({ archivo, entradas: ins, salidas: outs, bytes: fs.statSync(`${carpeta}/${archivo}`).size });
}
const info = { entrada: entradaG, salida: salidaG[0], externo: nombreExterno, etapas };
fs.writeFileSync(`${carpeta}/etapas.json`, JSON.stringify(info));
console.log("etapas:", etapas.length, "| pesos externos:", externos, "| internos:", internos, "| grafo total:", (etapas.reduce((s, x) => s + x.bytes, 0) / 1e6).toFixed(2), "MB");
