// Parte cada atención del modelo en sus 8 cabezas, una detrás de otra, para que
// la tabla de atención ocupe 1/8 de la memoria. Mismo cálculo, otro orden.
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const { onnx } = require("./onnx-proto.cjs");
const [entrada, salida, cabezasTxt] = process.argv.slice(2);
const H = Number(cabezasTxt || 8);
const m = onnx.ModelProto.decode(fs.readFileSync(entrada));
const g = m.graph;
const prod = new Map(); g.node.forEach(n => n.output.forEach(o => prod.set(o, n)));
const cons = new Map(); g.node.forEach(n => n.input.forEach(t => { if (!cons.has(t)) cons.set(t, []); cons.get(t).push(n); }));
const INT = 2;
const atr = (name, i) => onnx.AttributeProto.create({ name, type: INT, i });
const nodo = (opType, name, input, output, attribute = []) => onnx.NodeProto.create({ opType, name, input, output, attribute });
const quitar = new Set(); const insertarTras = new Map();
let hechas = 0;
for (const sm of g.node.filter(n => n.opType === "Softmax")) {
  const a = prod.get(sm.input[0]); const usos = cons.get(sm.output[0]);
  if (a?.opType !== "MatMul" || usos.length !== 1 || usos[0].opType !== "MatMul" || cons.get(a.output[0]).length !== 1) continue;
  const b = usos[0];
  const [Q, Kt] = a.input; const V = b.input[1];
  const p = sm.name.replace(/Softmax$/, "cabeza");
  const nuevos = [];
  const partes = (t, x) => Array.from({ length: H }, (_, h) => `${p}/${x}${h}`);
  const qs = partes(Q, "q"), ks = partes(Kt, "k"), vs = partes(V, "v"), os = partes(null, "o");
  nuevos.push(nodo("Split", `${p}/SplitQ`, [Q], qs, [atr("axis", 0)]));
  nuevos.push(nodo("Split", `${p}/SplitK`, [Kt], ks, [atr("axis", 0)]));
  nuevos.push(nodo("Split", `${p}/SplitV`, [V], vs, [atr("axis", 0)]));
  for (let h = 0; h < H; h++) {
    nuevos.push(nodo("MatMul", `${p}/QK${h}`, [qs[h], ks[h]], [`${p}/s${h}`]));
    nuevos.push(nodo("Softmax", `${p}/Softmax${h}`, [`${p}/s${h}`], [`${p}/w${h}`], [atr("axis", -1)]));
    nuevos.push(nodo("MatMul", `${p}/WV${h}`, [`${p}/w${h}`, vs[h]], [os[h]]));
  }
  nuevos.push(nodo("Concat", `${p}/Concat`, os, [b.output[0]], [atr("axis", 0)]));
  quitar.add(a); quitar.add(sm); quitar.add(b);
  insertarTras.set(b, nuevos);
  hechas++;
}
const lista = [];
for (const n of g.node) { if (insertarTras.has(n)) lista.push(...insertarTras.get(n)); else if (!quitar.has(n)) lista.push(n); }
g.node = lista;
fs.writeFileSync(salida, onnx.ModelProto.encode(m).finish());
console.log("atenciones partidas:", hechas, "| nodos:", lista.length, "|", (fs.statSync(salida).size / 1e6).toFixed(1), "MB");
