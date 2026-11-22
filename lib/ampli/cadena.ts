// El sonido de los equipos de las guitarras: por dónde pasa la guitarra, en orden.
//  - Eléctrica: puerta de ruido → Sostén (compresor) → Brasa (saturación) → Trueno (distorsión) →
//    Marea (chorus) → Eco → el ampli de válvulas: dos válvulas de previo, los tonos, la reverb de
//    muelles, la etapa de potencia y el altavoz.
//  - Acústica: Sostén → Madera (realce) → Marea → Latido (trémolo) → Eco → el ampli de acústica:
//    limpio y de toda la gama, con los tonos y una reverb de sala. Sin puerta (apagaría el final de
//    las notas) y sin nada que sature.
// Está hecho con las piezas del navegador (Web Audio), sin esperar a ver venir el sonido: lo que
// tocas sale en el momento. Las válvulas y los diodos son curvas (WaveShaper, con 4 veces más
// muestras para que no chirríen los agudos) y el altavoz de la eléctrica, unos filtros: lo que le
// hace una caja de 12 pulgadas al sonido (sin graves de más, un bulto de cuerpo, presencia y nada
// por encima de 5 kHz).
// No abre el micro ni la salida: eso lo hace lib/ampli/ampli. Vale también sin tiempo real
// (OfflineAudioContext), que es como se prueba.

import type { AjustesEquipo, EquipoId } from "./ajustes";

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
function curva(f: (x: number) => number, rango: number, puntos = 8193): Float32Array<ArrayBuffer> {
  const c = new Float32Array(puntos);
  for (let i = 0; i < puntos; i++) c[i] = f(((i * 2) / (puntos - 1) - 1) * rango);
  return c;
}

/** Una válvula de previo: satura antes por un lado que por el otro (de ahí su calidez) */
const SESGO = 0.25;
const valvula = (x: number) => (Math.tanh(x + SESGO) - Math.tanh(SESGO)) / (1 - Math.tanh(SESGO) ** 2);
/** Diodos blandos (la saturación) y duros (la distorsión; también el tope del ampli de acústica: hasta la mitad no toca nada) */
const blando = (x: number) => Math.tanh(x);
const duro = (x: number) => x / Math.pow(1 + Math.abs(x) ** 3, 1 / 3);

const R_VALVULA = 8;
const R_POTENCIA = 4;
const R_BRASA = 6;
const R_TRUENO = 10;
const R_LIMPIO = 4;

/** El tiempo del eco (ms) según su mando (0–1) */
export const msDelEco = (v: number) => Math.round(80 + v * 720);

/** Un mando guardado, o su valor de serie si falta */
const n = (v: number | boolean | undefined, serie = 0.5) => (typeof v === "number" ? v : serie);

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

/** Con energía 1: lo que entra y lo que sale suenan igual de fuerte, y el mando de Reverb manda */
function conEnergiaUno(d: Float32Array) {
  let energia = 0;
  for (let i = 0; i < d.length; i++) energia += d[i] * d[i];
  const k = energia > 0 ? 1 / Math.sqrt(energia) : 0;
  for (let i = 0; i < d.length; i++) d[i] *= k;
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
      const puntos = Math.floor(estira * fs);
      const desde = Math.floor(t0 * fs);
      for (let i = 0; i < puntos && desde + i < largo; i++) {
        const t = i / fs;
        // De grave a agudo: 350 → 4200 Hz
        const fase = 2 * Math.PI * (350 * t + ((4200 - 350) * t * t) / (2 * estira));
        const ventana = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / puntos);
        d[desde + i] += (amplitud * ventana * Math.sin(fase)) / Math.sqrt(puntos);
      }
    }
  }
  conEnergiaUno(d);
  return ir;
}

/**
 * La reverb de sala del ampli de acústica: unos primeros rebotes y una cola de ruido que se apaga
 * en un par de segundos y se va oscureciendo (los agudos mueren antes, como en una sala de verdad).
 */
function respuestaSala(ctx: BaseAudioContext): AudioBuffer {
  const fs = ctx.sampleRate;
  const largo = Math.floor(fs * 2.6);
  const ir = ctx.createBuffer(1, largo, fs);
  const d = ir.getChannelData(0);
  // Los primeros rebotes (paredes cercanas)
  const rebotes = [
    [11, 0.5],
    [19, -0.42],
    [27, 0.36],
    [38, -0.3],
    [53, 0.24],
  ];
  for (const [ms, fuerza] of rebotes) d[Math.floor((ms / 1000) * fs)] += fuerza * 6;
  // La cola: ruido que se apaga, pasado por un filtro que se va cerrando
  let previo = 0;
  const empieza = Math.floor(0.03 * fs);
  for (let i = empieza; i < largo; i++) {
    const t = (i - empieza) / fs;
    const abre = 0.55 * Math.exp(-t / 0.9) + 0.06;
    previo += abre * (Math.random() * 2 - 1 - previo);
    d[i] += previo * Math.exp(-t / 0.42) * Math.min(1, t / 0.02);
  }
  conEnergiaUno(d);
  return ir;
}

/** Lo que cada pieza necesita para montarse */
interface Taller {
  ctx: BaseAudioContext;
  /** ¿Está cargado el compresor sin espera de la Mesa (public/compresor.worklet.js)? */
  compresorSinEspera: boolean;
  filtro: (tipo: BiquadFilterType, hz: number, q?: number, ganancia?: number) => BiquadFilterNode;
  moldeador: (f: (x: number) => number, rango: number) => WaveShaperNode;
  ganancia: (v?: number) => GainNode;
}

/** Un pedal o un ampli: por dónde entra, por dónde sale y cómo se le ponen los mandos */
interface Pieza {
  entrada: AudioNode;
  salida: AudioNode;
  aplicar: (a: AjustesEquipo) => void;
  parar?: () => void;
}

/** Sostén: iguala lo flojo y lo fuerte, y la nota aguanta más */
function sosten(t: Taller): Pieza {
  const c = t.ctx;
  let compresor: AudioWorkletNode | DynamicsCompressorNode;
  if (t.compresorSinEspera) {
    compresor = new AudioWorkletNode(c, "compresor-mesa", {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: "explicit",
      processorOptions: { ataque: 0.004, suelta: 0.3 },
    });
    compresor.parameters.get("rodilla")!.value = 8;
  } else {
    const comp = c.createDynamicsCompressor();
    comp.knee.value = 8;
    comp.attack.value = 0.006;
    comp.release.value = 0.3;
    compresor = comp;
  }
  const nivel = t.ganancia();
  compresor.connect(nivel);
  const pisada = new Pisada(c, compresor, nivel);
  const umbral = compresor instanceof AudioWorkletNode ? compresor.parameters.get("umbral")! : compresor.threshold;
  const razon = compresor instanceof AudioWorkletNode ? compresor.parameters.get("razon")! : compresor.ratio;
  return {
    entrada: pisada.entrada,
    salida: pisada.salida,
    aplicar(a) {
      const p = a.pedales.sosten;
      const cantidad = n(p?.cantidad);
      poner(umbral, -12 - cantidad * 30, c);
      poner(razon, 3 + cantidad * 9, c);
      poner(nivel.gain, 0.65 * Math.pow(2 * n(p?.nivel), 1.5), c);
      pisada.pisar(p?.activo === true);
    },
  };
}

/** Brasa: la saturación suave, con los medios por delante (los graves pasan limpios) */
function brasa(t: Taller): Pieza {
  const c = t.ctx;
  const pasaAltos = t.filtro("highpass", 720, 0.5);
  const empuje = t.ganancia();
  const suma = t.ganancia();
  const limpio = t.ganancia();
  pasaAltos.connect(empuje).connect(t.moldeador(blando, R_BRASA)).connect(t.ganancia(0.28)).connect(suma);
  limpio.connect(suma);
  const tono = t.filtro("lowpass", 2000, 0.6);
  const nivel = t.ganancia();
  suma.connect(tono).connect(nivel);
  const entra = t.ganancia();
  entra.connect(pasaAltos);
  entra.connect(limpio);
  const pisada = new Pisada(c, entra, nivel);
  return {
    entrada: pisada.entrada,
    salida: pisada.salida,
    aplicar(a) {
      const p = a.pedales.brasa;
      poner(empuje.gain, (3 * Math.pow(10, 1.6 * n(p?.ganancia))) / R_BRASA, c);
      poner(tono.frequency, 700 * Math.pow(6.5, n(p?.tono)), c);
      poner(nivel.gain, Math.pow(2 * n(p?.nivel), 1.5), c);
      pisada.pisar(p?.activo === true);
    },
  };
}

/** Trueno: la distorsión, recortando duro */
function trueno(t: Taller): Pieza {
  const c = t.ctx;
  const pasaAltos = t.filtro("highpass", 180, 0.6);
  const empuje = t.ganancia();
  const tono = t.filtro("lowpass", 3000, 0.6);
  const nivel = t.ganancia();
  pasaAltos.connect(empuje).connect(t.moldeador(duro, R_TRUENO)).connect(t.ganancia(0.1)).connect(t.filtro("peaking", 700, 0.8, -4)).connect(tono).connect(nivel);
  const pisada = new Pisada(c, pasaAltos, nivel);
  return {
    entrada: pisada.entrada,
    salida: pisada.salida,
    aplicar(a) {
      const p = a.pedales.trueno;
      poner(empuje.gain, (8 * Math.pow(10, 1.9 * n(p?.ganancia))) / R_TRUENO, c);
      poner(tono.frequency, 1200 * Math.pow(6, n(p?.tono)), c);
      poner(nivel.gain, Math.pow(2 * n(p?.nivel), 1.5), c);
      pisada.pisar(p?.activo === true);
    },
  };
}

/** Marea: el chorus (una copia que va y viene de tono, sumada a la tuya) */
function marea(t: Taller): Pieza {
  const c = t.ctx;
  const entra = t.ganancia();
  const suma = t.ganancia();
  const retardo = c.createDelay(0.05);
  retardo.delayTime.value = 0.009;
  const lfo = c.createOscillator();
  const hondura = t.ganancia(0.002);
  lfo.connect(hondura).connect(retardo.delayTime);
  lfo.start();
  entra.connect(t.ganancia(0.85)).connect(suma);
  entra.connect(retardo).connect(t.ganancia(0.7)).connect(suma);
  const pisada = new Pisada(c, entra, suma);
  return {
    entrada: pisada.entrada,
    salida: pisada.salida,
    aplicar(a) {
      const p = a.pedales.marea;
      const velocidad = n(p?.velocidad, 0.3);
      poner(lfo.frequency, 0.15 + velocidad * velocidad * 5, c);
      poner(hondura.gain, 0.0006 + n(p?.hondura) * 0.0035, c);
      pisada.pisar(p?.activo === true);
    },
    parar() {
      try {
        lfo.stop();
      } catch {
        /* ya parado */
      }
    },
  };
}

/** Eco: repeticiones cada vez más apagadas, como una cinta. Al soltarlo, las que quedan acaban */
function eco(t: Taller): Pieza {
  const c = t.ctx;
  const entra = t.ganancia();
  const sale = t.ganancia();
  const ida = t.ganancia(0);
  const retardo = c.createDelay(1.2);
  retardo.delayTime.value = 0.4;
  const realim = t.ganancia(0.3);
  const vuelta = t.ganancia(0.4);
  entra.connect(sale);
  entra.connect(ida).connect(retardo).connect(vuelta).connect(sale);
  retardo.connect(t.filtro("lowpass", 2800, 0.5)).connect(t.filtro("highpass", 180, 0.5)).connect(realim).connect(retardo);
  return {
    entrada: entra,
    salida: sale,
    aplicar(a) {
      const p = a.pedales.eco;
      // (el tiempo cambia despacio: el eco sube o baja de tono mientras, como una cinta)
      poner(retardo.delayTime, msDelEco(n(p?.tiempo, 0.4)) / 1000, c, 0.08);
      poner(realim.gain, n(p?.repite, 0.35) * 0.82, c);
      poner(vuelta.gain, n(p?.mezcla, 0.35) * 1.1, c);
      poner(ida.gain, p?.activo === true ? 1 : 0, c, PISADA);
    },
  };
}

/**
 * Madera: el realce de la acústica. «Cuerpo» engorda la caja (donde resuena la tapa) y «Brillo»
 * abre los agudos y les añade un poco de aire; de paso quita algo del sonido nasal de las pastillas
 * de puente.
 */
function madera(t: Taller): Pieza {
  const c = t.ctx;
  const entra = t.ganancia();
  const cuerpo = t.filtro("peaking", 190, 0.9);
  const brillo = t.filtro("highshelf", 6000);
  const aire = t.ganancia(0);
  const suma = t.ganancia(0.85);
  entra.connect(cuerpo).connect(t.filtro("peaking", 1100, 1.1, -3.5)).connect(brillo).connect(suma);
  // El aire: armónicos nuevos, solo de lo más agudo
  entra
    .connect(t.filtro("highpass", 2800, 0.7))
    .connect(t.ganancia(6 / R_LIMPIO))
    .connect(t.moldeador(blando, R_LIMPIO))
    .connect(t.filtro("highpass", 4000, 0.7))
    .connect(aire)
    .connect(suma);
  const pisada = new Pisada(c, entra, suma);
  return {
    entrada: pisada.entrada,
    salida: pisada.salida,
    aplicar(a) {
      const p = a.pedales.madera;
      poner(cuerpo.gain, n(p?.cuerpo) * 9, c);
      poner(brillo.gain, n(p?.brillo) * 9, c);
      poner(aire.gain, n(p?.brillo) * 0.3, c);
      pisada.pisar(p?.activo === true);
    },
  };
}

/** Latido: el trémolo (el volumen sube y baja solo, a su ritmo) */
function latido(t: Taller): Pieza {
  const c = t.ctx;
  const onda = t.ganancia();
  const compensa = t.ganancia();
  const lfo = c.createOscillator();
  const hondura = t.ganancia(0);
  lfo.connect(hondura).connect(onda.gain);
  lfo.start();
  onda.connect(compensa);
  const pisada = new Pisada(c, onda, compensa);
  return {
    entrada: pisada.entrada,
    salida: pisada.salida,
    aplicar(a) {
      const p = a.pedales.latido;
      const velocidad = n(p?.velocidad, 0.45);
      const d = n(p?.hondura, 0.6) * 0.9;
      poner(lfo.frequency, 1.5 + velocidad * velocidad * 9, c);
      // Va de 1 a 1 − d; lo que se pierde de media se recupera en parte
      poner(onda.gain, 1 - d / 2, c);
      poner(hondura.gain, d / 2, c);
      poner(compensa.gain, Math.pow(1 - d / 2, -0.6), c);
      pisada.pisar(p?.activo === true);
    },
    parar() {
      try {
        lfo.stop();
      } catch {
        /* ya parado */
      }
    },
  };
}

/**
 * El ampli de la eléctrica. Con poca ganancia suena limpio y brillante; con mucha, las dos válvulas
 * saturan, los graves se aprietan (para que no se emborrone) y el volumen se compensa.
 */
function ampliValvulas(t: Taller): Pieza {
  const c = t.ctx;
  const entra = t.filtro("highpass", 75, 0.707);
  const brillo = t.filtro("highshelf", 1600, 0.707, 3);
  const pre1 = t.ganancia();
  const acoplo = t.filtro("highpass", 140, 0.5);
  const pre2 = t.ganancia();
  const compensa = t.ganancia();
  const graves = t.filtro("lowshelf", 120);
  const medios = t.filtro("peaking", 600, 0.7);
  const agudos = t.filtro("highshelf", 2800);
  entra
    .connect(brillo)
    .connect(pre1)
    .connect(t.moldeador(valvula, R_VALVULA))
    .connect(acoplo)
    .connect(pre2)
    .connect(t.moldeador(valvula, R_VALVULA))
    .connect(t.filtro("highpass", 40, 0.5))
    .connect(compensa)
    .connect(graves)
    .connect(medios)
    .connect(agudos);

  // La reverb de muelles, entre los tonos y la etapa de potencia
  const aPotencia = t.ganancia(1 / R_POTENCIA);
  agudos.connect(aPotencia);
  const envio = t.ganancia(0);
  const muelles = c.createConvolver();
  muelles.normalize = false;
  muelles.buffer = respuestaMuelles(c);
  agudos.connect(envio).connect(t.filtro("highpass", 300, 0.5)).connect(muelles).connect(t.filtro("lowpass", 4200, 0.5)).connect(aPotencia);

  // La etapa de potencia (aprieta un poco los picos) y el altavoz
  const volumen = t.ganancia(0);
  aPotencia
    .connect(t.moldeador(blando, R_POTENCIA))
    .connect(t.filtro("highpass", 90, 1))
    .connect(t.filtro("peaking", 130, 1.2, 3))
    .connect(t.filtro("peaking", 400, 0.9, -3.5))
    .connect(t.filtro("peaking", 2500, 1.3, 4.5))
    .connect(t.filtro("lowpass", 4700, 0.9))
    .connect(t.filtro("lowpass", 6000, 0.6))
    .connect(volumen);
  return {
    entrada: entra,
    salida: volumen,
    aplicar(a) {
      const g = n(a.ampli.ganancia, 0.3);
      poner(pre1.gain, (1.5 * Math.pow(10, 1.45 * g)) / R_VALVULA, c);
      poner(pre2.gain, (1 + 5 * g) / R_VALVULA, c);
      poner(brillo.gain, 5 * (1 - g), c);
      poner(acoplo.frequency, 100 + 180 * g, c);
      poner(compensa.gain, 0.45 + 3.75 * Math.pow(1 - g, 3), c);
      poner(graves.gain, (n(a.ampli.graves) - 0.5) * 24, c);
      poner(medios.gain, (n(a.ampli.medios) - 0.5) * 20, c);
      poner(agudos.gain, (n(a.ampli.agudos) - 0.5) * 24, c);
      poner(envio.gain, n(a.ampli.reverb, 0.25) * 0.9, c);
      const v = n(a.ampli.volumen);
      poner(volumen.gain, v * v * 1.6, c);
    },
  };
}

/**
 * El ampli de la acústica: no colorea. La ganancia es cuánto se sube lo que entra (un micro llega
 * flojo; una pastilla, fuerte); si se pasa, un tope suave redondea los picos en vez de saturar.
 * Luego los tonos, una reverb de sala y un altavoz de toda la gama.
 */
function ampliAcustico(t: Taller): Pieza {
  const c = t.ctx;
  const entra = t.filtro("highpass", 65, 0.707);
  const pre = t.ganancia();
  const graves = t.filtro("lowshelf", 110);
  const medios = t.filtro("peaking", 750, 0.8);
  const agudos = t.filtro("highshelf", 4500);
  entra.connect(pre).connect(t.moldeador(duro, R_LIMPIO)).connect(graves).connect(medios).connect(agudos);

  const suma = t.ganancia();
  agudos.connect(suma);
  const envio = t.ganancia(0);
  const antes = c.createDelay(0.1);
  antes.delayTime.value = 0.018;
  const sala = c.createConvolver();
  sala.normalize = false;
  sala.buffer = respuestaSala(c);
  agudos.connect(envio).connect(t.filtro("highpass", 180, 0.5)).connect(antes).connect(sala).connect(suma);

  const volumen = t.ganancia(0);
  suma.connect(t.filtro("highpass", 60, 0.8)).connect(t.filtro("lowpass", 13000, 0.7)).connect(volumen);
  return {
    entrada: entra,
    salida: volumen,
    aplicar(a) {
      // De −6 dB a +24 dB: en el 2, tal cual
      poner(pre.gain, (0.5 * Math.pow(32, n(a.ampli.ganancia, 0.3))) / R_LIMPIO, c);
      poner(graves.gain, (n(a.ampli.graves) - 0.5) * 24, c);
      poner(medios.gain, (n(a.ampli.medios) - 0.5) * 20, c);
      poner(agudos.gain, (n(a.ampli.agudos) - 0.5) * 24, c);
      poner(envio.gain, n(a.ampli.reverb, 0.3) * 1.2, c);
      const v = n(a.ampli.volumen);
      poner(volumen.gain, v * v * 5.6, c);
    },
  };
}

export class CadenaEquipo {
  readonly entrada: GainNode;
  readonly salida: GainNode;
  /** Lo que llega de la guitarra, antes de nada: para la luz de señal */
  readonly medidor: AnalyserNode;
  private puerta: AudioWorkletNode | null = null;
  private piezas: Pieza[];

  /**
   * `modulos`: los procesadores de la Mesa que estén cargados en este contexto (public/*.worklet.js).
   * Sin ellos funciona igual: sin puerta de ruido y con el compresor del navegador (que retrasa 6 ms).
   */
  constructor(
    private ctx: BaseAudioContext,
    tipo: EquipoId,
    modulos: { puerta?: boolean; compresor?: boolean } = {},
  ) {
    const c = ctx;
    const taller: Taller = {
      ctx: c,
      compresorSinEspera: modulos.compresor === true,
      filtro(tipoFiltro, hz, q = 0.707, ganancia = 0) {
        const f = c.createBiquadFilter();
        f.type = tipoFiltro;
        f.frequency.value = hz;
        f.Q.value = q;
        f.gain.value = ganancia;
        return f;
      },
      moldeador(f, rango) {
        const m = c.createWaveShaper();
        m.curve = curva(f, rango);
        m.oversample = "4x";
        return m;
      },
      ganancia(v = 1) {
        const g = c.createGain();
        g.gain.value = v;
        return g;
      },
    };

    // La guitarra entra por un solo cable
    this.entrada = c.createGain();
    this.entrada.channelCount = 1;
    this.entrada.channelCountMode = "explicit";
    this.medidor = c.createAnalyser();
    this.medidor.fftSize = 1024;
    this.entrada.connect(this.medidor);

    let tras: AudioNode = this.entrada;
    // La puerta de ruido, solo en la eléctrica (con saturación el zumbido se oye mucho)
    if (modulos.puerta && tipo === "electrica") {
      this.puerta = new AudioWorkletNode(c, "puerta-ruido", { numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [1] });
      this.puerta.parameters.get("activo")!.value = 1;
      tras.connect(this.puerta);
      tras = this.puerta;
    }

    this.piezas =
      tipo === "acustica"
        ? [sosten(taller), madera(taller), marea(taller), latido(taller), eco(taller), ampliAcustico(taller)]
        : [sosten(taller), brasa(taller), trueno(taller), marea(taller), eco(taller), ampliValvulas(taller)];
    // El cable, de la guitarra al ampli
    for (const p of this.piezas) {
      tras.connect(p.entrada);
      tras = p.salida;
    }
    this.salida = c.createGain();
    tras.connect(this.salida);
  }

  aplicar(a: AjustesEquipo) {
    // Cuanta más ganancia (o con un pedal de saturar pisado), más se oye el ruido: la puerta cierra antes
    if (this.puerta) {
      const fuerte = a.pedales.brasa?.activo || a.pedales.trueno?.activo ? 1 : n(a.ampli.ganancia, 0.3);
      poner(this.puerta.parameters.get("umbral")!, -66 + 10 * fuerte, this.ctx);
    }
    for (const p of this.piezas) p.aplicar(a);
  }

  parar() {
    for (const p of this.piezas) p.parar?.();
  }
}
