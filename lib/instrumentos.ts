// Instrumentos que se pueden afinar. Las guitarras comparten afinaciones (6
// cuerdas) y el bajo tiene las suyas (4). Cada uno lleva su pala.

import { PALA_ACUSTICA, PALA_BAJO, PALA_ELECTRICA, type GeometriaPala } from "./palas";

export type InstrumentoId = "acustica" | "electrica" | "bajo";
export type Familia = "guitarra" | "bajo";

export interface Instrumento {
  id: InstrumentoId;
  /** Como sale en el selector. */
  nombre: string;
  familia: Familia;
  cuerdas: number;
  pala: GeometriaPala;
  /** Foto del estudio sin este instrumento (lo tienes tú delante), desenfocada, de fondo al afinar. */
  fondo?: string;
  /** La misma en horizontal, para PC e iPad tumbado. */
  fondoHorizontal?: string;
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
    fondo: "/fondo/afinar-acustica-3.webp",
    fondoHorizontal: "/fondo/afinar-acustica-h3.webp",
    tuyo: "tu guitarra",
    afinado: "Guitarra afinada",
    frecuenciaMin: 55,
    rango: [28, 76],
  },
  {
    id: "electrica",
    nombre: "Eléctrica",
    familia: "guitarra",
    cuerdas: 6,
    pala: PALA_ELECTRICA,
    fondo: "/fondo/afinar-electrica-3.webp",
    fondoHorizontal: "/fondo/afinar-electrica-h3.webp",
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
    fondo: "/fondo/afinar-bajo-3.webp",
    fondoHorizontal: "/fondo/afinar-bajo-h3.webp",
    tuyo: "tu bajo",
    afinado: "Bajo afinado",
    frecuenciaMin: 27,
    rango: [21, 55],
  },
];

export function instrumentoDe(id: string | undefined): Instrumento {
  return INSTRUMENTOS.find((i) => i.id === id) ?? INSTRUMENTOS[0];
}

// Al abrir la app se elige el instrumento; al volver de Pistas sin recargar la página, ya no.
let elegidoEnEstaVisita = false;
export const yaSeEligio = () => elegidoEnEstaVisita;
// La portada del logo sale una vez al abrir la app (no al volver de Pistas).
let portadaVista = false;
export const yaSeVioPortada = () => portadaVista;
export function marcarPortada() {
  portadaVista = true;
}
export function marcarElegido() {
  elegidoEnEstaVisita = true;
}

const NUMEROS = ["", "una", "dos", "tres", "cuatro", "cinco", "seis", "siete"];

/** «seis», «cuatro». */
export function enLetra(n: number): string {
  return NUMEROS[n] ?? String(n);
}
