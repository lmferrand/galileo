"use client";

import { useLayoutEffect } from "react";

export type Pestana = "afinar" | "pistas" | "aprender" | "mesa";

/**
 * Apunta en <html data-pestana> la pestaña que se ve. Las otras siguen en la página, ocultas (ver
 * next.config.ts), así que las reglas de estilo de toda la página («html:has(.app-pistas)»…) tienen
 * que mirar este dato; si no, las de una pestaña oculta se aplicarían a la que se ve. Antes de
 * hidratar todavía no está, y entonces solo hay una pantalla en la página: ahí vale el :has() solo.
 */
export function usePestanaVisible(nombre: Pestana) {
  useLayoutEffect(() => {
    const raiz = document.documentElement;
    raiz.dataset.pestana = nombre;
    return () => {
      if (raiz.dataset.pestana === nombre) delete raiz.dataset.pestana;
    };
  }, [nombre]);
}
