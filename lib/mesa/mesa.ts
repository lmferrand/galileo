// La Mesa: la interfaz de audio entra por la entrada elegida en Ajustes (lib/entrada), se separa en
// sus dos entradas y cada una pasa por su canal: ganancia → puerta de ruido → compresor →
// distorsión → ecualizador → chorus → delay → reverb → panorama → volumen. Al final, el volumen
// general y un limitador (nunca satura) hacia la salida (los cascos de la interfaz).
// Vive fuera de la pantalla (un único objeto) para que siga sonando con su hoja cerrada.

import { pedirAudio } from "../entrada";
import { conMaestros, generalEntradas, type AjustesCanal, type AjustesMesa } from "./ajustes";

export type EstadoMesa = "apagada" | "abriendo" | "encendida" | "denegada" | "error" | "sin-soporte";

const SUAVE = 0.03;
const db = (v: number) => Math.pow(10, v / 20);

function poner(p: AudioParam, v: number, ctx: BaseAudioContext) {
  p.setTargetAtTime(v, ctx.currentTime, SUAVE);
}

/**
 * Un efecto que se puede quitar. «Inserción»: o pasa por el efecto o no (compresor, distorsión,
 * ecualizador). «Mezcla»: el sonido limpio sigue y se le suma el efecto (chorus, delay, reverb).
 * Apagado, el efecto se desenchufa (tras fundirse) y no gasta: con 8 canales importa.
 */
class Bloque {
  readonly entrada: GainNode;
  readonly salida: GainNode;
  private seco: GainNode;
  private mojado: GainNode;
  private enchufado = false;
  private desenchufar: ReturnType<typeof setTimeout> | null = null;
  constructor(
    private ctx: AudioContext,
    private desde: AudioNode,
    hasta: AudioNode,
  ) {
    this.entrada = ctx.createGain();
    this.salida = ctx.createGain();
    this.seco = ctx.createGain();
    this.mojado = ctx.createGain();
    this.mojado.gain.value = 0;
    this.entrada.connect(this.seco).connect(this.salida);
    hasta.connect(this.mojado).connect(this.salida);
  }
  private enchufar(activo: boolean) {
    if (activo) {
      if (this.desenchufar) clearTimeout(this.desenchufar);
      this.desenchufar = null;
      if (!this.enchufado) this.entrada.connect(this.desde);
      this.enchufado = true;
    } else if (this.enchufado && !this.desenchufar) {
      this.desenchufar = setTimeout(() => {
        this.desenchufar = null;
        try {
          this.entrada.disconnect(this.desde);
        } catch {
          /* ya estaba suelto */
        }
        this.enchufado = false;
      }, 300);
    }
  }
  insercion(activo: boolean) {
    this.enchufar(activo);
    poner(this.seco.gain, activo ? 0 : 1, this.ctx);
    poner(this.mojado.gain, activo ? 1 : 0, this.ctx);
  }
  mezcla(activo: boolean, cantidad: number) {
    this.enchufar(activo && cantidad > 0);
    poner(this.seco.gain, 1, this.ctx);
    poner(this.mojado.gain, activo ? cantidad : 0, this.ctx);
  }
}

/** Pico (0–1) de lo que pasa por un medidor. */
/** Dos medidores (izquierda y derecha) colgados de un nodo estéreo, para los VU L y R */
export function medidoresPorLado(ctx: BaseAudioContext, de: AudioNode): [AnalyserNode, AnalyserNode] {
  const separa = ctx.createChannelSplitter(2);
  de.connect(separa);
  const lados = [ctx.createAnalyser(), ctx.createAnalyser()] as [AnalyserNode, AnalyserNode];
  lados.forEach((a, i) => {
    a.fftSize = 1024;
    separa.connect(a, i);
  });
  return lados;
}

export function picoDe(a: AnalyserNode | null, datos: Float32Array<ArrayBuffer>): number {
  if (!a) return 0;
  a.getFloatTimeDomainData(datos);
  let m = 0;
  for (let i = 0; i < datos.length; i++) m = Math.max(m, Math.abs(datos[i]));
  return m;
}

function curvaDistorsion(drive: number): Float32Array<ArrayBuffer> {
  const k = 2 + drive * 60;
  const n = 2048;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i * 2) / (n - 1) - 1;
    c[i] = ((1 + k) * x) / (1 + k * Math.abs(x));
  }
  return c;
}

/** Una sala hecha a mano: ruido que se apaga poco a poco, distinto en cada oído. */
function respuestaSala(ctx: BaseAudioContext, tamano: number): AudioBuffer {
  const segundos = 0.5 + tamano * 3.5;
  const largo = Math.floor(ctx.sampleRate * segundos);
  const ir = ctx.createBuffer(2, largo, ctx.sampleRate);
  const curva = 2.2 + (1 - tamano) * 1.5;
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < largo; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / largo, curva);
  }
  return ir;
}

/** Un canal con todos sus efectos. Lo usan las entradas de la Mesa y las pistas del reproductor. */
export class Canal {
  readonly entrada: GainNode;
  readonly salida: GainNode;
  readonly medidor: AnalyserNode;
  private puerta: AudioWorkletNode | null;
  private compresor: DynamicsCompressorNode;
  private maquillaje: GainNode;
  private bComp: Bloque;
  private preDist: GainNode;
  private moldeador: WaveShaperNode;
  private tonoDist: BiquadFilterNode;
  private nivelDist: GainNode;
  private bDist: Bloque;
  private graves: BiquadFilterNode;
  private medios: BiquadFilterNode;
  private agudos: BiquadFilterNode;
  private bEq: Bloque;
  private retChorus: DelayNode;
  private lfo: OscillatorNode;
  private hondura: GainNode;
  private bChorus: Bloque;
  private retDelay: DelayNode;
  private realim: GainNode;
  private bDelay: Bloque;
  private sala: ConvolverNode;
  private bReverb: Bloque;
  private tamanoSala = -1;
  private driveHecho = -1;
  private panorama: StereoPannerNode;
  private volumen: GainNode;

  constructor(
    private ctx: AudioContext,
    conPuerta: boolean,
  ) {
    const c = ctx;
    this.entrada = c.createGain();
    this.medidor = c.createAnalyser();
    this.medidor.fftSize = 1024;
    this.entrada.connect(this.medidor);

    this.puerta = conPuerta ? new AudioWorkletNode(c, "puerta-ruido", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] }) : null;

    this.compresor = c.createDynamicsCompressor();
    this.compresor.knee.value = 10;
    this.compresor.attack.value = 0.004;
    this.compresor.release.value = 0.18;
    this.maquillaje = c.createGain();
    this.compresor.connect(this.maquillaje);
    this.bComp = new Bloque(c, this.compresor, this.maquillaje);

    this.preDist = c.createGain();
    this.moldeador = c.createWaveShaper();
    this.moldeador.oversample = "4x";
    this.tonoDist = c.createBiquadFilter();
    this.tonoDist.type = "lowpass";
    this.nivelDist = c.createGain();
    this.preDist.connect(this.moldeador).connect(this.tonoDist).connect(this.nivelDist);
    this.bDist = new Bloque(c, this.preDist, this.nivelDist);

    this.graves = c.createBiquadFilter();
    this.graves.type = "lowshelf";
    this.graves.frequency.value = 120;
    this.medios = c.createBiquadFilter();
    this.medios.type = "peaking";
    this.medios.frequency.value = 800;
    this.medios.Q.value = 0.9;
    this.agudos = c.createBiquadFilter();
    this.agudos.type = "highshelf";
    this.agudos.frequency.value = 3500;
    this.graves.connect(this.medios).connect(this.agudos);
    this.bEq = new Bloque(c, this.graves, this.agudos);

    this.retChorus = c.createDelay(0.1);
    this.retChorus.delayTime.value = 0.018;
    this.lfo = c.createOscillator();
    this.hondura = c.createGain();
    this.lfo.connect(this.hondura).connect(this.retChorus.delayTime);
    this.lfo.start();
    this.bChorus = new Bloque(c, this.retChorus, this.retChorus);

    this.retDelay = c.createDelay(2);
    this.realim = c.createGain();
    const oscuro = c.createBiquadFilter();
    oscuro.type = "lowpass";
    oscuro.frequency.value = 3800;
    this.retDelay.connect(oscuro).connect(this.realim).connect(this.retDelay);
    this.bDelay = new Bloque(c, this.retDelay, this.retDelay);

    this.sala = c.createConvolver();
    this.bReverb = new Bloque(c, this.sala, this.sala);

    this.panorama = c.createStereoPanner();
    this.volumen = c.createGain();
    this.salida = this.volumen;

    const tras = this.puerta ?? this.entrada;
    if (this.puerta) this.entrada.connect(this.puerta);
    tras.connect(this.bComp.entrada);
    this.bComp.salida.connect(this.bDist.entrada);
    this.bDist.salida.connect(this.bEq.entrada);
    this.bEq.salida.connect(this.bChorus.entrada);
    this.bChorus.salida.connect(this.bDelay.entrada);
    this.bDelay.salida.connect(this.bReverb.entrada);
    this.bReverb.salida.connect(this.panorama).connect(this.volumen);
  }

  aplicar(a: AjustesCanal) {
    const c = this.ctx;
    poner(this.entrada.gain, db(a.ganancia), c);
    if (this.puerta) {
      poner(this.puerta.parameters.get("activo")!, a.puerta.activo ? 1 : 0, c);
      poner(this.puerta.parameters.get("umbral")!, a.puerta.umbral, c);
    }

    poner(this.compresor.threshold, -10 - a.compresor.cantidad * 40, c);
    poner(this.compresor.ratio, 2 + a.compresor.cantidad * 6, c);
    poner(this.maquillaje.gain, db(a.compresor.cantidad * 12), c);
    this.bComp.insercion(a.compresor.activo);

    if (Math.abs(a.distorsion.drive - this.driveHecho) > 0.005) {
      this.moldeador.curve = curvaDistorsion(a.distorsion.drive);
      this.driveHecho = a.distorsion.drive;
    }
    poner(this.preDist.gain, 1 + a.distorsion.drive * 8, c);
    poner(this.tonoDist.frequency, 1500 + a.distorsion.tono * 6500, c);
    poner(this.nivelDist.gain, a.distorsion.nivel * 0.5, c);
    this.bDist.insercion(a.distorsion.activo);

    poner(this.graves.gain, a.ecualizador.graves, c);
    poner(this.medios.gain, a.ecualizador.medios, c);
    poner(this.agudos.gain, a.ecualizador.agudos, c);
    this.bEq.insercion(a.ecualizador.activo);

    poner(this.lfo.frequency, 0.2 + a.chorus.velocidad * 3, c);
    poner(this.hondura.gain, 0.0005 + a.chorus.profundidad * 0.006, c);
    this.bChorus.mezcla(a.chorus.activo, a.chorus.mezcla);

    poner(this.retDelay.delayTime, Math.min(1.9, Math.max(0.05, a.delay.tiempo / 1000)), c);
    poner(this.realim.gain, Math.min(0.85, a.delay.repeticiones), c);
    this.bDelay.mezcla(a.delay.activo, a.delay.mezcla);

    // La sala solo se rehace si cambia de verdad su tamaño (cuesta un poco)
    if (Math.abs(a.reverb.tamano - this.tamanoSala) > 0.02) {
      this.sala.buffer = respuestaSala(c, a.reverb.tamano);
      this.tamanoSala = a.reverb.tamano;
    }
    this.bReverb.mezcla(a.reverb.activo, a.reverb.mezcla);

    poner(this.panorama.pan, a.panorama, c);
    poner(this.volumen.gain, a.silencio ? 0 : a.volumen, c);
  }

  parar() {
    try {
      this.lfo.stop();
    } catch {
      /* ya parado */
    }
  }
}

type Oyente = (e: EstadoMesa) => void;

export class Mesa {
  ctx: AudioContext | null = null;
  estado: EstadoMesa = "apagada";
  /** Cuántas entradas da la interfaz al navegador (1 o 2) */
  entradas = 0;
  /** El nombre de la entrada (lo da el navegador) */
  nombreEntrada = "";
  private flujo: MediaStream | null = null;
  private fuente: MediaStreamAudioSourceNode | null = null;
  private canales: Canal[] = [];
  private general: GainNode | null = null;
  private medidorGeneral: AnalyserNode | null = null;
  private medidoresLado: [AnalyserNode, AnalyserNode] | null = null;
  /** La salida de la Mesa (ya limitada): de aquí se graba la toma */
  private salida: AudioNode | null = null;
  private grabador: AudioWorkletNode | null = null;
  private trozosToma: Float32Array[] = [];
  private oyentes = new Set<Oyente>();
  private datos = new Float32Array(1024);

  alCambiar(f: Oyente): () => void {
    this.oyentes.add(f);
    return () => this.oyentes.delete(f);
  }

  private cambiar(e: EstadoMesa) {
    this.estado = e;
    this.oyentes.forEach((f) => f(e));
  }

  /** Hay que llamarlo desde un toque (el iPhone no deja sonar ni escuchar si no). */
  async encender(ajustes: AjustesMesa): Promise<EstadoMesa> {
    if (this.estado === "encendida" || this.estado === "abriendo") return this.estado;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof AudioContext === "undefined") {
      this.cambiar("sin-soporte");
      return this.estado;
    }
    this.cambiar("abriendo");
    const ctx = new AudioContext({ latencyHint: "interactive" });
    const reanudar = ctx.resume();
    try {
      // En el iPhone: tocar y grabar a la vez (si no, al sonar la canción se corta el micro)
      const sesion = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (sesion) sesion.type = "play-and-record";
    } catch {
      /* navegador sin audioSession */
    }
    try {
      const pedido = pedirAudio();
      const audio = typeof pedido.audio === "object" ? pedido.audio : {};
      this.flujo = await navigator.mediaDevices.getUserMedia({ audio: { ...audio, channelCount: { ideal: 2 } } });
    } catch (e) {
      const nombre = (e as DOMException)?.name;
      await ctx.close().catch(() => undefined);
      this.cambiar(nombre === "NotAllowedError" || nombre === "SecurityError" ? "denegada" : "error");
      return this.estado;
    }
    await reanudar.catch(() => undefined);

    let conPuerta = true;
    try {
      await ctx.audioWorklet.addModule("/puerta.worklet.js");
    } catch {
      conPuerta = false;
    }

    const pista = this.flujo.getAudioTracks()[0];
    this.nombreEntrada = pista?.label ?? "";
    this.fuente = ctx.createMediaStreamSource(this.flujo);
    this.entradas = Math.min(2, Math.max(1, this.fuente.channelCount, pista?.getSettings().channelCount ?? 1));
    const separador = ctx.createChannelSplitter(2);
    this.fuente.connect(separador);

    this.general = ctx.createGain();
    const limitador = ctx.createDynamicsCompressor();
    limitador.threshold.value = -3;
    limitador.ratio.value = 20;
    limitador.knee.value = 0;
    limitador.attack.value = 0.001;
    limitador.release.value = 0.1;
    this.medidorGeneral = ctx.createAnalyser();
    this.medidorGeneral.fftSize = 1024;
    this.general.connect(limitador).connect(this.medidorGeneral).connect(ctx.destination);
    this.medidoresLado = medidoresPorLado(ctx, limitador);
    this.salida = limitador;

    this.canales = [0, 1].map((i) => {
      const canal = new Canal(ctx, conPuerta);
      separador.connect(canal.entrada, i);
      canal.salida.connect(this.general!);
      return canal;
    });
    this.ctx = ctx;
    this.aplicar(ajustes);
    this.cambiar("encendida");
    return this.estado;
  }

  aplicar(a: AjustesMesa) {
    if (!this.ctx || !this.general) return;
    this.canales.forEach((c, i) => c.aplicar(conMaestros(a.canales[i], a.maestros)));
    poner(this.general.gain, generalEntradas(a), this.ctx);
  }

  // ---------- Grabar lo que tocas (REC) ----------
  get grabando() {
    return this.grabador !== null;
  }

  /** Empieza a grabar la salida de la Mesa (hace falta tenerla encendida). */
  async empezarToma(): Promise<boolean> {
    const ctx = this.ctx;
    if (!ctx || !this.salida || this.grabador) return false;
    try {
      await ctx.audioWorklet.addModule("/toma.worklet.js");
    } catch {
      return false;
    }
    const nodo = new AudioWorkletNode(ctx, "clavija-toma", { numberOfInputs: 1, numberOfOutputs: 1, channelCount: 2, channelCountMode: "explicit" });
    this.trozosToma = [];
    nodo.port.onmessage = (e: MessageEvent) => {
      if (e.data instanceof Float32Array) this.trozosToma.push(e.data);
    };
    this.salida.connect(nodo);
    // Sin salida conectada algunos navegadores no lo hacen funcionar (no suena: no escribe nada)
    nodo.connect(ctx.destination);
    nodo.port.postMessage("empezar");
    this.grabador = nodo;
    return true;
  }

  /** Para de grabar y devuelve lo grabado (intercalado) y su frecuencia. */
  pararToma(): Promise<{ muestras: Float32Array; frecuencia: number } | null> {
    const nodo = this.grabador;
    const ctx = this.ctx;
    if (!nodo || !ctx) return Promise.resolve(null);
    this.grabador = null;
    return new Promise((listo) => {
      const acabar = () => {
        nodo.port.onmessage = null;
        nodo.disconnect();
        try {
          this.salida?.disconnect(nodo);
        } catch {
          /* ya desconectada (la Mesa se apagó) */
        }
        const total = this.trozosToma.reduce((n, t) => n + t.length, 0);
        const muestras = new Float32Array(total);
        let i = 0;
        for (const t of this.trozosToma) {
          muestras.set(t, i);
          i += t.length;
        }
        this.trozosToma = [];
        listo({ muestras, frecuencia: ctx.sampleRate });
      };
      const antes = nodo.port.onmessage;
      nodo.port.onmessage = (e: MessageEvent) => {
        if (e.data === "parado") acabar();
        else antes?.call(nodo.port, e);
      };
      nodo.port.postMessage("parar");
      // Por si el hilo de audio ya no contesta
      setTimeout(() => nodo.port.onmessage && acabar(), 600);
    });
  }

  /** Lo que tarda el sonido de la interfaz en llegar a la Mesa (segundos) */
  retrasoEntrada(): number {
    if (!this.ctx) return 0;
    const entrada = (this.flujo?.getAudioTracks()[0]?.getSettings() as MediaTrackSettings & { latency?: number })?.latency ?? 0;
    return entrada + this.ctx.baseLatency;
  }

  apagar() {
    if (this.grabador) {
      this.grabador.disconnect();
      this.grabador = null;
      this.trozosToma = [];
    }
    this.salida = null;
    this.canales.forEach((c) => c.parar());
    this.canales = [];
    this.flujo?.getTracks().forEach((p) => p.stop());
    this.flujo = null;
    this.fuente = null;
    this.general = null;
    this.medidorGeneral = null;
    this.medidoresLado = null;
    this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.entradas = 0;
    this.cambiar("apagada");
  }

  /** Al volver a la app: el iPhone suspende el audio. */
  async reanudar() {
    if (this.ctx && this.ctx.state !== "running") await this.ctx.resume().catch(() => undefined);
  }

  /** Picos (0–1) de cada entrada (ya con su ganancia) y de la salida. */
  niveles(): { canales: number[]; general: number; izq: number; der: number } {
    const [l, r] = this.medidoresLado ?? [null, null];
    return {
      canales: this.canales.map((c) => picoDe(c.medidor, this.datos)),
      general: picoDe(this.medidorGeneral, this.datos),
      izq: picoDe(l, this.datos),
      der: picoDe(r, this.datos),
    };
  }

  /** Lo que tarda en oírse lo que tocas, en ms (lo que el navegador sabe). */
  retrasoMs(): number | null {
    if (!this.ctx) return null;
    const entrada = (this.flujo?.getAudioTracks()[0]?.getSettings() as MediaTrackSettings & { latency?: number })?.latency ?? 0;
    const salida = (this.ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 0;
    return Math.round((this.ctx.baseLatency + salida + entrada) * 1000);
  }
}

/** La Mesa de la app (una sola). */
export const mesa = new Mesa();
