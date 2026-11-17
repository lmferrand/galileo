// Perfil de ORT (nativo): tamaño de salida de cada nodo, para ver dónde está el pico.
import ort from "onnxruntime-node";
import fs from "node:fs";
const modelo = process.argv[2];
const s = await ort.InferenceSession.create(modelo, { graphOptimizationLevel: "disabled", enableProfiling: true, profileFilePrefix: "perfil", executionMode: "sequential", intraOpNumThreads: 4 });
const N = 343980; const x = new Float32Array(2 * N).map(() => Math.random() * 0.2 - 0.1);
await s.run({ [s.inputNames[0]]: new ort.Tensor("float32", x, [1, 2, N]) });
const archivo = s.endProfiling();
console.log("perfil:", archivo);
