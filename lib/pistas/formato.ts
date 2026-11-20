// En qué formato salen los archivos que exportas (tu mezcla, tus tomas): MP3 (pesa unas 9 veces
// menos: para mandarlo por WhatsApp) o WAV (sin comprimir). Se recuerda en este aparato y vale para
// toda la app: lo eliges en la pantalla de Pistas o en «Tus tomas» de la Mesa (SelectorFormato).

import { useSyncExternalStore } from "react";

export type Formato = "mp3" | "wav";

const CLAVE = "galileo:exportar:formato";
const oyentes = new Set<() => void>();
let actual: Formato | null = null;

export function leerFormato(): Formato {
  if (actual) return actual;
  try {
    actual = localStorage.getItem(CLAVE) === "wav" ? "wav" : "mp3";
  } catch {
    actual = "mp3";
  }
  return actual;
}

export function ponerFormato(f: Formato) {
  actual = f;
  try {
    localStorage.setItem(CLAVE, f);
  } catch {
    /* sin almacenamiento: vale para esta vez */
  }
  oyentes.forEach((o) => o());
}

const suscribir = (o: () => void) => {
  oyentes.add(o);
  return () => {
    oyentes.delete(o);
  };
};

/** El formato elegido, al día en cualquier pantalla. */
export const useFormato = (): Formato => useSyncExternalStore(suscribir, leerFormato, () => "mp3" as const);
