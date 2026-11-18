// Instrumentos que se pueden afinar. Las guitarras comparten afinaciones (6
// cuerdas) y el bajo tiene las suyas (4). Cada uno lleva su pala.

import { PALA_ACUSTICA, PALA_BAJO, type GeometriaPala } from "./palas";

export type InstrumentoId = "acustica" | "bajo";
export type Familia = "guitarra" | "bajo";

export interface Instrumento {
  id: InstrumentoId;
  /** Como sale en el selector. */
  nombre: string;
  familia: Familia;
  cuerdas: number;
  pala: GeometriaPala;
  /** «tu guitarra», «tu bajo»… */
  tuyo: string;
  /** «Guitarra afinada», «Bajo afinado». */
  afinado: string;
  /** Nota más grave que se escucha (Hz): el bajo baja hasta el Si0 de los de 5 cuerdas. */
  frecuenciaMin: number;
  /** Lo que se deja elegir al crear una afinación (MIDI). */
  rango: [number, number];
}

export const INSTRUMENTOS: Instrumento[] = [
  {
    id: "acustica",
    nombre: "Acústica",
    familia: "guitarra",
    cuerdas: 6,
    pala: PALA_ACUSTICA,
    tuyo: "tu guitarra",
    afinado: "Guitarra afinada",
    frecuenciaMin: 55,
    rango: [28, 76],
  },
  {
    id: "bajo",
    nombre: "Bajo",
    familia: "bajo",
    cuerdas: 4,
    pala: PALA_BAJO,
    tuyo: "tu bajo",
    afinado: "Bajo afinado",
    frecuenciaMin: 27,
    rango: [21, 55],
  },
];

export function instrumentoDe(id: string | undefined): Instrumento {
  return INSTRUMENTOS.find((i) => i.id === id) ?? INSTRUMENTOS[0];
}

const NUMEROS = ["", "una", "dos", "tres", "cuatro", "cinco", "seis", "siete"];

/** «seis», «cuatro». */
export function enLetra(n: number): string {
  return NUMEROS[n] ?? String(n);
}
