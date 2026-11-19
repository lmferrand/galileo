"use client";

// El manejo de los mandos de la mesa (las ruedas y los faders de MesaFoto): se mueven arrastrando
// arriba y abajo desde donde se toquen (nunca saltan a otro valor), vuelven a su valor de serie con
// dos toques y se manejan con las flechas del teclado.

import { useRef, type KeyboardEvent, type PointerEvent } from "react";

export interface PropsMando {
  nombre: string;
  valor: number;
  min: number;
  max: number;
  paso: number;
  /** Al que vuelve con dos toques */
  porDefecto: number;
  ver: (v: number) => string;
  onCambio: (v: number) => void;
  desactivado?: boolean;
}

const DOS_TOQUES_MS = 320;

export function useArrastre(p: PropsMando, recorrido: (el: HTMLElement) => number) {
  const inicio = useRef<{ y: number; v: number; alto: number; movido: boolean } | null>(null);
  // Cuándo acabó el último toque sin arrastrar (dos seguidos = valor de serie)
  const ultimoToque = useRef(0);
  const rango = p.max - p.min;

  const ajustar = (v: number) => {
    const dentro = Math.min(p.max, Math.max(p.min, v));
    return Number((Math.round((dentro - p.min) / p.paso) * p.paso + p.min).toFixed(4));
  };
  const poner = (v: number) => {
    const a = ajustar(v);
    if (a !== p.valor) p.onCambio(a);
  };

  return {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (p.desactivado) return;
      e.preventDefault();
      e.currentTarget.focus({ preventScroll: true });
      e.currentTarget.setPointerCapture(e.pointerId);
      inicio.current = { y: e.clientY, v: p.valor, alto: recorrido(e.currentTarget), movido: false };
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      const i = inicio.current;
      if (!i) return;
      if (!i.movido && Math.abs(i.y - e.clientY) < 4) return;
      i.movido = true;
      // Con mayúsculas, cuatro veces más fino
      const fino = e.shiftKey ? 0.25 : 1;
      poner(i.v + ((i.y - e.clientY) / i.alto) * rango * fino);
    },
    onPointerUp() {
      const i = inicio.current;
      inicio.current = null;
      if (!i) return;
      const ahora = performance.now();
      if (i.movido) ultimoToque.current = 0;
      else if (ahora - ultimoToque.current < DOS_TOQUES_MS) {
        ultimoToque.current = 0;
        p.onCambio(p.porDefecto);
      } else ultimoToque.current = ahora;
    },
    onPointerCancel() {
      inicio.current = null;
    },
    onKeyDown(e: KeyboardEvent<HTMLElement>) {
      if (p.desactivado) return;
      const pasos: Record<string, number> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 };
      if (e.key in pasos) poner(p.valor + pasos[e.key] * p.paso);
      else if (e.key === "Home") poner(p.min);
      else if (e.key === "End") poner(p.max);
      else return;
      e.preventDefault();
    },
  };
}

export const accesible = (p: PropsMando) => ({
  role: "slider" as const,
  tabIndex: p.desactivado ? -1 : 0,
  "aria-label": p.nombre,
  "aria-valuemin": p.min,
  "aria-valuemax": p.max,
  "aria-valuenow": p.valor,
  "aria-valuetext": p.ver(p.valor),
  "aria-disabled": p.desactivado || undefined,
});
