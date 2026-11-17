// Compara la salida de dos modelos con la misma entrada (onnxruntime-node).
import ort from "onnxruntime-node";
const [a, b] = process.argv.slice(2);
const N = 343980; let s = 12345; const rnd = () => ((s = (s * 1103515245 + 12345) % 2147483648) / 2147483648);
const x = new Float32Array(2 * N); for (let i = 0; i < x.length; i++) x[i] = Math.sin(i * 0.01) * 0.3 + (rnd() - 0.5) * 0.1;
const corre = async (f) => { const ses = await ort.InferenceSession.create(f, { intraOpNumThreads: 6 }); const r = await ses.run({ [ses.inputNames[0]]: new ort.Tensor("float32", x, [1, 2, N]) }); return r[ses.outputNames[0]].data; };
const ya = await corre(a), yb = await corre(b);
let max = 0, ref = 0; for (let i = 0; i < ya.length; i++) { max = Math.max(max, Math.abs(ya[i] - yb[i])); ref = Math.max(ref, Math.abs(ya[i])); }
console.log("diferencia máxima:", max.toExponential(2), "sobre", ref.toFixed(3));
