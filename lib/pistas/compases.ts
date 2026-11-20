// Los compases de la canción, para repetir trozos que cuadren: «2 compases desde aquí», «un compás
// más allá»… Salen del pulso de la canción (lib/pistas/pulso): cada «1» es donde empieza un compás.
// Sirve para practicar un pasaje en bucle sin que el corte caiga a mitad de golpe.

import type { ClickCancion } from "./ajustesCancion";

/** Los bordes del bucle van un pelín antes del golpe: así el fundido de la vuelta no se come su ataque */
export const ANTICIPO = 0.03;
/** Lo cerca que tiene que caer un borde de un principio de compás para decir que «cae en el compás» */
const CERCA = 0.06;

const r3 = (s: number) => Math.round(s * 1000) / 1000;
/** Dónde va el borde de un bucle que empieza (o acaba) en ese principio de compás */
const borde = (inicio: number, duracion: number) => r3(Math.max(0, Math.min(duracion, inicio - ANTICIPO)));

/**
 * El segundo en que empieza cada compás (cada «1»). Después del último que se detectó (la batería
 * puede callarse antes de que acabe la canción) se siguen poniendo, con lo que medía el último,
 * hasta el final de la canción.
 */
export function iniciosDeCompas(c: ClickCancion, duracion: number): number[] {
  const g = c.golpes;
  const compas = Math.max(1, Math.round(c.compas));
  const unos: number[] = [];
  for (let i = ((c.uno % compas) + compas) % compas; i < g.length; i += compas) unos.push(g[i]);
  if (unos.length < 2) return unos;
  const largo = unos[unos.length - 1] - unos[unos.length - 2];
  if (largo > 0.2) for (let t = unos[unos.length - 1] + largo; t <= duracion + 0.05; t += largo) unos.push(Math.min(duracion, t));
  return unos;
}

export interface Bucle {
  desde: number;
  hasta: number;
}

/** El bucle de `n` compases que empieza en el compás donde cae `segundo` (null si no hay compases). */
export function bucleDeCompases(c: ClickCancion, segundo: number, n: number, duracion: number): Bucle | null {
  const unos = iniciosDeCompas(c, duracion);
  if (unos.length < 2) return null;
  // El compás en que está: el último «1» que no pasa de ahí (justo antes de un 1 ya cuenta como ese compás)
  let k = 0;
  for (let i = 0; i < unos.length; i++) if (unos[i] <= segundo + CERCA + ANTICIPO) k = i;
  k = Math.min(k, unos.length - 2);
  const fin = Math.min(unos.length - 1, k + Math.max(1, Math.round(n)));
  return { desde: borde(unos[k], duracion), hasta: borde(unos[fin], duracion) };
}

/** En qué compás empieza un trozo y cuántos mide, si sus dos bordes caen en principios de compás. */
export function compasesDe(c: ClickCancion, desde: number, hasta: number, duracion: number): { primero: number; cuantos: number } | null {
  const unos = iniciosDeCompas(c, duracion);
  const cual = (t: number) => unos.findIndex((u) => Math.abs(borde(u, duracion) - t) <= CERCA || Math.abs(u - t) <= CERCA);
  const a = cual(desde);
  const b = cual(hasta);
  return a >= 0 && b > a ? { primero: a, cuantos: b - a } : null;
}

/**
 * El mismo bucle, `pasos` compases más allá (negativo: antes). Si el trozo no caía en compases, se
 * lleva al compás más cercano, con los compases que más se parezcan a lo que medía.
 */
export function moverBucle(c: ClickCancion, desde: number, hasta: number, pasos: number, duracion: number): Bucle | null {
  const unos = iniciosDeCompas(c, duracion);
  if (unos.length < 2) return null;
  let en = compasesDe(c, desde, hasta, duracion);
  if (!en) {
    let primero = 0;
    for (let i = 1; i < unos.length; i++) if (Math.abs(unos[i] - desde) < Math.abs(unos[primero] - desde)) primero = i;
    const compas = (unos[unos.length - 1] - unos[0]) / (unos.length - 1);
    en = { primero, cuantos: Math.max(1, Math.round((hasta - desde) / compas)) };
  }
  const cuantos = Math.min(en.cuantos, unos.length - 1);
  const primero = Math.max(0, Math.min(unos.length - 1 - cuantos, en.primero + pasos));
  return { desde: borde(unos[primero], duracion), hasta: borde(unos[primero + cuantos], duracion) };
}
