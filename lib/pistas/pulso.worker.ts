// Sacar el pulso de la batería en otro hilo (lib/pistas/pulso): es un cálculo largo y, en el hilo
// de la pantalla, la Mesa iba a tirones mientras lo hacía.

import { sacarPulso } from "./pulso";

self.onmessage = (e: MessageEvent<{ datos: Int16Array; frecuencia: number }>) => {
  let pulso = null;
  try {
    pulso = sacarPulso(e.data.datos, e.data.frecuencia);
  } catch {
    /* sin pulso */
  }
  self.postMessage(pulso);
};
