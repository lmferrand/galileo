// El juez de «Aprender»: con lo que oye el motor del afinador decide si la nota que suena es la
// que toca. Reglas:
// - Vale la nota pedida con ±45 cents (una guitarra algo desafinada sirve) y también una octava
//   arriba o abajo (el detector a veces salta de octava y para aprender no importa).
// - Si la nota pedida es la MISMA que la anterior, hay que volver a pulsar: la de antes sigue
//   sonando y no cuenta. Una pulsada se nota en el volumen (salto brusco) o tras un silencio.
// - Mientras suena la nota que acabas de acertar no se avisa de nada (no es un fallo).
// - Una nota equivocada se avisa cuando lleva un momento sonando, y una sola vez por pulsada.

import type { LecturaEstable } from "../motor";

export type Veredicto = { tipo: "acierto" } | { tipo: "otra"; midi: number };

const MARGEN = 0.45; // semitonos
const OTRA_MS = 220;
const ATAQUE = 1.7; // el volumen sube tanto sobre el mínimo reciente = cuerda pulsada
const NIVEL_MIN = 0.003;
const VENTANA_NIVEL_MS = 240;
// Tras una pulsada, el volumen sigue muy por encima del silencio de antes un rato: no son más pulsadas
const DESCANSO_MS = 300;

const midiDe = (f: number, la4: number) => 69 + 12 * Math.log2(f / la4);

export class Juez {
  objetivo = 0;
  la4: number;
  private libre = true;
  private ultimaAceptada: number | null = null;
  private niveles: { v: number; t: number }[] = [];
  private otra: { midi: number; desde: number } | null = null;
  private avisada: number | null = null;
  private ultimoAtaque = -Infinity;

  constructor(la4 = 440) {
    this.la4 = la4;
  }

  /** La nota que toca ahora (MIDI). */
  pedir(midi: number) {
    this.objetivo = midi;
    this.otra = null;
  }

  /** Empezar de cero (nueva lección o «otra vez»). */
  reiniciar() {
    this.libre = true;
    this.ultimaAceptada = null;
    this.niveles = [];
    this.otra = null;
    this.avisada = null;
    this.ultimoAtaque = -Infinity;
  }

  /** El volumen del micro en cada lectura: un salto brusco es una cuerda pulsada. */
  nivel(v: number, t: number) {
    this.niveles = this.niveles.filter((n) => t - n.t < VENTANA_NIVEL_MS);
    if (this.niveles.length >= 2) {
      const minimo = Math.min(...this.niveles.map((n) => n.v));
      if (v > NIVEL_MIN && v > minimo * ATAQUE && t - this.ultimoAtaque > DESCANSO_MS) {
        this.ultimoAtaque = t;
        this.pulsada();
      }
    }
    this.niveles.push({ v, t });
  }

  lectura(l: LecturaEstable | null, t: number): Veredicto | null {
    if (!l) {
      // Silencio de verdad: lo siguiente que suene es una pulsada nueva
      this.pulsada();
      this.otra = null;
      return null;
    }
    if (l.retenida) return null;
    const m = midiDe(l.frecuencia, this.la4);

    if (this.coincide(m, this.objetivo)) {
      this.otra = null;
      const repetida = this.ultimaAceptada !== null && this.coincide(m, this.ultimaAceptada);
      if (repetida && !this.libre) return null; // la de antes, que sigue sonando
      this.libre = false;
      this.ultimaAceptada = this.objetivo;
      this.avisada = null;
      return { tipo: "acierto" };
    }

    // La que acabas de acertar sigue sonando: no es un fallo
    if (this.ultimaAceptada !== null && this.coincide(m, this.ultimaAceptada) && !this.libre) return null;

    const r = Math.round(m);
    if (!this.otra || this.otra.midi !== r) {
      this.otra = { midi: r, desde: t };
      return null;
    }
    if (t - this.otra.desde >= OTRA_MS && this.avisada !== r) {
      this.avisada = r;
      return { tipo: "otra", midi: r };
    }
    return null;
  }

  private pulsada() {
    this.libre = true;
    this.avisada = null;
  }

  private coincide(m: number, objetivo: number) {
    const d = m - objetivo;
    return Math.abs(d) <= MARGEN || Math.abs(d - 12) <= MARGEN || Math.abs(d + 12) <= MARGEN;
  }
}
