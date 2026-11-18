// Pasa a la pista del bajo los graves que el separador dejó en la guitarra, la voz,
// el piano y el resto (lo hace public/limpiar-bajo.worker.js, sin trabar la pantalla).
// Las pistas van en el orden de PISTAS, en Int16 estéreo intercalado y del mismo largo.
// Si algo falla, se devuelven tal cual.

import { FRECUENCIA, PISTAS } from "./tipos";

/** Hasta aquí se considera «bajo» (más arriba se irían las notas graves de la guitarra). */
const CORTE_HZ = 130;

export function limpiarBajo(pistas: Int16Array[]): Promise<Int16Array[]> {
  const bajo = PISTAS.findIndex((p) => p.id === "bajo");
  const otras = PISTAS.map((p, i) => (p.id === "voz" || p.id === "guitarra" || p.id === "piano" || p.id === "resto" ? i : -1)).filter((i) => i >= 0);
  if (bajo < 0 || typeof Worker === "undefined") return Promise.resolve(pistas);
  return new Promise((ok) => {
    let w: Worker;
    try {
      w = new Worker("/limpiar-bajo.worker.js");
    } catch {
      ok(pistas);
      return;
    }
    w.onmessage = (e: MessageEvent<{ pistas: Int16Array[]; error?: string }>) => {
      w.terminate();
      ok(e.data.pistas);
    };
    w.onerror = () => {
      w.terminate();
      // Las pistas viajaron al worker: sin respuesta no se pueden recuperar
      ok(pistas.map((p) => (p.byteLength ? p : new Int16Array(0))));
    };
    w.postMessage({ pistas, bajo, otras, corte: CORTE_HZ, frecuencia: FRECUENCIA }, pistas.map((p) => p.buffer));
  });
}
