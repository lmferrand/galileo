// Reproductor de las 6 pistas: un AudioWorklet las mezcla muestra a muestra
// (public/mezclador.worklet.js), así nunca se desfasan entre sí.

import { FRECUENCIA } from "./tipos";

type CtxAudio = typeof AudioContext;

export interface EstadoReproductor {
  tocando: boolean;
  segundo: number;
}

export class Reproductor {
  private ctx: AudioContext | null = null;
  private nodo: AudioWorkletNode | null = null;
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
          numberOfOutputs: 1,
          outputChannelCount: [2],
        });
        nodo.connect(ctx.destination);
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
      // Que suene aunque el iPhone tenga el interruptor de silencio puesto.
      if (sesion) sesion.type = "playback";
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
    this.nodo?.port.postMessage({ tipo: "vaciar" });
    this.nodo?.disconnect();
    const ctx = this.ctx;
    this.ctx = null;
    this.nodo = null;
    this.preparando = null;
    await ctx?.close().catch(() => undefined);
  }
}
