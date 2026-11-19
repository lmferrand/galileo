// Reproductor de las 6 pistas: un AudioWorklet las toca muestra a muestra
// (public/mezclador.worklet.js), así nunca se desfasan entre sí. Cada pista sale por su lado y
// pasa por su canal de la Mesa (ecualizador, efectos, panorama; lib/mesa/mesa) antes de
// juntarse en el volumen general y un limitador.

import { FRECUENCIA, PISTAS } from "./tipos";
import { Canal, medidoresPorLado, mesa, picoDe } from "../mesa/mesa";
import { AJUSTES_PISTA, conMaestros, generalCancion, leerAjustesMesa, leerAjustesPistas, type AjustesCanal } from "../mesa/ajustes";

type CtxAudio = typeof AudioContext;

export interface EstadoReproductor {
  tocando: boolean;
  segundo: number;
}

export class Reproductor {
  private ctx: AudioContext | null = null;
  private nodo: AudioWorkletNode | null = null;
  private canales: Canal[] = [];
  private general: GainNode | null = null;
  private medidorGeneral: AnalyserNode | null = null;
  private medidoresLado: [AnalyserNode, AnalyserNode] | null = null;
  private datos = new Float32Array(1024);
  private preparando: Promise<void> | null = null;
  private frames = 0;
  alCambiar: (e: EstadoReproductor) => void = () => undefined;

  private preparar(): Promise<void> {
    if (!this.preparando) {
      this.preparando = (async () => {
        const Ctor: CtxAudio = window.AudioContext ?? (window as unknown as { webkitAudioContext: CtxAudio }).webkitAudioContext;
        let ctx: AudioContext;
        try {
          ctx = new Ctor({ sampleRate: FRECUENCIA, latencyHint: "playback" });
        } catch {
          ctx = new Ctor();
        }
        await ctx.audioWorklet.addModule("/mezclador.worklet.js");
        const nodo = new AudioWorkletNode(ctx, "mezclador-pistas", {
          numberOfInputs: 0,
          numberOfOutputs: PISTAS.length,
          outputChannelCount: PISTAS.map(() => 2),
        });
        // Cada pista a su canal; todas al general y al limitador (nunca satura)
        const general = ctx.createGain();
        const limitador = ctx.createDynamicsCompressor();
        limitador.threshold.value = -1;
        limitador.ratio.value = 20;
        limitador.knee.value = 0;
        limitador.attack.value = 0.002;
        limitador.release.value = 0.12;
        const medidor = ctx.createAnalyser();
        medidor.fftSize = 1024;
        general.connect(limitador).connect(medidor).connect(ctx.destination);
        this.medidoresLado = medidoresPorLado(ctx, limitador);
        const guardados = leerAjustesPistas(PISTAS.length);
        const mesaGuardada = leerAjustesMesa();
        this.canales = PISTAS.map((_, i) => {
          const c = new Canal(ctx, false);
          c.aplicar(paraPista(conMaestros(guardados[i], mesaGuardada.maestros)));
          nodo.connect(c.entrada, i);
          c.salida.connect(general);
          return c;
        });
        general.gain.value = generalCancion(mesaGuardada);
        this.general = general;
        this.medidorGeneral = medidor;
        nodo.port.onmessage = (e: MessageEvent) => {
          const m = e.data;
          if (m.tipo === "pos") this.alCambiar({ tocando: m.tocando, segundo: m.frame / FRECUENCIA });
          else if (m.tipo === "fin") this.alCambiar({ tocando: false, segundo: this.frames / FRECUENCIA });
        };
        this.ctx = ctx;
        this.nodo = nodo;
      })().catch((e) => {
        this.preparando = null;
        throw e;
      });
    }
    return this.preparando;
  }

  /** Cargar las pistas (Int16 estéreo intercalado). Se transfieren: dejan de valer fuera. */
  async cargar(pistas: Int16Array[], frames: number, ganancias: number[]) {
    await this.preparar();
    this.frames = frames;
    this.nodo!.port.postMessage({ tipo: "ganancias", valores: ganancias, inmediato: true });
    this.nodo!.port.postMessage(
      { tipo: "cargar", pistas, frames, frecuencia: FRECUENCIA },
      pistas.map((p) => p.buffer),
    );
  }

  /** Llamar desde un toque: el iPhone solo deja sonar después de uno. */
  async tocar() {
    await this.preparar();
    try {
      const sesion = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      // Que suene aunque el iPhone tenga el interruptor de silencio puesto; con las entradas de la
      // Mesa abiertas, sin cortarles el micro.
      if (sesion) sesion.type = mesa.estado === "encendida" ? "play-and-record" : "playback";
    } catch {
      /* navegador sin audioSession */
    }
    await this.ctx!.resume().catch(() => undefined);
    this.nodo!.port.postMessage({ tipo: "tocar" });
  }

  pausar() {
    this.nodo?.port.postMessage({ tipo: "pausar" });
  }

  ir(segundo: number) {
    this.nodo?.port.postMessage({ tipo: "ir", frame: Math.round(segundo * FRECUENCIA) });
  }

  ganancias(valores: number[]) {
    this.nodo?.port.postMessage({ tipo: "ganancias", valores });
  }

  /** Ecualizador, efectos y panorama de una pista (su volumen y su silencio van en `ganancias`). */
  aplicarPista(i: number, a: AjustesCanal) {
    this.canales[i]?.aplicar(paraPista(a));
  }

  /** El volumen general de la Mesa, que también manda en la canción. */
  volumenGeneral(v: number) {
    if (this.general && this.ctx) this.general.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
  }

  /** Picos (0–1) de cada pista (ya con su volumen) y de la salida. */
  niveles(): { pistas: number[]; general: number; izq: number; der: number } {
    const [l, r] = this.medidoresLado ?? [null, null];
    return {
      pistas: this.canales.map((c) => picoDe(c.medidor, this.datos)),
      general: picoDe(this.medidorGeneral, this.datos),
      izq: picoDe(l, this.datos),
      der: picoDe(r, this.datos),
    };
  }

  // ---------- Escuchar una toma de la Mesa con la canción ----------
  private toma: AudioBufferSourceNode | null = null;

  /** Suena la toma (intercalada, ya recortada) por la salida de la canción, desde ahora. */
  tocarToma(muestras: Float32Array, frecuencia: number) {
    this.pararToma();
    const ctx = this.ctx;
    if (!ctx || !this.general || muestras.length < 4) return;
    const n = muestras.length / 2;
    const buffer = ctx.createBuffer(2, n, frecuencia);
    const l = buffer.getChannelData(0);
    const r = buffer.getChannelData(1);
    for (let i = 0; i < n; i++) {
      l[i] = muestras[i * 2];
      r[i] = muestras[i * 2 + 1];
    }
    const fuente = ctx.createBufferSource();
    fuente.buffer = buffer;
    fuente.connect(this.general);
    fuente.onended = () => {
      if (this.toma === fuente) this.toma = null;
    };
    fuente.start();
    this.toma = fuente;
  }

  pararToma() {
    try {
      this.toma?.stop();
    } catch {
      /* ya parada */
    }
    this.toma = null;
  }

  /** Lo que tarda la canción en salir por los cascos (segundos) */
  retrasoSalida(): number {
    const ctx = this.ctx as (AudioContext & { outputLatency?: number }) | null;
    return ctx ? ctx.baseLatency + (ctx.outputLatency ?? 0) : 0;
  }

  // El espectro de cada pista tras su fader (en dB por banda de frecuencia), para el aviso de mezcla
  private espectrosDatos: Float32Array<ArrayBuffer>[] = [];
  espectros(): { datos: Float32Array<ArrayBuffer>[]; hz: number } | null {
    if (!this.ctx || this.canales.length === 0) return null;
    if (this.espectrosDatos.length !== this.canales.length) this.espectrosDatos = this.canales.map((c) => new Float32Array(c.espectro.frequencyBinCount));
    this.canales.forEach((c, i) => c.espectro.getFloatFrequencyData(this.espectrosDatos[i]));
    return { datos: this.espectrosDatos, hz: this.ctx.sampleRate / (2 * this.espectrosDatos[0].length) };
  }

  /** 0,5 = a la mitad de velocidad, sin cambiar el tono. */
  velocidad(valor: number) {
    this.nodo?.port.postMessage({ tipo: "velocidad", valor });
  }

  /** Repetir de `desde` a `hasta` (segundos); null para dejar de repetir. */
  bucle(desde: number | null, hasta?: number) {
    if (desde === null || hasta === undefined) this.nodo?.port.postMessage({ tipo: "bucle", a: null });
    else this.nodo?.port.postMessage({ tipo: "bucle", a: Math.round(desde * FRECUENCIA), b: Math.round(hasta * FRECUENCIA) });
  }

  async cerrar() {
    this.pararToma();
    this.nodo?.port.postMessage({ tipo: "vaciar" });
    this.nodo?.disconnect();
    this.canales.forEach((c) => c.parar());
    this.canales = [];
    this.general = null;
    this.medidorGeneral = null;
    this.medidoresLado = null;
    const ctx = this.ctx;
    this.ctx = null;
    this.nodo = null;
    this.preparando = null;
    await ctx?.close().catch(() => undefined);
  }
}

/** En el canal de una pista, el volumen y el silencio no mandan: ya vienen del reproductor. */
function paraPista(a: AjustesCanal | undefined): AjustesCanal {
  return { ...(a ?? AJUSTES_PISTA), volumen: 1, silencio: false, puerta: { ...(a ?? AJUSTES_PISTA).puerta, activo: false } };
}
