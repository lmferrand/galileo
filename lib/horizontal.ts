// ¿La pantalla es apaisada (PC, iPad tumbado)? Entonces se usan las fotos
// horizontales del estudio. La misma consulta está en el CSS.

import { useSyncExternalStore } from "react";

export const CONSULTA_HORIZONTAL = "(min-aspect-ratio: 1/1)";

function suscribir(aviso: () => void) {
  const m = matchMedia(CONSULTA_HORIZONTAL);
  m.addEventListener("change", aviso);
  return () => m.removeEventListener("change", aviso);
}

/** true apaisada, false vertical, null mientras se pinta en el servidor (aún no se sabe). */
export function useHorizontal(): boolean | null {
  return useSyncExternalStore(
    suscribir,
    () => matchMedia(CONSULTA_HORIZONTAL).matches,
    () => null,
  );
}
