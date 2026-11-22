// El equipo de una guitarra (el de la eléctrica o el de la acústica), encendido: abre la entrada elegida en Ajustes (lib/entrada: el micro o
// la interfaz con la guitarra enchufada), la pasa por la pedalera y el ampli (lib/ampli/cadena) y la
// saca por los cascos, con el limitador sin espera de la Mesa al final (nunca satura).
// Como en la Mesa: se le pide al navegador la entrada y la salida más rápidas que tenga y nada de lo
// que se pone en medio espera a ver venir el sonido. El retraso que queda lo pone el aparato.
// Es un único objeto, fuera de la pantalla. Mientras suena, la Mesa tiene sus entradas apagadas (si
// no, la guitarra se oiría dos veces: limpia por la Mesa y por el ampli).

import { pedirAudio } from "../entrada";
import { apuntarMicro, sonarAunqueEnSilencio } from "../sesionAudio";
import { mesa, picoDe } from "../mesa/mesa";
import { CadenaEquipo } from "./cadena";
import type { AjustesEquipo, EquipoId } from "./ajustes";

export type EstadoAmpli = "apagado" | "abriendo" | "encendido" | "denegado" | "error" | "sin-soporte";

/** Lo que tardan las válvulas en «calentarse»: el sonido entra poco a poco al encender (segundos) */
const CALENTAR = 0.5;

type Oyente = (e: EstadoAmpli) => void;

class Ampli {
  estado: EstadoAmpli = "apagado";
  /** Cuántas entradas da el aparato al navegador (1 o 2) */
  entradas = 0;
  /** El nombre de la entrada (lo da el navegador) */
  nombreEntrada = "";
  private ctx: AudioContext | null = null;
  private flujo: MediaStream | null = null;
  private cadena: CadenaEquipo | null = null;
  private porEntrada: GainNode[] = [];
  private medidorSalida: AnalyserNode | null = null;
  private oyentes = new Set<Oyente>();
  private datos = new Float32Array(1024);

  alCambiar(f: Oyente): () => void {
    this.oyentes.add(f);
    return () => this.oyentes.delete(f);
  }

  private cambiar(e: EstadoAmpli) {
    this.estado = e;
    this.oyentes.forEach((f) => f(e));
  }

  /** Hay que llamarlo desde un toque (el iPhone no deja sonar ni escuchar si no). */
  async encender(tipo: EquipoId, ajustes: AjustesEquipo): Promise<EstadoAmpli> {
    if (this.estado === "encendido" || this.estado === "abriendo") return this.estado;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof AudioContext === "undefined") {
      this.cambiar("sin-soporte");
      return this.estado;
    }
    this.cambiar("abriendo");
    if (mesa.estado === "encendida") mesa.apagar();
    const ctx = new AudioContext({ latencyHint: "interactive" });
    const reanudar = ctx.resume();
    try {
      // En el iPhone: sonar y escuchar a la vez
      const sesion = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (sesion) sesion.type = "play-and-record";
    } catch {
      /* navegador sin audioSession */
    }
    let flujo: MediaStream;
    try {
      const pedido = pedirAudio();
      const audio = typeof pedido.audio === "object" ? pedido.audio : {};
      flujo = await navigator.mediaDevices.getUserMedia({ audio: { ...audio, channelCount: { ideal: 2 }, latency: { ideal: 0 } } as MediaTrackConstraints });
      apuntarMicro(flujo);
    } catch (e) {
      const nombre = (e as DOMException)?.name;
      await ctx.close().catch(() => undefined);
      this.cambiar(nombre === "NotAllowedError" || nombre === "SecurityError" ? "denegado" : "error");
      return this.estado;
    }
    await reanudar.catch(() => undefined);

    const cargar = (modulo: string) =>
      ctx.audioWorklet.addModule(modulo).then(
        () => true,
        () => false,
      );
    const [puerta, compresor, sinEspera] = await Promise.all([cargar("/puerta.worklet.js"), cargar("/compresor.worklet.js"), cargar("/limitador.worklet.js")]);

    // (lo han apagado mientras se abría)
    if ((this.estado as EstadoAmpli) !== "abriendo") {
      flujo.getTracks().forEach((p) => p.stop());
      await ctx.close().catch(() => undefined);
      return this.estado;
    }

    const pista = flujo.getAudioTracks()[0];
    this.nombreEntrada = pista?.label ?? "";
    const fuente = ctx.createMediaStreamSource(flujo);
    this.entradas = Math.min(2, Math.max(1, fuente.channelCount, pista?.getSettings().channelCount ?? 1));
    const separador = ctx.createChannelSplitter(2);
    fuente.connect(separador);

    const cadena = new CadenaEquipo(ctx, tipo, { puerta, compresor });
    this.porEntrada = [0, 1].map((i) => {
      const g = ctx.createGain();
      g.gain.value = 0;
      separador.connect(g, i);
      g.connect(cadena.entrada);
      return g;
    });

    let limitador: AudioNode;
    if (sinEspera) limitador = new AudioWorkletNode(ctx, "limitador-mesa", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2] });
    else {
      const l = ctx.createDynamicsCompressor();
      l.threshold.value = -3;
      l.ratio.value = 20;
      l.knee.value = 0;
      l.attack.value = 0.001;
      l.release.value = 0.1;
      limitador = l;
    }
    // Las válvulas se calientan: el sonido entra poco a poco
    const calor = ctx.createGain();
    calor.gain.value = 0;
    calor.gain.setTargetAtTime(1, ctx.currentTime + 0.15, CALENTAR / 3);
    this.medidorSalida = ctx.createAnalyser();
    this.medidorSalida.fftSize = 1024;
    cadena.salida.connect(calor).connect(limitador).connect(this.medidorSalida).connect(ctx.destination);

    this.ctx = ctx;
    this.flujo = flujo;
    this.cadena = cadena;
    this.aplicar(ajustes);
    this.cambiar("encendido");
    return this.estado;
  }

  aplicar(a: AjustesEquipo) {
    if (!this.ctx || !this.cadena) return;
    // Con una sola entrada, esa; con dos, la elegida
    const cual = this.entradas > 1 ? a.entrada : 0;
    this.porEntrada.forEach((g, i) => g.gain.setTargetAtTime(i === cual ? 1 : 0, this.ctx!.currentTime, 0.02));
    this.cadena.aplicar(a);
  }

  apagar() {
    this.cadena?.parar();
    this.cadena = null;
    this.porEntrada = [];
    this.medidorSalida = null;
    this.flujo?.getTracks().forEach((p) => p.stop());
    this.flujo = null;
    this.ctx?.close().catch(() => undefined);
    this.ctx = null;
    this.entradas = 0;
    // (si el metrónomo sigue sonando, que no se calle ahora con el iPhone en silencio)
    sonarAunqueEnSilencio();
    if (this.estado !== "apagado") this.cambiar("apagado");
  }

  /** Al volver a la app: el iPhone suspende el audio y a veces corta el micro (entonces se apaga). */
  async reanudar() {
    if (!this.ctx || !this.flujo) return;
    if (!this.flujo.getAudioTracks().some((p) => p.readyState === "live")) return this.apagar();
    if (this.ctx.state !== "running") await this.ctx.resume().catch(() => undefined);
  }

  /** Picos (0–1) de lo que llega de la guitarra y de lo que sale del ampli */
  niveles(): { entrada: number; salida: number } {
    return { entrada: picoDe(this.cadena?.medidor ?? null, this.datos), salida: picoDe(this.medidorSalida, this.datos) };
  }

  /** Lo que tarda en oírse lo que tocas, en ms (lo que el navegador sabe). */
  retrasoMs(): number | null {
    if (!this.ctx) return null;
    const entrada = (this.flujo?.getAudioTracks()[0]?.getSettings() as MediaTrackSettings & { latency?: number })?.latency ?? 0;
    const salida = (this.ctx as AudioContext & { outputLatency?: number }).outputLatency ?? 0;
    return Math.round((this.ctx.baseLatency + salida + entrada) * 1000);
  }
}

/** El equipo que suena (uno solo a la vez: el de la guitarra que tengas). */
export const ampli = new Ampli();
