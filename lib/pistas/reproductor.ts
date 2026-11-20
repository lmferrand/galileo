// Reproductor de las 6 pistas: un AudioWorklet las toca muestra a muestra
// (public/mezclador.worklet.js), así nunca se desfasan entre sí. Cada pista sale por su lado y
// pasa por su canal de la Mesa (ecualizador, efectos, panorama; lib/mesa/mesa) antes de
// juntarse en el volumen general y un limitador.
// El click del directo sale del mismo worklet (va clavado con la canción) y puede ir con ella por
// los dos lados o solo por la derecha, con la canción en mono por la izquierda: con un cable en Y,
// la izquierda a los altavoces y la derecha a los cascos del músico.

import { FRECUENCIA, PISTAS } from "./tipos";
import { Canal, medidoresPorLado, mesa, picoDe } from "../mesa/mesa";
import type { ClickCancion } from "./ajustesCancion";
import { AJUSTES_PISTA, conMaestros, generalCancion, leerAjustesMesa, leerAjustesPistas, type AjustesCanal } from "../mesa/ajustes";

type CtxAudio = typeof AudioContext;

export interface EstadoReproductor {
  tocando: boolean;
  segundo: number;
}

/** Por dónde sale el click: no suena, junto a la canción o solo en los cascos (por la derecha) */
export type RutaClick = "no" | "juntos" | "cascos";

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
  private medidor: AnalyserNode | null = null;
  private mono: GainNode | null = null;
  private union: ChannelMergerNode | null = null;
  private clickVolumen: GainNode | null = null;
  private ruta: RutaClick = "no";
  private tempo: ClickCancion | null = null;
  private volClick = 0.8;
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
          numberOfOutputs: PISTAS.length + 1,
          outputChannelCount: [...PISTAS.map(() => 2), 1],
          processorOptions: { conClick: true },
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
        general.connect(limitador).connect(medidor);
        // Para los cascos: la canción en mono a la izquierda y el click a la derecha
        const mono = ctx.createGain();
        mono.channelCount = 1;
        mono.channelCountMode = "explicit";
        mono.channelInterpretation = "speakers";
        const union = ctx.createChannelMerger(2);
        mono.connect(union, 0, 0);
        union.connect(ctx.destination);
        const clickVolumen = ctx.createGain();
        clickVolumen.gain.value = this.volClick;
        nodo.connect(clickVolumen, PISTAS.length);
        this.medidor = medidor;
        this.mono = mono;
        this.union = union;
        this.clickVolumen = clickVolumen;
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
          else if (m.tipo === "cuenta") {
            this.esperandoCuenta?.(m.segundos || 0);
            this.esperandoCuenta = null;
          }
        };
        this.ctx = ctx;
        this.nodo = nodo;
        this.enrutar();
        this.mandarClick();
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

  private esperandoCuenta: ((segundos: number) => void) | null = null;

  /** Llamar desde un toque: el iPhone solo deja sonar después de uno. Con `cuenta` y el click
   *  puesto, suena un compás de click antes de que entre la canción (con `forzarCuenta`, aunque el
   *  click esté quitado; con `segundosCuenta`, los golpes que quepan en ese tiempo). Devuelve lo que
   *  dura la cuenta en segundos (0 si no hay). */
  async tocar(opciones?: { cuenta?: boolean; segundosCuenta?: number; forzarCuenta?: boolean }): Promise<number> {
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
    const cuenta = new Promise<number>((ok) => {
      this.esperandoCuenta = ok;
      setTimeout(() => ok(0), 600);
    });
    this.nodo!.port.postMessage({ tipo: "tocar", cuenta: !!opciones?.cuenta, segundos: opciones?.segundosCuenta ?? 0, forzar: !!opciones?.forzarCuenta });
    return cuenta;
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

  /** El pulso de la canción para el click (null: no tiene). */
  tempoClick(t: ClickCancion | null) {
    this.tempo = t;
    this.mandarClick();
  }

  /** Por dónde sale el click. */
  rutaClick(r: RutaClick) {
    this.ruta = r;
    this.enrutar();
    this.mandarClick();
  }

  volumenClick(v: number) {
    this.volClick = v;
    if (this.clickVolumen && this.ctx) this.clickVolumen.gain.setTargetAtTime(v, this.ctx.currentTime, 0.03);
  }

  private mandarClick() {
    const t = this.tempo;
    this.nodo?.port.postMessage({ tipo: "click", activo: this.ruta !== "no" && !!t, golpes: t?.golpes ?? [], uno: t?.uno ?? 0, compas: t?.compas ?? 4 });
  }

  private enrutar() {
    const { ctx, medidor, mono, union, clickVolumen } = this;
    if (!ctx || !medidor || !mono || !union || !clickVolumen) return;
    medidor.disconnect();
    clickVolumen.disconnect();
    if (this.ruta === "cascos") {
      medidor.connect(mono);
      clickVolumen.connect(union, 0, 1);
    } else {
      medidor.connect(ctx.destination);
      // El click está callado si no se ha puesto, salvo en la cuenta de entrada al grabar en la Mesa
      clickVolumen.connect(ctx.destination);
    }
  }

  /** Sube o baja el tono (semitonos, de −6 a +6) sin cambiar la velocidad. */
  tono(semitonos: number) {
    this.nodo?.port.postMessage({ tipo: "tono", semitonos });
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
    this.medidor = null;
    this.mono = null;
    this.union = null;
    this.clickVolumen = null;
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
