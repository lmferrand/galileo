// Como en el worker: cada etapa arma sus pesos leyendo trozos del archivo original.
import fs from "node:fs";
const [carpeta, original, hilos] = process.argv.slice(2);
let memorias = [];
const orig = WebAssembly.instantiate;
WebAssembly.instantiate = async function (src, imports) { const r = await orig.call(this, src, imports); const inst = r.instance || r; for (const v of Object.values(inst.exports)) if (v instanceof WebAssembly.Memory) memorias.push(v); for (const mod of Object.values(imports || {})) for (const v of Object.values(mod)) if (v instanceof WebAssembly.Memory) memorias.push(v); return r; };
const ort = await import("onnxruntime-web");
ort.env.wasm.numThreads = Number(hilos || 1);
const heap = () => Math.round(Math.max(0, ...memorias.map(m => m.buffer.byteLength)) / 1e6);
const info = JSON.parse(fs.readFileSync(`${carpeta}/etapas.json`, "utf8"));
const fd = fs.openSync(original, "r");
const ses = [];
const t0 = Date.now();
for (const e of info.etapas) {
  const pesos = new Uint8Array(e.pesos); let p = 0;
  for (const [o, l] of e.trozos) { fs.readSync(fd, pesos, p, l, o); p += l; }
  ses.push(await ort.InferenceSession.create(fs.readFileSync(`${carpeta}/${e.archivo}`), { executionProviders: ["wasm"], graphOptimizationLevel: "all", externalData: [{ path: "pesos", data: pesos }] }));
}
console.log("hilos", hilos || 1, "| montón tras crear:", heap(), "MB |", ((Date.now() - t0) / 1000).toFixed(1), "s");
const N = 343980; let s0 = 7; const rnd = () => ((s0 = (s0 * 1103515245 + 12345) % 2147483648) / 2147483648);
const x = new Float32Array(2 * N); for (let i = 0; i < x.length; i++) x[i] = Math.sin(i * 0.01) * 0.3 + (rnd() - 0.5) * 0.1;
let final;
for (let vuelta = 0; vuelta < 2; vuelta++) {
  const t1 = Date.now();
  const pool = new Map([[info.entrada, new ort.Tensor("float32", x, [1, 2, N])]]);
  for (let e = 0; e < ses.length; e++) {
    const r = await ses[e].run(Object.fromEntries(ses[e].inputNames.map(n => [n, pool.get(n)])));
    for (const [k, v] of Object.entries(r)) pool.set(k, v);
    for (const n of ses[e].inputNames) if (!info.etapas.slice(e + 1).some(z => z.entradas.includes(n))) pool.delete(n);
  }
  final = pool.get(info.salida);
  console.log(`  trozo ${vuelta + 1}: montón ${heap()} MB | ${((Date.now() - t1) / 1000).toFixed(1)} s`);
}
let suma = 0; for (let i = 0; i < final.data.length; i += 997) suma += Math.abs(final.data[i]);
console.log("huella", suma.toFixed(5), "(debe ser 23.23109)");
