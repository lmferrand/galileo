// Por dónde va la canción (segundos), fuera de React.
// Mientras suena, la posición cambia 10 veces por segundo. Si fuera estado de la pantalla, cada
// cambio repintaría la pantalla de reproducción y la Mesa enteras (cientos de piezas) solo para
// mover el contador: en un móvil modesto se comía la mitad de los fotogramas (medido el
// 20-nov-2026 con el procesador frenado ×6). Así solo se repintan las piezas pequeñas que la
// enseñan (el contador, el cabezal, la barra), y cada una solo cuando cambia lo que ella pinta
// (usePosicion con `ver`). Para leerla al pulsar algo: `posicion.leer()`.

import { useSyncExternalStore } from "react";

export class Posicion {
  private s = 0;
  private oyentes = new Set<() => void>();

  /** El segundo por el que va ahora mismo */
  leer = (): number => this.s;

  poner(s: number) {
    if (s === this.s) return;
    this.s = s;
    this.oyentes.forEach((f) => f());
  }

  suscribir = (f: () => void): (() => void) => {
    this.oyentes.add(f);
    return () => {
      this.oyentes.delete(f);
    };
  };
}

const NADIE = () => () => undefined;

/** La posición al día dentro de un componente (se repinta en cada cambio: solo en piezas pequeñas). */
export function usePosicion(p: Posicion | null): number;
/**
 * Lo que `ver` saque de la posición (un texto, un número redondeado, un sí o no): el componente
 * solo se repinta cuando eso cambia. `ver` tiene que dar un valor simple.
 */
export function usePosicion<T extends number | string | boolean | null>(p: Posicion | null, ver: (s: number) => T): T;
export function usePosicion<T extends number | string | boolean | null>(p: Posicion | null, ver?: (s: number) => T): T | number {
  return useSyncExternalStore(
    p ? p.suscribir : NADIE,
    () => {
      const s = p ? p.leer() : 0;
      return ver ? ver(s) : s;
    },
    () => (ver ? ver(0) : 0),
  );
}
