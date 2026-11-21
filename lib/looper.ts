// Looper: grabas una vuelta, se repite sola y encima vas añadiendo capas.
//
// Todo va con el reloj del audio. Cada trozo que llega de la entrada trae la hora
// de su primera muestra; una nota tocada a tiempo con lo que oyes llega tarde un
// «retraso» (lo que tarda en salir el sonido y en volver a entrar), así que cada
// muestra se coloca en el bucle en (hora − retraso − inicio) módulo la duración.
// Cada capa es su propio AudioBuffer en bucle, arrancado alineado con el resto.
//
// Modos: libre (tocas para empezar y para cerrar la vuelta) o 1, 2 o 4 compases al
// tempo del metrónomo, con un compás de cuenta previa y clics mientras grabas.

import { crearContextoAudio } from "./motor";
import { pedirAudio } from "./entrada";
import { antesDelMicro, apuntarMicro } from "./sesionAudio";

export type FaseLooper = "apagado" | "listo" | "cuenta" | "grabando" | "sonando" | "capa" | "parado";
export type ModoLooper = "libre" | 1 | 2 | 4;

export interface EstadoLooper {
  fase: FaseLooper;
  capas: number;
  /** segundos de la vuelta (0 sin bucle) */
  largo: number;
  error: string | null;
}

interface Trozo {
  t: number;
  datos: Float32Array;
}

const RETRASO_CLAVE = "clavija:looper:retraso";

export function leerAjusteRetraso(): number {
  try {
    const v = Number(localStorage.getItem(RETRASO_CLAVE));
    return Number.isFinite(v) ? Math.max(-80, Math.min(200, v)) : 0;
  } catch {
    return 0;
  }
}

export function guardarAjusteRetraso(ms: number) {
  try {
    localStorage.setItem(RETRASO_CLAVE, String(ms));
  } catch {
    /* sin almacenamiento */
  }
}

export class Looper {
  alCambiar: ((e: EstadoLooper) => void) | null = null;
  /** Ajuste a mano del retraso (ms), sumado a lo que dice el aparato. */
  ajusteMs = 0;

  private ctx: AudioContext | null = null;
  private flujo: MediaStream | null = null;
  private fuenteEntrada: MediaStreamAudioSourceNode | null = null;
  private captura: AudioWorkletNode | null = null;
  private salida: GainNode | null = null;
  private monitor: GainNode | null = null;

  private trozos: Trozo[] = [];
  private capas: AudioBuffer[] = [];
  private fuentes: AudioBufferSourceNode[] = [];
  private inicio = 0;
  private largo = 0;
  private desde = 0; // inicio de la grabación en curso (reloj del audio)
  private hasta = 0; // fin previsto (modo compases)
  private temporizadores: ReturnType<typeof setTimeout>[] = [];
  private conClic = false; // la primera vuelta se toca con los clics (que también llegan con retraso)
  private estado: EstadoLooper = { fase: "apagado", capas: 0, largo: 0, error: null };

  get fase() {
    return this.estado.fase;
  }

  /** Posición en la vuelta, de 0 a 1 (para dibujar el círculo). */
  get posicion(): number {
    if (!this.ctx || !this.largo || (this.estado.fase !== "sonando" && this.estado.fase !== "capa")) return 0;
    const p = (this.ctx.currentTime - this.inicio) / this.largo;
    return p - Math.floor(p);
  }

  /** Lo que tarda una nota tocada a tiempo en llegar grabada (segundos). */
  get retraso(): number {
    const ctx = this.ctx as (AudioContext & { outputLatency?: number }) | null;
    const salida = (ctx?.outputLatency ?? 0) + (ctx?.baseLatency ?? 0.01);
    const pista = this.flujo?.getAudioTracks()[0];
    const entrada = (pista?.getSettings() as MediaTrackSettings & { latency?: number })?.latency ?? 0.012;
    return Math.max(0, salida + entrada + this.ajusteMs / 1000);
  }

  private publicar(cambio: Partial<EstadoLooper>) {
    this.estado = { ...this.estado, ...cambio, capas: this.capas.length, largo: this.largo };
    this.alCambiar?.(this.estado);
  }

  /** Abre el micro y prepara el audio. Hay que llamarlo desde un toque. */
  async preparar(): Promise<boolean> {
    if (this.ctx && this.captura) return true;
    try {
      this.ctx = this.ctx ?? crearContextoAudio();
      const ctx = this.ctx;
      if (!ctx) throw new Error("Este navegador no deja usar el audio.");
      const reanudar = ctx.resume();
      antesDelMicro();
      this.flujo = await navigator.mediaDevices.getUserMedia(pedirAudio());
      apuntarMicro(this.flujo);
      await reanudar.catch(() => undefined);
      await ctx.audioWorklet.addModule("/captura.worklet.js");
      this.fuenteEntrada = ctx.createMediaStreamSource(this.flujo);
      this.captura = new AudioWorkletNode(ctx, "clavija-captura", { numberOfInputs: 1, numberOfOutputs: 0 });
      this.captura.port.onmessage = (e: MessageEvent<Trozo>) => this.trozos.push(e.data);
      this.fuenteEntrada.connect(this.captura);
      this.salida = ctx.createGain();
      this.salida.connect(ctx.destination);
      this.monitor = ctx.createGain();
      this.monitor.gain.value = 0;
      this.fuenteEntrada.connect(this.monitor).connect(ctx.destination);
      this.publicar({ fase: "listo", error: null });
      return true;
    } catch (e) {
      const nombre = (e as DOMException)?.name;
      this.publicar({
        error:
          nombre === "NotAllowedError" || nombre === "SecurityError"
            ? "No hay permiso para el micrófono. En el iPhone: Ajustes, Safari, Micrófono."
            : "No se ha podido abrir la entrada de sonido.",
      });
      return false;
    }
  }

  /** Ajuste a mano del retraso de las capas (ms). */
  fijarAjuste(ms: number) {
    this.ajusteMs = ms;
  }

  /** Oírte por los auriculares (para una interfaz sin escucha directa). */
  escucharEntrada(si: boolean) {
    if (this.monitor && this.ctx) this.monitor.gain.setTargetAtTime(si ? 1 : 0, this.ctx.currentTime, 0.02);
  }

  /** Primera vuelta. Libre: empieza ya. Compases: un compás de cuenta y graba justo N compases. */
  grabar(modo: ModoLooper, bpm: number, compas: number) {
    const ctx = this.ctx;
    if (!ctx || !this.captura) return;
    this.borrarCapas();
    this.trozos = [];
    this.captura.port.postMessage("empezar");
    if (modo === "libre") {
      this.desde = ctx.currentTime;
      this.hasta = 0;
      this.conClic = false;
      this.publicar({ fase: "grabando" });
      return;
    }
    this.conClic = true;
    const pulso = 60 / bpm;
    const empieza = ctx.currentTime + 0.12 + compas * pulso;
    this.desde = empieza;
    this.hasta = empieza + modo * compas * pulso;
    // Cuenta previa y clics mientras se graba la vuelta (para ir a tiempo).
    for (let i = 0; i < compas * (1 + modo); i++) this.clic(ctx, ctx.currentTime + 0.12 + i * pulso, i % compas === 0);
    this.publicar({ fase: "cuenta" });
    this.programar(() => this.publicar({ fase: "grabando" }), empieza - ctx.currentTime);
    this.programar(() => this.cerrarVuelta(), this.hasta - ctx.currentTime);
  }

  /** Cierra la primera vuelta (en libre, al tocar; en compases, sola) y empieza a sonar. */
  cerrarVuelta() {
    const ctx = this.ctx;
    if (!ctx || (this.estado.fase !== "grabando" && this.estado.fase !== "cuenta")) return;
    const fin = this.hasta > 0 ? this.hasta : ctx.currentTime;
    const desde = this.desde;
    this.largo = Math.max(0.25, fin - desde);
    this.inicio = desde;
    this.hasta = 0;
    // En libre no suena nada mientras grabas: solo cuenta lo que tarda en entrar. Con clics,
    // tocas siguiendo lo que oyes y cuenta el retraso entero.
    const retrasoEntrada = this.conClic ? this.retraso : Math.max(0, this.retraso - this.salidaSola());
    this.publicar({ fase: "sonando" });
    this.programar(() => {
      this.captura?.port.postMessage("parar");
      const capa = this.montarCapa(desde + retrasoEntrada, desde + retrasoEntrada + this.largo, retrasoEntrada);
      this.trozos = [];
      if (capa) this.anadirCapa(capa);
    }, retrasoEntrada + 0.06);
  }

  /** Empieza a grabar una capa encima. */
  empezarCapa() {
    if (!this.ctx || !this.captura || this.estado.fase !== "sonando") return;
    this.trozos = [];
    this.desde = this.ctx.currentTime;
    this.captura.port.postMessage("empezar");
    this.publicar({ fase: "capa" });
  }

  /** Cierra la capa y la suma al bucle. */
  cerrarCapa() {
    const ctx = this.ctx;
    if (!ctx || this.estado.fase !== "capa") return;
    const retraso = this.retraso;
    const desde = this.desde + retraso;
    const hasta = ctx.currentTime + retraso;
    this.publicar({ fase: "sonando" });
    this.programar(() => {
      this.captura?.port.postMessage("parar");
      const capa = this.montarCapa(desde, hasta, retraso);
      this.trozos = [];
      if (capa) this.anadirCapa(capa);
    }, retraso + 0.06);
  }

  deshacer() {
    const f = this.fuentes.pop();
    try {
      f?.stop();
    } catch {
      /* ya parada */
    }
    this.capas.pop();
    if (!this.capas.length) {
      this.largo = 0;
      this.publicar({ fase: "listo" });
    } else this.publicar({});
  }

  parar() {
    if (this.estado.fase === "capa") this.cerrarCapa();
    this.fuentes.forEach((f) => {
      try {
        f.stop();
      } catch {
        /* ya parada */
      }
    });
    this.fuentes = [];
    if (this.capas.length) this.publicar({ fase: "parado" });
  }

  /** Vuelve a sonar desde el principio de la vuelta. */
  seguir() {
    const ctx = this.ctx;
    if (!ctx || !this.capas.length) return;
    this.inicio = ctx.currentTime + 0.05;
    this.fuentes = this.capas.map((c) => this.sonar(c));
    this.publicar({ fase: "sonando" });
  }

  borrar() {
    this.temporizadores.forEach(clearTimeout);
    this.temporizadores = [];
    this.captura?.port.postMessage("parar");
    this.borrarCapas();
    this.publicar({ fase: this.ctx ? "listo" : "apagado" });
  }

  /** El bucle mezclado (todas las capas), mono, a la frecuencia del audio. */
  mezcla(): { muestras: Float32Array; frecuencia: number } | null {
    if (!this.capas.length) return null;
    const n = this.capas[0].length;
    const m = new Float32Array(n);
    for (const c of this.capas) {
      const d = c.getChannelData(0);
      for (let i = 0; i < n; i++) m[i] += d[i];
    }
    for (let i = 0; i < n; i++) m[i] = Math.max(-1, Math.min(1, m[i]));
    return { muestras: m, frecuencia: this.capas[0].sampleRate };
  }

  cerrar() {
    this.borrar();
    this.flujo?.getTracks().forEach((p) => p.stop());
    this.flujo = null;
    this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.captura = null;
    this.estado = { fase: "apagado", capas: 0, largo: 0, error: null };
  }

  // ---------- por dentro ----------

  private salidaSola(): number {
    const ctx = this.ctx as (AudioContext & { outputLatency?: number }) | null;
    return (ctx?.outputLatency ?? 0) + (ctx?.baseLatency ?? 0.01);
  }

  private programar(f: () => void, segundos: number) {
    const id = setTimeout(() => {
      this.temporizadores = this.temporizadores.filter((x) => x !== id);
      f();
    }, Math.max(0, segundos * 1000));
    this.temporizadores.push(id);
  }

  /** Coloca lo grabado entre «desde» y «hasta» (hora del audio) en una vuelta del bucle. */
  private montarCapa(desde: number, hasta: number, retraso: number): AudioBuffer | null {
    const ctx = this.ctx;
    if (!ctx || !this.largo) return null;
    const fr = ctx.sampleRate;
    const n = Math.round(this.largo * fr);
    const capa = ctx.createBuffer(1, n, fr);
    const d = capa.getChannelData(0);
    let algo = false;
    for (const { t, datos } of this.trozos) {
      for (let i = 0; i < datos.length; i++) {
        const ts = t + i / fr;
        if (ts < desde || ts >= hasta) continue;
        let p = Math.round((ts - retraso - this.inicio) * fr) % n;
        if (p < 0) p += n;
        d[p] += datos[i];
        algo = true;
      }
    }
    if (!algo) return null;
    // Bordes suaves en la vuelta (sin chasquido al repetir) si la capa ocupa todo el bucle.
    const borde = Math.min(Math.round(fr * 0.004), n >> 2);
    for (let i = 0; i < borde; i++) {
      const g = i / borde;
      d[i] *= g;
      d[n - 1 - i] *= g;
    }
    return capa;
  }

  private anadirCapa(capa: AudioBuffer) {
    this.capas.push(capa);
    if (this.estado.fase === "sonando" || this.estado.fase === "capa") this.fuentes.push(this.sonar(capa));
    this.publicar({});
  }

  /** Arranca una capa en bucle, alineada con la vuelta. */
  private sonar(capa: AudioBuffer): AudioBufferSourceNode {
    const ctx = this.ctx as AudioContext;
    const f = ctx.createBufferSource();
    f.buffer = capa;
    f.loop = true;
    f.connect(this.salida as GainNode);
    const cuando = ctx.currentTime + 0.03;
    const desfase = (((cuando - this.inicio) % this.largo) + this.largo) % this.largo;
    f.start(Math.max(cuando, this.inicio), this.inicio > cuando ? 0 : desfase);
    return f;
  }

  private borrarCapas() {
    this.fuentes.forEach((f) => {
      try {
        f.stop();
      } catch {
        /* ya parada */
      }
    });
    this.fuentes = [];
    this.capas = [];
    this.largo = 0;
  }

  private clic(ctx: AudioContext, cuando: number, acento: boolean) {
    const osc = ctx.createOscillator();
    const v = ctx.createGain();
    osc.type = "triangle";
    osc.frequency.setValueAtTime(acento ? 1760 : 1100, cuando);
    v.gain.setValueAtTime(0.0001, cuando);
    v.gain.exponentialRampToValueAtTime(acento ? 0.6 : 0.35, cuando + 0.002);
    v.gain.exponentialRampToValueAtTime(0.0001, cuando + 0.05);
    osc.connect(v).connect(ctx.destination);
    osc.start(cuando);
    osc.stop(cuando + 0.07);
  }
}
