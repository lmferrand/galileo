// Metrónomo con el reloj de audio: cada golpe se programa un poco por delante,
// así no se retrasa aunque la pantalla vaya cargada. El aviso visual llega en
// el momento justo del golpe.

import { crearContextoAudio } from "./motor";

export type Compas = 2 | 3 | 4 | 6;
export const BPM_MIN = 30;
export const BPM_MAX = 240;

const POR_DELANTE = 0.12; // segundos que se programan por adelantado
const CADA = 25; // ms entre repasos

export interface AjustesMetronomo {
  bpm: number;
  compas: Compas;
}

const CLAVE = "clavija:metronomo:v1";

export function leerAjustesMetronomo(): AjustesMetronomo {
  try {
    const p = JSON.parse(localStorage.getItem(CLAVE) ?? "{}") as Partial<AjustesMetronomo>;
    const bpm = typeof p.bpm === "number" ? Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(p.bpm))) : 90;
    const compas = p.compas === 2 || p.compas === 3 || p.compas === 6 ? p.compas : 4;
    return { bpm, compas };
  } catch {
    return { bpm: 90, compas: 4 };
  }
}

export function guardarAjustesMetronomo(a: AjustesMetronomo) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(a));
  } catch {
    /* sin almacenamiento */
  }
}

export class Metronomo {
  bpm = 90;
  compas: Compas = 4;
  /** Se llama en cada golpe con su número dentro del compás (0 = el primero). */
  alGolpe: ((tiempo: number) => void) | null = null;

  private ctx: AudioContext | null = null;
  private reloj: ReturnType<typeof setInterval> | null = null;
  private siguiente = 0;
  private tiempo = 0;
  private avisos: ReturnType<typeof setTimeout>[] = [];

  get sonando() {
    return this.reloj !== null;
  }

  /** Hay que llamarlo desde un toque (el iPhone solo deja sonar así). */
  empezar() {
    if (this.reloj) return;
    if (!this.ctx) this.ctx = crearContextoAudio();
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.resume().catch(() => undefined);
    this.tiempo = 0;
    this.siguiente = ctx.currentTime + 0.08;
    this.reloj = setInterval(this.programar, CADA);
    this.programar();
  }

  parar() {
    if (this.reloj) clearInterval(this.reloj);
    this.reloj = null;
    this.avisos.forEach(clearTimeout);
    this.avisos = [];
  }

  cerrar() {
    this.parar();
    this.ctx?.close().catch(() => undefined);
    this.ctx = null;
  }

  private programar = () => {
    const ctx = this.ctx;
    if (!ctx) return;
    while (this.siguiente < ctx.currentTime + POR_DELANTE) {
      const tiempo = this.tiempo;
      const cuando = this.siguiente;
      // 6/8: acento fuerte en el 1 y suave en el 4
      const fuerza = tiempo === 0 ? 2 : this.compas === 6 && tiempo === 3 ? 1 : 0;
      this.golpe(ctx, cuando, fuerza);
      const aviso = setTimeout(() => this.alGolpe?.(tiempo), Math.max(0, (cuando - ctx.currentTime) * 1000));
      this.avisos.push(aviso);
      if (this.avisos.length > 16) this.avisos.splice(0, this.avisos.length - 16);
      this.siguiente += 60 / this.bpm;
      this.tiempo = (this.tiempo + 1) % this.compas;
    }
  };

  /** Un golpe seco de madera: un tono corto que cae enseguida, más agudo en el acento. */
  private golpe(ctx: AudioContext, cuando: number, fuerza: number) {
    const osc = ctx.createOscillator();
    const volumen = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(fuerza === 2 ? 1760 : fuerza === 1 ? 1400 : 1100, cuando);
    const pico = fuerza === 2 ? 0.75 : fuerza === 1 ? 0.55 : 0.42;
    volumen.gain.setValueAtTime(0.0001, cuando);
    volumen.gain.exponentialRampToValueAtTime(pico, cuando + 0.002);
    volumen.gain.exponentialRampToValueAtTime(0.0001, cuando + 0.06);
    osc.connect(volumen).connect(ctx.destination);
    osc.start(cuando);
    osc.stop(cuando + 0.08);
  }
}
