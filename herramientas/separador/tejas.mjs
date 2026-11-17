// Parte en tiras (a lo largo del tiempo, el último eje) las convoluciones con búfer de
// trabajo grande: cada tira lleva su margen, así el resultado es idéntico.
import { createRequire } from "node:module";
import fs from "node:fs";
const require = createRequire(import.meta.url);
const { onnx } = require("./onnx-proto.cjs");
const [entrada, perfil, salida, topeTxt] = process.argv.slice(2);
const TOPE = Number(topeTxt || 24) * 1e6;
const m = onnx.ModelProto.decode(fs.readFileSync(entrada));
const g = m.graph;
const ev = JSON.parse(fs.readFileSync(perfil, "utf8")).filter(e => e.cat === "Node" && e.name.endsWith("_kernel_time"));
const forma = new Map(ev.map(e => [e.name.replace("_kernel_time", ""), e.args]));
const ini = new Map(g.initializer.map(t => [t.name, t.dims.map(Number)]));
const nuevosIni = [];
const i64 = (name, vals) => { const b = Buffer.alloc(8 * vals.length); vals.forEach((v, i) => b.writeBigInt64LE(BigInt(v), 8 * i)); nuevosIni.push(onnx.TensorProto.create({ name, dataType: 7, dims: [vals.length], rawData: b })); return name; };
const INTS = 7, INT = 2;
const reemplazos = new Map(); let hechas = 0;
for (const n of g.node.filter(n => n.opType === "Conv" || n.opType === "ConvTranspose")) {
  const a = forma.get(n.name); if (!a) continue;
  const x = Object.values(a.input_type_shape[0])[0], y = Object.values(a.output_type_shape[0])[0];
  const w = ini.get(n.input[1]); if (!w) continue;
  const at = Object.fromEntries(n.attribute.map(t => [t.name, t.ints?.length ? t.ints.map(Number) : Number(t.i)]));
  if ((at.group || 1) !== 1 || at.auto_pad || at.output_shape || at.output_padding?.some(v => v)) continue;
  const r = x.length; const ax = r - 1; const nd = r - 2; // eje del tiempo = último
  const k = w[r - 1], s = at.strides?.[nd - 1] ?? 1, d = at.dilations?.[nd - 1] ?? 1;
  const pads = at.pads || new Array(2 * nd).fill(0);
  const pl = pads[nd - 1], pr = pads[2 * nd - 1];
  let col;
  if (n.opType === "Conv") col = x[1] * w.slice(2).reduce((p, v) => p * v, 1) * y.slice(2).reduce((p, v) => p * v, 1) * 4;
  else col = w[1] * w.slice(2).reduce((p, v) => p * v, 1) * x.slice(2).reduce((p, v) => p * v, 1) * 4;
  if (col <= TOPE) continue;
  if (s !== 1) continue;
  if (n.opType === "ConvTranspose" && (k !== 1 || pl || pr)) continue;
  const W = y[ax]; const Win = x[ax];
  const P = Math.ceil(col / TOPE);
  const paso = Math.ceil(W / P);
  const base = n.name + "/tira";
  const lista = []; const outs = [];
  for (let t = 0, c0 = 0; c0 < W; t++, c0 += paso) {
    const c1 = Math.min(W, c0 + paso);
    // columnas de entrada necesarias para las salidas [c0, c1)
    const i0 = c0 - pl, i1 = c1 - 1 - pl + (k - 1) * d + 1; // [i0, i1)
    const a0 = Math.max(0, i0), a1 = Math.min(Win, i1);
    const nl = a0 - i0, nr = i1 - a1;
    const xin = `${base}${t}/x`, yout = `${base}${t}/y`;
    lista.push(onnx.NodeProto.create({ opType: "Slice", name: `${base}${t}/Slice`, input: [n.input[0], i64(`${base}${t}/ini`, [a0]), i64(`${base}${t}/fin`, [a1]), i64(`${base}${t}/eje`, [ax])], output: [xin] }));
    const atr = n.attribute.map(t2 => {
      if (t2.name !== "pads") return t2;
      const np = [...pads]; np[nd - 1] = nl; np[2 * nd - 1] = nr;
      return onnx.AttributeProto.create({ name: "pads", type: INTS, ints: np });
    });
    lista.push(onnx.NodeProto.create({ opType: n.opType, name: `${base}${t}/${n.opType}`, input: [xin, ...n.input.slice(1)], output: [yout], attribute: atr }));
    outs.push(yout);
  }
  lista.push(onnx.NodeProto.create({ opType: "Concat", name: `${base}/Concat`, input: outs, output: [n.output[0]], attribute: [onnx.AttributeProto.create({ name: "axis", type: INT, i: ax })] }));
  reemplazos.set(n, lista); hechas++;
  console.log(n.name, "→", outs.length, "tiras (", (col / 1e6).toFixed(0), "MB )");
}
g.node = g.node.flatMap(n => reemplazos.get(n) || [n]);
g.initializer.push(...nuevosIni);
fs.writeFileSync(salida, onnx.ModelProto.encode(m).finish());
console.log("convoluciones en tiras:", hechas, "| nodos:", g.node.length);
