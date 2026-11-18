// Afinaciones de guitarra (6 cuerdas) y de bajo (4). Las notas van de la
// cuerda más grave a la más aguda, como números MIDI (Mi2 = 40, Mi1 = 28).

import type { Familia } from "./instrumentos";

export type Grupo = "estandar" | "drop" | "abiertas" | "otras" | "mias";

export interface Afinacion {
  id: string;
  nombre: string;
  grupo: Grupo;
  /** Sin poner, es de guitarra. */
  familia?: Familia;
  notas: number[];
  /** Escribir las notas con bemoles (Mi♭) en vez de sostenidos (Re♯). */
  bemoles?: boolean;
  /** Una línea que ayude a elegirla. */
  nota?: string;
}

export const AFINACIONES: Afinacion[] = [
  { id: "estandar", nombre: "Estándar", grupo: "estandar", notas: [40, 45, 50, 55, 59, 64], nota: "La de siempre" },
  { id: "medio-tono", nombre: "Medio tono abajo", grupo: "estandar", notas: [39, 44, 49, 54, 58, 63], bemoles: true, nota: "Hendrix, Nirvana, Guns N’ Roses" },
  { id: "un-tono", nombre: "Un tono abajo", grupo: "estandar", notas: [38, 43, 48, 53, 57, 62], nota: "Más grave y con las cuerdas más blandas" },
  { id: "dos-tonos", nombre: "Dos tonos abajo", grupo: "estandar", notas: [36, 41, 46, 51, 55, 60], bemoles: true },
  { id: "si-estandar", nombre: "Si estándar", grupo: "estandar", notas: [35, 40, 45, 50, 54, 59], nota: "Para cuerdas gruesas" },

  { id: "drop-d", nombre: "Drop D", grupo: "drop", notas: [38, 45, 50, 55, 59, 64], nota: "Solo baja la 6.ª un tono" },
  { id: "doble-drop-d", nombre: "Doble Drop D", grupo: "drop", notas: [38, 45, 50, 55, 59, 62], nota: "Bajan la 6.ª y la 1.ª" },
  { id: "drop-csost", nombre: "Drop C♯", grupo: "drop", notas: [37, 44, 49, 54, 58, 63] },
  { id: "drop-c", nombre: "Drop C", grupo: "drop", notas: [36, 43, 48, 53, 57, 62] },
  { id: "drop-b", nombre: "Drop B", grupo: "drop", notas: [35, 42, 47, 52, 56, 61] },

  { id: "abierta-re", nombre: "Re abierta", grupo: "abiertas", notas: [38, 45, 50, 54, 57, 62], nota: "Al aire suena un acorde de Re" },
  { id: "abierta-sol", nombre: "Sol abierta", grupo: "abiertas", notas: [38, 43, 50, 55, 59, 62], nota: "La del slide y el blues" },
  { id: "abierta-mi", nombre: "Mi abierta", grupo: "abiertas", notas: [40, 47, 52, 56, 59, 64] },
  { id: "abierta-la", nombre: "La abierta", grupo: "abiertas", notas: [40, 45, 52, 57, 61, 64] },
  { id: "abierta-do", nombre: "Do abierta", grupo: "abiertas", notas: [36, 43, 48, 55, 60, 64] },
  { id: "abierta-rem", nombre: "Re menor abierta", grupo: "abiertas", notas: [38, 45, 50, 53, 57, 62] },

  { id: "dadgad", nombre: "DADGAD", grupo: "otras", notas: [38, 45, 50, 55, 57, 62], nota: "Celta y folk" },
  { id: "cuartas", nombre: "Todo cuartas", grupo: "otras", notas: [40, 45, 50, 55, 60, 65] },
  { id: "nashville", nombre: "Nashville", grupo: "otras", notas: [52, 57, 62, 67, 59, 64], nota: "Las cuatro graves una octava más arriba" },
];

export const AFINACIONES_BAJO: Afinacion[] = [
  { id: "bajo-estandar", nombre: "Estándar", grupo: "estandar", familia: "bajo", notas: [28, 33, 38, 43], nota: "La de siempre" },
  { id: "bajo-medio-tono", nombre: "Medio tono abajo", grupo: "estandar", familia: "bajo", notas: [27, 32, 37, 42], bemoles: true, nota: "Para tocar con guitarras medio tono abajo" },
  { id: "bajo-un-tono", nombre: "Un tono abajo", grupo: "estandar", familia: "bajo", notas: [26, 31, 36, 41] },
  { id: "bajo-dos-tonos", nombre: "Dos tonos abajo", grupo: "estandar", familia: "bajo", notas: [24, 29, 34, 39], bemoles: true },
  { id: "bajo-si-estandar", nombre: "Si estándar", grupo: "estandar", familia: "bajo", notas: [23, 28, 33, 38], nota: "Como un bajo de 5 cuerdas sin la de Sol" },

  { id: "bajo-drop-d", nombre: "Drop D", grupo: "drop", familia: "bajo", notas: [26, 33, 38, 43], nota: "Solo baja la 4.ª un tono" },
  { id: "bajo-drop-csost", nombre: "Drop C♯", grupo: "drop", familia: "bajo", notas: [25, 32, 37, 42] },
  { id: "bajo-drop-c", nombre: "Drop C", grupo: "drop", familia: "bajo", notas: [24, 31, 36, 41] },
  { id: "bajo-drop-b", nombre: "Drop B", grupo: "drop", familia: "bajo", notas: [23, 30, 35, 40] },

  { id: "bajo-quintas", nombre: "Quintas", grupo: "otras", familia: "bajo", notas: [24, 31, 38, 45], nota: "Do, Sol, Re, La, como un violonchelo" },
];

export const NOMBRE_GRUPO: Record<Grupo, string> = {
  estandar: "Estándar y más graves",
  drop: "Drop",
  abiertas: "Abiertas",
  otras: "Otras",
  mias: "Tus afinaciones",
};

export const ORDEN_GRUPOS: Grupo[] = ["mias", "estandar", "drop", "abiertas", "otras"];

export const ESTANDAR = AFINACIONES[0];
export const ESTANDAR_BAJO = AFINACIONES_BAJO[0];

export const familiaDe = (a: Afinacion): Familia => a.familia ?? "guitarra";

export function afinacionesDe(familia: Familia): Afinacion[] {
  return familia === "bajo" ? AFINACIONES_BAJO : AFINACIONES;
}

export function estandarDe(familia: Familia): Afinacion {
  return familia === "bajo" ? ESTANDAR_BAJO : ESTANDAR;
}

/** Cuerda 6.ª (o 4.ª) … 1.ª para mostrar al lado de cada nota. */
export function numeroCuerda(indice: number, total = 6): number {
  return total - indice;
}
