// El sonido del equipo de la eléctrica: por dónde pasa la guitarra, en orden.
//   puerta de ruido → Sostén (compresor) → Brasa (saturación) → Trueno (distorsión) → Marea (chorus)
//   → Eco → el amplificador: dos válvulas de previo, los tonos, la reverb de muelles, la etapa de
//   potencia y el altavoz.
// Está hecho con las piezas del navegador (Web Audio), sin esperar a ver venir el sonido: lo que
// tocas sale en el momento. Las válvulas y los diodos son curvas (WaveShaper, con 4 veces más
// muestras para que no chirríen los agudos) y el altavoz, unos filtros: lo que le hace una caja de
// 12 pulgadas al sonido (sin graves de más, un bulto de cuerpo, presencia y nada por encima de 5 kHz).
// No abre el micro ni la salida: eso lo hace lib/ampli/ampli. Vale también sin tiempo real
// (OfflineAudioContext), que es como se prueba.

import type { AjustesEquipo } from "./ajustes";

const SUAVE = 0.03;
/** Al pisar un pedal: sin chasquido, pero al momento */
const PISADA = 0.008;

function poner(p: AudioParam, v: number, ctx: BaseAudioContext, suave = SUAVE) {
  p.setTargetAtTime(v, ctx.currentTime, suave);
}

/**
 * La curva de un WaveShaper: `f` de −rango a +rango. El nodo solo mira de −1 a 1 (lo que pase de
 * ahí lo deja en el extremo), así que quien la use divide antes la señal entre `rango`.
 * Con un número impar de puntos, el cero cae justo en uno.
 */
function curva(f: (x: number) => number, rango: number, n = 8193): Float32Array<ArrayBuffer> {
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) c[i] = f(((i * 2) / (n - 1) - 1) * rango);
  return c;
}

/** Una válvula de previo: satura antes por un lado que por el otro (de ahí su calidez) */
const SESGO = 0.25;
const valvula = (x: number) => (Math.tanh(x + SESGO) - Math.tanh(SESGO)) / (1 - Math.tanh(SESGO) ** 2);
/** Diodos blandos (la saturación) y duros (la distorsión) */
const blando = (x: number) => Math.tanh(x);
const duro = (x: number) => x / Math.pow(1 + Math.abs(x) ** 3, 1 / 3);

const R_VALVULA = 8;
const R_POTENCIA = 4;
const R_BRASA = 6;
const R_TRUENO = 10;

/** El tiempo del eco (ms) según su mando (0–1) */
export const msDelEco = (v: number) => Math.round(80 + v * 720);

/** Un pedal que se pisa: o el sonido pasa por el efecto o pasa de largo. */
class Pisada {
  readonly entrada: GainNode;
  readonly salida: GainNode;
  private seco: GainNode;
  private mojado: GainNode;
  constructor(
    private ctx: BaseAudioContext,
    desde: AudioNode,
    hasta: AudioNode,
  ) {
    this.entrada = ctx.createGain();
    this.salida = ctx.createGain();
    this.seco = ctx.createGain();
    this.mojado = ctx.createGain();
    this.mojado.gain.value = 0;
    this.entrada.connect(this.seco).connect(this.salida);
    this.entrada.connect(desde);
    hasta.connect(this.mojado).connect(this.salida);
  }
  pisar(activo: boolean) {
    poner(this.seco.gain, activo ? 0 : 1, this.ctx, PISADA);
    poner(this.mojado.gain, activo ? 1 : 0, this.ctx, PISADA);
  }
}

/**
 * La reverb de muelles, hecha a mano: tres muelles de distinto largo. En cada uno el golpe va y
 * vuelve, cada vez más flojo y más estirado (los agudos viajan más despacio por el muelle: de ahí
 * su «chof»).
 */
function respuestaMuelles(ctx: BaseAudioContext): AudioBuffer {
  const fs = ctx.sampleRate;
  const largo = Math.floor(fs * 2.4);
  const ir = ctx.createBuffer(1, largo, fs);
  const d = ir.getChannelData(0);
  const muelles = [
    { vuelta: 0.0331, dura: 0.75, fuerza: 1 },
    { vuelta: 0.0413, dura: 0.62, fuerza: 0.85 },
    { vuelta: 0.0577, dura: 0.9, fuerza: 0.7 },
  ];
  for (const m of muelles) {
    for (let k = 1; k * m.vuelta < 2.3; k++) {
      const t0 = k * m.vuelta;
      const amplitud = m.fuerza * Math.exp(-t0 / m.dura) * (k % 2 ? 1 : -1);
      // Cada vuelta, el golpe llega más estirado
      const estira = Math.min(0.045, 0.002 + k * 0.0016);
      const n = Math.floor(estira * fs);
      const desde = Math.floor(t0 * fs);
      for (let i = 0; i < n && desde + i < largo; i++) {
        const t = i / fs;
        // De grave a agudo: 350 → 4200 Hz
        const fase = 2 * Math.PI * (350 * t + ((4200 - 350) * t * t) / (2 * estira));
        const ventana = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / n);
        d[desde + i] += (amplitud * ventana * Math.sin(fase)) / Math.sqrt(n);
      }
    }
  }
  // Con energía 1: lo que entra y lo que sale suenan igual de fuerte, y el mando de Reverb manda
  let energia = 0;
  for (let i = 0; i < largo; i++) energia += d[i] * d[i];
  const k = energia > 0 ? 1 / Math.sqrt(energia) : 0;
  for (let i = 0; i < largo; i++) d[i] *= k;
  return ir;
}

export class CadenaEquipo {
  readonly entrada: GainNode;
  readonly salida: GainNode;
  /** Lo que llega de la guitarra, antes de nada: para la luz de señal */
  readonly medidor: AnalyserNode;

  private puerta: AudioWorkletNode | null = null;
  // Sostén
  private compresor: AudioWorkletNode | DynamicsCompressorNode;
  private nivelSosten: GainNode;
  private pSosten: Pisada;
  // Brasa
  private ganBrasa: GainNode;
  private tonoBrasa: BiquadFilterNode;
  private nivelBrasa: GainNode;
  private pBrasa: Pisada;
  // Trueno
  private ganTrueno: GainNode;
  private tonoTrueno: BiquadFilterNode;
  private nivelTrueno: GainNode;
  private pTrueno: Pisada;
  // Marea
  private lfo: OscillatorNode;
  private hondura: GainNode;
  private pMarea: Pisada;
  // Eco
  private idaEco: GainNode;
  private retEco: DelayNode;
  private realim: GainNode;
  private vueltaEco: GainNode;
  // Ampli
  private brillo: BiquadFilterNode;
  private pre1: GainNode;
  private acoplo: BiquadFilterNode;
  private pre2: GainNode;
  private compensa: GainNode;
  private graves: BiquadFilterNode;
  private medios: BiquadFilterNode;
  private agudos: BiquadFilterNode;
  private envioReverb: GainNode;
  private volumen: GainNode;

  /**
   * `modulos`: los procesadores de la Mesa que estén cargados en este contexto (public/*.worklet.js).
   * Sin ellos funciona igual: sin puerta de ruido y con el compresor del navegador (que retrasa 6 ms).
   */
  constructor(
    private ctx: BaseAudioContext,
    modulos: { puerta?: boolean; compresor?: boolean } = {},
  ) {
    const c = ctx;
    const filtro = (tipo: BiquadFilterType, hz: number, q = 0.707, ganancia = 0) => {
      const f = c.createBiquadFilter();
      f.type = tipo;
      f.frequency.value = hz;
      f.Q.value = q;
      f.gain.value = ganancia;
      return f;
    };
    const moldeador = (f: (x: number) => number, rango: number) => {
      const m = c.createWaveShaper();
      m.curve = curva(f, rango);
      m.oversample = "4x";
      return m;
    };
    const ganancia = (v = 1) => {
      const g = c.createGain();
      g.gain.value = v;
      return g;
    };

    // La guitarra entra por un solo cable
    this.entrada = c.createGain();
    this.entrada.channelCount = 1;
    this.entrada.channelCountMode = "explicit";
    this.medidor = c.createAnalyser();
    this.medidor.fftSize = 1024;
    this.entrada.connect(this.medidor);

    let tras: AudioNode = this.entrada;
    if (modulos.puerta) {
      this.puerta = new AudioWorkletNode(c, "puerta-ruido", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
      this.puerta.parameters.get("activo")!.value = 1;
      tras.connect(this.puerta);
      tras = this.puerta;
    }

    // ---- Sostén: iguala lo flojo y lo fuerte, y la nota aguanta más ----
    if (modulos.compresor) {
      this.compresor = new AudioWorkletNode(c, "compresor-mesa", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        channelCount: 1,
        channelCountMode: "explicit",
        processorOptions: { ataque: 0.004, suelta: 0.3 },
      });
      this.compresor.parameters.get("rodilla")!.value = 8;
    } else {
      const comp = c.createDynamicsCompressor();
      comp.knee.value = 8;
      comp.attack.value = 0.006;
      comp.release.value = 0.3;
      this.compresor = comp;
    }
    this.nivelSosten = ganancia();
    this.compresor.connect(this.nivelSosten);
    this.pSosten = new Pisada(c, this.compresor, this.nivelSosten);

    // ---- Brasa: la saturación suave, con los medios por delante (los graves pasan limpios) ----
    const paBrasa = filtro("highpass", 720, 0.5);
    this.ganBrasa = ganancia();
    const sumaBrasa = ganancia();
    const limpioBrasa = ganancia();
    paBrasa.connect(this.ganBrasa).connect(moldeador(blando, R_BRASA)).connect(ganancia(0.28)).connect(sumaBrasa);
    limpioBrasa.connect(sumaBrasa);
    this.tonoBrasa = filtro("lowpass", 2000, 0.6);
    this.nivelBrasa = ganancia();
    sumaBrasa.connect(this.tonoBrasa).connect(this.nivelBrasa);
    const enBrasa = ganancia();
    enBrasa.connect(paBrasa);
    enBrasa.connect(limpioBrasa);
    this.pBrasa = new Pisada(c, enBrasa, this.nivelBrasa);

    // ---- Trueno: la distorsión, recortando duro ----
    const paTrueno = filtro("highpass", 180, 0.6);
    this.ganTrueno = ganancia();
    this.tonoTrueno = filtro("lowpass", 3000, 0.6);
    this.nivelTrueno = ganancia();
    paTrueno
      .connect(this.ganTrueno)
      .connect(moldeador(duro, R_TRUENO))
      .connect(ganancia(0.1))
      .connect(filtro("peaking", 700, 0.8, -4))
      .connect(this.tonoTrueno)
      .connect(this.nivelTrueno);
    this.pTrueno = new Pisada(c, paTrueno, this.nivelTrueno);

    // ---- Marea: el chorus (una copia que va y viene de tono, sumada a la tuya) ----
    const enMarea = ganancia();
    const sumaMarea = ganancia();
    const retMarea = c.createDelay(0.05);
    retMarea.delayTime.value = 0.009;
    this.lfo = c.createOscillator();
    this.hondura = ganancia(0.002);
    this.lfo.connect(this.hondura).connect(retMarea.delayTime);
    this.lfo.start();
    enMarea.connect(ganancia(0.85)).connect(sumaMarea);
    enMarea.connect(retMarea).connect(ganancia(0.7)).connect(sumaMarea);
    this.pMarea = new Pisada(c, enMarea, sumaMarea);

    // ---- Eco: repeticiones cada vez más apagadas, como una cinta. Al soltarlo, las que quedan acaban ----
    const enEco = ganancia();
    const trasEco = ganancia();
    this.idaEco = ganancia(0);
    this.retEco = c.createDelay(1.2);
    this.retEco.delayTime.value = 0.4;
    this.realim = ganancia(0.3);
    this.vueltaEco = ganancia(0.4);
    enEco.connect(trasEco);
    enEco.connect(this.idaEco).connect(this.retEco).connect(this.vueltaEco).connect(trasEco);
    this.retEco.connect(filtro("lowpass", 2800, 0.5)).connect(filtro("highpass", 180, 0.5)).connect(this.realim).connect(this.retEco);

    // ---- El amplificador ----
    const enAmpli = filtro("highpass", 75, 0.707);
    this.brillo = filtro("highshelf", 1600, 0.707, 3);
    this.pre1 = ganancia();
    this.acoplo = filtro("highpass", 140, 0.5);
    this.pre2 = ganancia();
    this.compensa = ganancia();
    this.graves = filtro("lowshelf", 120);
    this.medios = filtro("peaking", 600, 0.7);
    this.agudos = filtro("highshelf", 2800);
    enAmpli
      .connect(this.brillo)
      .connect(this.pre1)
      .connect(moldeador(valvula, R_VALVULA))
      .connect(this.acoplo)
      .connect(this.pre2)
      .connect(moldeador(valvula, R_VALVULA))
      .connect(filtro("highpass", 40, 0.5))
      .connect(this.compensa)
      .connect(this.graves)
      .connect(this.medios)
      .connect(this.agudos);

    // La reverb de muelles, entre los tonos y la etapa de potencia
    const aPotencia = ganancia(1 / R_POTENCIA);
    this.agudos.connect(aPotencia);
    this.envioReverb = ganancia(0);
    const muelles = c.createConvolver();
    muelles.normalize = false;
    muelles.buffer = respuestaMuelles(c);
    this.agudos.connect(this.envioReverb).connect(filtro("highpass", 300, 0.5)).connect(muelles).connect(filtro("lowpass", 4200, 0.5)).connect(aPotencia);

    // La etapa de potencia (aprieta un poco los picos) y el altavoz
    this.volumen = ganancia(0);
    aPotencia
      .connect(moldeador(blando, R_POTENCIA))
      .connect(filtro("highpass", 90, 1))
      .connect(filtro("peaking", 130, 1.2, 3))
      .connect(filtro("peaking", 400, 0.9, -3.5))
      .connect(filtro("peaking", 2500, 1.3, 4.5))
      .connect(filtro("lowpass", 4700, 0.9))
      .connect(filtro("lowpass", 6000, 0.6))
      .connect(this.volumen);
    this.salida = this.volumen;

    // El cable, de la guitarra al ampli
    tras.connect(this.pSosten.entrada);
    this.pSosten.salida.connect(this.pBrasa.entrada);
    this.pBrasa.salida.connect(this.pTrueno.entrada);
    this.pTrueno.salida.connect(this.pMarea.entrada);
    this.pMarea.salida.connect(enEco);
    trasEco.connect(enAmpli);
  }

  aplicar(a: AjustesEquipo) {
    const c = this.ctx;
    const p = a.pedales;
    const n = (v: number | boolean | undefined, serie = 0.5) => (typeof v === "number" ? v : serie);
    const g = n(a.ampli.ganancia, 0.3);

    // Cuanta más ganancia (o con un pedal de saturar pisado), más se oye el ruido: la puerta cierra antes
    if (this.puerta) poner(this.puerta.parameters.get("umbral")!, -66 + 10 * (p.brasa.activo || p.trueno.activo ? 1 : g), c);

    const cantidad = n(p.sosten.cantidad);
    const umbral = this.compresor instanceof AudioWorkletNode ? this.compresor.parameters.get("umbral")! : this.compresor.threshold;
    const razon = this.compresor instanceof AudioWorkletNode ? this.compresor.parameters.get("razon")! : this.compresor.ratio;
    poner(umbral, -12 - cantidad * 30, c);
    poner(razon, 3 + cantidad * 9, c);
    poner(this.nivelSosten.gain, 0.65 * Math.pow(2 * n(p.sosten.nivel), 1.5), c);
    this.pSosten.pisar(p.sosten.activo);

    poner(this.ganBrasa.gain, (3 * Math.pow(10, 1.6 * n(p.brasa.ganancia))) / R_BRASA, c);
    poner(this.tonoBrasa.frequency, 700 * Math.pow(6.5, n(p.brasa.tono)), c);
    poner(this.nivelBrasa.gain, Math.pow(2 * n(p.brasa.nivel), 1.5), c);
    this.pBrasa.pisar(p.brasa.activo);

    poner(this.ganTrueno.gain, (8 * Math.pow(10, 1.9 * n(p.trueno.ganancia))) / R_TRUENO, c);
    poner(this.tonoTrueno.frequency, 1200 * Math.pow(6, n(p.trueno.tono)), c);
    poner(this.nivelTrueno.gain, Math.pow(2 * n(p.trueno.nivel), 1.5), c);
    this.pTrueno.pisar(p.trueno.activo);

    const velocidad = n(p.marea.velocidad, 0.3);
    poner(this.lfo.frequency, 0.15 + velocidad * velocidad * 5, c);
    poner(this.hondura.gain, 0.0006 + n(p.marea.hondura) * 0.0035, c);
    this.pMarea.pisar(p.marea.activo);

    // (el tiempo cambia despacio: el eco sube o baja de tono mientras, como una cinta)
    poner(this.retEco.delayTime, msDelEco(n(p.eco.tiempo, 0.4)) / 1000, c, 0.08);
    poner(this.realim.gain, n(p.eco.repite, 0.35) * 0.82, c);
    poner(this.vueltaEco.gain, n(p.eco.mezcla, 0.35) * 1.1, c);
    poner(this.idaEco.gain, p.eco.activo ? 1 : 0, c, PISADA);

    // El ampli. Con poca ganancia suena limpio y brillante; con mucha, las dos válvulas saturan, los
    // graves se aprietan (para que no se emborrone) y el volumen se compensa.
    poner(this.pre1.gain, (1.5 * Math.pow(10, 1.45 * g)) / R_VALVULA, c);
    poner(this.pre2.gain, (1 + 5 * g) / R_VALVULA, c);
    poner(this.brillo.gain, 5 * (1 - g), c);
    poner(this.acoplo.frequency, 100 + 180 * g, c);
    poner(this.compensa.gain, 0.45 + 3.75 * Math.pow(1 - g, 3), c);
    poner(this.graves.gain, (n(a.ampli.graves) - 0.5) * 24, c);
    poner(this.medios.gain, (n(a.ampli.medios) - 0.5) * 20, c);
    poner(this.agudos.gain, (n(a.ampli.agudos) - 0.5) * 24, c);
    poner(this.envioReverb.gain, n(a.ampli.reverb, 0.25) * 0.9, c);
    const volumen = n(a.ampli.volumen);
    poner(this.volumen.gain, volumen * volumen * 1.6, c);
  }

  parar() {
    try {
      this.lfo.stop();
    } catch {
      /* ya parado */
    }
  }
}
