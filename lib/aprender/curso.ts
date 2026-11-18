// El curso de guitarra de «Aprender»: unidades y lecciones. Cada paso es una nota que hay que
// tocar (cuerda y traste); la app escucha y avanza cuando suena la correcta (lib/aprender/juez.ts).
// Las melodías son populares y de dominio público; los riffs, propios. Todo en primera posición y
// afinación estándar. Se escriben como «cuerda-traste»: «3-2» = cuerda 3 (Sol), traste 2.

export interface Paso {
  /** 1 = Mi agudo … 6 = Mi grave */
  cuerda: number;
  /** 0 = al aire */
  traste: number;
}

export interface Leccion {
  id: string;
  titulo: string;
  /** Una frase de ayuda, si hace falta */
  consejo?: string;
  /** «melodia»: se ven las siguientes notas en un carril */
  tipo: "notas" | "melodia";
  pasos: Paso[];
}

export interface Unidad {
  id: string;
  titulo: string;
  lecciones: Leccion[];
}

/** Afinación estándar en MIDI, de la cuerda 1 (Mi4) a la 6 (Mi2). */
export const ESTANDAR = [64, 59, 55, 50, 45, 40];

export const midiDePaso = (p: Paso) => ESTANDAR[p.cuerda - 1] + p.traste;

/** El dedo de la mano izquierda en primera posición (0 = al aire). */
export const dedoDePaso = (p: Paso) => Math.min(p.traste, 4);

const pasos = (texto: string): Paso[] =>
  texto
    .trim()
    .split(/\s+/)
    .filter((x) => x !== "|")
    .map((x) => {
      const [cuerda, traste] = x.split("-").map(Number);
      return { cuerda, traste };
    });

export const CURSO: Unidad[] = [
  {
    id: "aire",
    titulo: "Las cuerdas al aire",
    lecciones: [
      { id: "aire-graves", titulo: "Mi y La graves", tipo: "notas", consejo: "Sin pisar: toca la cuerda que se ilumina.", pasos: pasos("6-0 6-0 6-0 5-0 5-0 5-0 6-0 5-0 6-0 5-0") },
      { id: "aire-medias", titulo: "Re y Sol", tipo: "notas", pasos: pasos("4-0 4-0 4-0 3-0 3-0 3-0 4-0 3-0 4-0 3-0") },
      { id: "aire-agudas", titulo: "Si y Mi agudo", tipo: "notas", pasos: pasos("2-0 2-0 2-0 1-0 1-0 1-0 2-0 1-0 2-0 1-0") },
      { id: "aire-seis", titulo: "Las seis", tipo: "notas", pasos: pasos("6-0 5-0 4-0 3-0 2-0 1-0 1-0 2-0 3-0 4-0 5-0 6-0") },
    ],
  },
  {
    id: "primeras",
    titulo: "Primeras notas",
    lecciones: [
      { id: "prim-c1", titulo: "Mi, Fa y Sol", tipo: "notas", consejo: "Pisa justo detrás del traste, con la punta del dedo.", pasos: pasos("1-0 1-1 1-3 1-1 1-0 1-3 1-1 1-0") },
      { id: "prim-c2", titulo: "Si, Do y Re", tipo: "notas", pasos: pasos("2-0 2-1 2-3 2-1 2-0 2-3 2-1 2-0") },
      { id: "prim-c3", titulo: "Sol y La", tipo: "notas", pasos: pasos("3-0 3-2 3-0 3-2 3-2 3-0 3-2 3-0") },
      { id: "prim-escala", titulo: "La escala de Do", tipo: "melodia", pasos: pasos("2-1 2-3 1-0 1-1 1-3 1-1 1-0 2-3 2-1") },
    ],
  },
  {
    id: "melodias",
    titulo: "Melodías",
    lecciones: [
      { id: "mel-estrellita", titulo: "Estrellita", tipo: "melodia", pasos: pasos("3-0 3-0 2-3 2-3 1-0 1-0 2-3 | 2-1 2-1 2-0 2-0 3-2 3-2 3-0") },
      {
        id: "mel-oda",
        titulo: "Oda a la alegría",
        tipo: "melodia",
        pasos: pasos("2-0 2-0 2-1 2-3 2-3 2-1 2-0 3-2 3-0 3-0 3-2 2-0 2-0 3-2 3-2 | 2-0 2-0 2-1 2-3 2-3 2-1 2-0 3-2 3-0 3-0 3-2 2-0 3-2 3-0 3-0"),
      },
      {
        id: "mel-cumple",
        titulo: "Cumpleaños feliz",
        tipo: "melodia",
        pasos: pasos("3-0 3-0 3-2 3-0 2-1 2-0 | 3-0 3-0 3-2 3-0 2-3 2-1 | 3-0 3-0 1-3 1-0 2-1 2-0 3-2 | 1-1 1-1 1-0 2-1 2-3 2-1"),
      },
      {
        id: "mel-martinillo",
        titulo: "Martinillo",
        tipo: "melodia",
        pasos: pasos("3-0 3-2 2-0 3-0 3-0 3-2 2-0 3-0 | 2-0 2-1 2-3 2-0 2-1 2-3 | 2-3 1-0 2-3 2-1 2-0 3-0 2-3 1-0 2-3 2-1 2-0 3-0 | 3-0 4-0 3-0 3-0 4-0 3-0"),
      },
    ],
  },
  {
    id: "riffs",
    titulo: "Riffs y escalas",
    lecciones: [
      { id: "riff-blues", titulo: "Blues en Mi", tipo: "melodia", consejo: "Despacio primero; el ritmo llega solo.", pasos: pasos("6-0 6-3 5-0 5-1 5-0 6-3 6-0 | 6-0 6-3 5-0 5-1 5-0 6-3 6-0") },
      { id: "riff-rock", titulo: "Rock en La", tipo: "melodia", pasos: pasos("5-0 5-3 4-0 4-2 4-0 5-3 5-0 5-0 | 5-0 5-3 4-0 4-2 4-0 5-3 5-0 5-0") },
      { id: "riff-penta", titulo: "Pentatónica de Mi menor", tipo: "melodia", pasos: pasos("6-0 6-3 5-0 5-2 4-0 4-2 3-0 3-2 2-0 2-3 1-0 1-3 | 1-3 1-0 2-3 2-0 3-2 3-0 4-2 4-0 5-2 5-0 6-3 6-0") },
    ],
  },
];

export const TODAS = CURSO.flatMap((u) => u.lecciones);

export function siguienteDe(id: string): Leccion | null {
  const i = TODAS.findIndex((l) => l.id === id);
  return i >= 0 && i + 1 < TODAS.length ? TODAS[i + 1] : null;
}
