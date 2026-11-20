// Sacar el pulso de la batería en otro hilo (lib/pistas/pulso): es un cálculo largo y, en el hilo
// de la pantalla, la Mesa iba a tirones mientras lo hacía. El bajo, si viene, ayuda a encontrar el 1.

import { sacarPulso } from "./pulso";

self.onmessage = (e: MessageEvent<{ datos: Int16Array; bajo?: Int16Array | null; frecuencia: number }>) => {
  let pulso = null;
  try {
    pulso = sacarPulso(e.data.datos, e.data.frecuencia, { bajo: e.data.bajo });
  } catch {
    /* sin pulso */
  }
  self.postMessage(pulso);
};
