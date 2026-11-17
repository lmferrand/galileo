// Notas, frecuencias y nombres. Todo se calcula con números MIDI:
// La4 (A4) = 69, Mi2 (cuerda 6 al aire en afinación estándar) = 40.

export type Notacion = "latina" | "letras";

const LATINA_SOST = ["Do", "Do♯", "Re", "Re♯", "Mi", "Fa", "Fa♯", "Sol", "Sol♯", "La", "La♯", "Si"];
const LATINA_BEM = ["Do", "Re♭", "Re", "Mi♭", "Mi", "Fa", "Sol♭", "Sol", "La♭", "La", "Si♭", "Si"];
const LETRAS_SOST = ["C", "C♯", "D", "D♯", "E", "F", "F♯", "G", "G♯", "A", "A♯", "B"];
const LETRAS_BEM = ["C", "D♭", "D", "E♭", "E", "F", "G♭", "G", "A♭", "A", "B♭", "B"];

export function frecuenciaDe(midi: number, la4 = 440): number {
  return la4 * Math.pow(2, (midi - 69) / 12);
}

/** Número MIDI con decimales para una frecuencia (69 = La4). */
export function midiDe(frecuencia: number, la4 = 440): number {
  return 69 + 12 * Math.log2(frecuencia / la4);
}

/** Diferencia en cents entre una frecuencia y la nota objetivo. */
export function centsEntre(frecuencia: number, midiObjetivo: number, la4 = 440): number {
  return 1200 * Math.log2(frecuencia / frecuenciaDe(midiObjetivo, la4));
}

export function nombreNota(midi: number, notacion: Notacion, bemoles = false): string {
  const i = ((Math.round(midi) % 12) + 12) % 12;
  if (notacion === "latina") return (bemoles ? LATINA_BEM : LATINA_SOST)[i];
  return (bemoles ? LETRAS_BEM : LETRAS_SOST)[i];
}

/** Octava en notación científica (Mi2, La4…). */
export function octava(midi: number): number {
  return Math.floor(Math.round(midi) / 12) - 1;
}

/** El nombre separado en letra y alteración, para pintar la alteración más pequeña. */
export function partesNota(midi: number, notacion: Notacion, bemoles = false) {
  const nombre = nombreNota(midi, notacion, bemoles);
  const alteracion = nombre.endsWith("♯") || nombre.endsWith("♭") ? nombre.slice(-1) : "";
  return { base: alteracion ? nombre.slice(0, -1) : nombre, alteracion, octava: octava(midi) };
}

export function formatoHz(hz: number): string {
  return hz.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
