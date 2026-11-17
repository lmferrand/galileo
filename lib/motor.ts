// Motor de escucha: abre el micrófono, lee el audio ~25 veces por segundo,
// detecta la nota y la estabiliza para que la aguja no baile.

import { detectarTono, mediana, reducirAMitad } from "./yin";

export type EstadoMicro = "parado" | "pidiendo" | "escuchando" | "denegado" | "sin-soporte" | "error";

export interface LecturaEstable {
  frecuencia: number;
  /** true si ya no suena nada nuevo y se está mostrando la última nota. */
  retenida: boolean;
}

const INTERVALO_MS = 40;
const RETENER_MS = 900;
const SALTO_CENTS = 70;

/** Junta las lecturas sueltas y devuelve una frecuencia que no tiembla. */
export class Estabilizador {
  private historial: { f: number; t: number }[] = [];
  private ultimaValida = 0;
  private ultimaEstable: number | null = null;

  reiniciar() {
    this.historial = [];
    this.ultimaEstable = null;
  }

  meter(frecuencia: number | null, ahora: number): LecturaEstable | null {
    if (frecuencia === null) {
      if (this.ultimaEstable !== null && ahora - this.ultimaValida < RETENER_MS) {
        return { frecuencia: this.ultimaEstable, retenida: true };
      }
      this.reiniciar();
      return null;
    }

    if (this.historial.length) {
      const ref = mediana(this.historial.map((h) => h.f));
      // Nota nueva (o la cuerda ha cambiado mucho): se empieza de cero.
      if (Math.abs(1200 * Math.log2(frecuencia / ref)) > SALTO_CENTS) this.historial = [];
    }
    this.historial.push({ f: frecuencia, t: ahora });
    this.historial = this.historial.filter((h) => ahora - h.t < 320).slice(-7);
    this.ultimaValida = ahora;

    // Con una sola lectura todavía no nos fiamos (el golpe de la púa engaña).
    if (this.historial.length < 2) {
      return this.ultimaEstable !== null ? { frecuencia: this.ultimaEstable, retenida: true } : null;
    }
    this.ultimaEstable = mediana(this.historial.map((h) => h.f));
    return { frecuencia: this.ultimaEstable, retenida: false };
  }
}

type WebkitWindow = Window & { webkitAudioContext?: typeof AudioContext };

export function crearContextoAudio(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as WebkitWindow).webkitAudioContext;
  return Ctor ? new Ctor() : null;
}

export class Motor {
  contexto: AudioContext | null = null;
  private flujo: MediaStream | null = null;
  private analizador: AnalyserNode | null = null;
  private crudo: Float32Array<ArrayBuffer> = new Float32Array(4096);
  private reducido: Float32Array = new Float32Array(2048);
  private estabilizador = new Estabilizador();
  private raf = 0;
  private ultimoTic = 0;
  private sordoHasta = 0;
  private alLeer: (l: LecturaEstable | null) => void;

  constructor(alLeer: (l: LecturaEstable | null) => void) {
    this.alLeer = alLeer;
  }

  get escuchando() {
    return this.flujo !== null;
  }

  /** Hay que llamarlo desde un toque del usuario (iPhone no deja sonar ni escuchar si no). */
  async empezar(): Promise<EstadoMicro> {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return "sin-soporte";
    if (!this.contexto) this.contexto = crearContextoAudio();
    if (!this.contexto) return "sin-soporte";
    const reanudar = this.contexto.resume();

    try {
      this.flujo = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch (e) {
      const nombre = (e as DOMException)?.name;
      this.flujo = null;
      return nombre === "NotAllowedError" || nombre === "SecurityError" ? "denegado" : "error";
    }
    await reanudar.catch(() => undefined);

    const ctx = this.contexto;
    const fuente = ctx.createMediaStreamSource(this.flujo);
    this.analizador = ctx.createAnalyser();
    this.analizador.fftSize = 4096;
    // El analizador tiene que estar conectado a la salida para que algunos
    // navegadores lo procesen; con volumen 0 no se oye nada.
    const mudo = ctx.createGain();
    mudo.gain.value = 0;
    fuente.connect(this.analizador);
    this.analizador.connect(mudo).connect(ctx.destination);

    this.crudo = new Float32Array(this.analizador.fftSize);
    this.reducido = new Float32Array(this.analizador.fftSize / 2);
    this.estabilizador.reiniciar();
    this.bucle();
    return "escuchando";
  }

  parar() {
    cancelAnimationFrame(this.raf);
    this.flujo?.getTracks().forEach((p) => p.stop());
    this.flujo = null;
    this.analizador?.disconnect();
    this.analizador = null;
    this.estabilizador.reiniciar();
    this.alLeer(null);
  }

  /** Deja de escuchar un rato (mientras suena la nota de referencia). */
  ensordecer(ms: number) {
    this.sordoHasta = performance.now() + ms;
    this.estabilizador.reiniciar();
    this.alLeer(null);
  }

  /** Al volver a la app: el iPhone suspende el audio y a veces corta el micro. */
  async reanudar(): Promise<EstadoMicro | null> {
    if (!this.contexto || !this.flujo) return null;
    const vivo = this.flujo.getAudioTracks().some((p) => p.readyState === "live");
    if (!vivo) {
      this.parar();
      return this.empezar();
    }
    if (this.contexto.state !== "running") await this.contexto.resume().catch(() => undefined);
    return "escuchando";
  }

  private bucle = () => {
    this.raf = requestAnimationFrame(this.bucle);
    const ahora = performance.now();
    if (ahora - this.ultimoTic < INTERVALO_MS || !this.analizador || !this.contexto) return;
    this.ultimoTic = ahora;
    if (ahora < this.sordoHasta) return;

    this.analizador.getFloatTimeDomainData(this.crudo);
    let muestras: Float32Array = this.crudo;
    let frecuencia = this.contexto.sampleRate;
    if (frecuencia > 30000) {
      muestras = reducirAMitad(this.crudo, this.reducido);
      frecuencia /= 2;
    }
    const lectura = detectarTono(muestras, frecuencia, { frecuenciaMin: 55, frecuenciaMax: 1100 });
    const valida = lectura && lectura.claridad > 0.82 ? lectura.frecuencia : null;
    this.alLeer(this.estabilizador.meter(valida, ahora));
  };
}
