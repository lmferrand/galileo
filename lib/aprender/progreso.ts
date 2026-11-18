// Lo que llevas hecho en «Aprender»: estrellas por lección (1 a 3), en este aparato.

import { TODAS } from "./curso";

const CLAVE = "clavija:aprender:v1";

export type Progreso = Record<string, number>;

export function leerProgreso(): Progreso {
  try {
    const p = JSON.parse(localStorage.getItem(CLAVE) ?? "{}") as Progreso;
    return p && typeof p === "object" ? p : {};
  } catch {
    return {};
  }
}

/** Guarda las estrellas (se queda con la mejor) y devuelve el progreso nuevo. */
export function guardarEstrellas(id: string, estrellas: number): Progreso {
  const p = leerProgreso();
  p[id] = Math.max(p[id] ?? 0, estrellas);
  try {
    localStorage.setItem(CLAVE, JSON.stringify(p));
  } catch {
    /* sin almacenamiento: vale para esta visita */
  }
  return p;
}

/** Abierta si es la primera o la anterior ya está hecha. */
export function abierta(id: string, p: Progreso): boolean {
  const i = TODAS.findIndex((l) => l.id === id);
  return i <= 0 || (p[TODAS[i - 1].id] ?? 0) > 0;
}

/** La que toca ahora: la primera abierta sin hacer. */
export function laSiguiente(p: Progreso): string | null {
  return TODAS.find((l) => !(p[l.id] > 0) && abierta(l.id, p))?.id ?? null;
}

/** 3 estrellas con 0–1 fallos, 2 con hasta 4, 1 con más. */
export const estrellasDe = (fallos: number) => (fallos <= 1 ? 3 : fallos <= 4 ? 2 : 1);
