// Sonido de cada instrumento al elegirlo en el estudio. Nada de grabaciones: las
// cuerdas se simulan con el método de Karplus-Strong (un ruido corto que da vueltas
// por un retardo y se va suavizando, como una cuerda pulsada) y luego pasan por su
// «caja»: cuerpo de madera, amplificador limpio o saturado, o el del bajo.
//
// Hay varias recetas por instrumento (VARIANTES); en la app suena la de ELEGIDOS.
// En /sonidos se pueden escuchar todas para elegir.

import type { InstrumentoId } from "./instrumentos";

type CtxAudio = typeof AudioContext;

let ctx: AudioContext | null = null;
let sala: AudioBuffer | null = null;

function contexto(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor: CtxAudio | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: CtxAudio }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor({ latencyHint: "interactive" });
  return ctx;
}

const nota = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

interface Pulso {
  midi: number;
  /** segundos desde el principio */
  cuando: number;
  /** −1 izquierda … 1 derecha */
  pan: number;
  /** 0,5 = cuerda apagada pronto, 0,1 = muy brillante */
  suavizado: number;
  /** pérdida por vuelta (0,95–0,9995): cuánto dura */
  sostener: number;
  /** 0–1: ruido del ataque más o menos brillante */
  ataque: number;
  volumen: number;
  /** segundo en que se apaga la cuerda (otra nota en la misma cuerda, la mano que la para) */
  hasta?: number;
}

/** Las cuerdas de un sonido, mezcladas en un búfer estéreo. */
function cuerdas(c: BaseAudioContext, pulsos: Pulso[], duracion: number): AudioBuffer {
  const sr = c.sampleRate;
  const largo = Math.round(duracion * sr);
  const buf = c.createBuffer(2, largo, sr);
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
  const apagado = Math.round(0.04 * sr);
  for (const p of pulsos) {
    // El suavizado retrasa medio ciclo: se descuenta para que la nota quede afinada.
    const periodo = Math.max(2, Math.round(sr / nota(p.midi) - p.suavizado));
    const linea = new Float32Array(periodo);
    let previo = 0;
    for (let i = 0; i < periodo; i++) {
      const ruido = Math.random() * 2 - 1;
      previo = previo + (ruido - previo) * (0.15 + 0.85 * p.ataque);
      linea[i] = previo;
    }
    const izq = Math.cos(((p.pan + 1) * Math.PI) / 4) * p.volumen;
    const der = Math.sin(((p.pan + 1) * Math.PI) / 4) * p.volumen;
    const inicio = Math.round(p.cuando * sr);
    const fin = p.hasta === undefined ? largo : Math.min(largo, Math.round(p.hasta * sr) + apagado);
    const empiezaApagado = p.hasta === undefined ? largo : Math.round(p.hasta * sr);
    let k = 0;
    for (let n = inicio; n < fin; n++) {
      const a = linea[k];
      const b = linea[(k + 1) % periodo];
      linea[k] = p.sostener * ((1 - p.suavizado) * a + p.suavizado * b);
      k = (k + 1) % periodo;
      // Fundidos: al final del sonido y cuando la cuerda se apaga
      let g = Math.min(1, (largo - n) / (0.25 * sr));
      if (n >= empiezaApagado) g *= 1 - (n - empiezaApagado) / apagado;
      L[n] += a * izq * g;
      R[n] += a * der * g;
    }
  }
  return buf;
}

/** Una sala pequeña: ruido que se apaga en unos 0,8 s. */
function respuestaSala(c: BaseAudioContext): AudioBuffer {
  if (sala && sala.sampleRate === c.sampleRate) return sala;
  const sr = c.sampleRate;
  const largo = Math.round(0.8 * sr);
  const b = c.createBuffer(2, largo, sr);
  for (let canal = 0; canal < 2; canal++) {
    const d = b.getChannelData(canal);
    for (let i = 0; i < largo; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / largo, 3.2) * 0.5;
  }
  sala = b;
  return b;
}

function saturacion(c: BaseAudioContext, fuerza: number): WaveShaperNode {
  const n = 2048;
  const curva = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curva[i] = Math.tanh(x * fuerza) / Math.tanh(fuerza);
  }
  const w = c.createWaveShaper();
  w.curve = curva;
  w.oversample = "4x";
  return w;
}

function filtro(c: BaseAudioContext, tipo: BiquadFilterType, frecuencia: number, q = 0.7, ganancia = 0): BiquadFilterNode {
  const f = c.createBiquadFilter();
  f.type = tipo;
  f.frequency.value = frecuencia;
  f.Q.value = q;
  f.gain.value = ganancia;
  return f;
}

function ganancia(c: BaseAudioContext, valor: number): GainNode {
  const g = c.createGain();
  g.gain.value = valor;
  return g;
}

function compresor(c: BaseAudioContext): DynamicsCompressorNode {
  const k = c.createDynamicsCompressor();
  k.threshold.value = -18;
  k.ratio.value = 4;
  return k;
}

/** Encadena nodos y devuelve el último. */
function cadena(desde: AudioNode, ...nodos: AudioNode[]): AudioNode {
  let ultimo = desde;
  for (const n of nodos) ultimo = ultimo.connect(n);
  return ultimo;
}

// ---- Las «cajas» ----
type Caja = (c: BaseAudioContext, entrada: AudioNode) => AudioNode;

/** Guitarra acústica: graves de la caja de madera y brillo de las cuerdas de acero. */
const madera: Caja = (c, e) => cadena(e, filtro(c, "peaking", 110, 1.1, 5), filtro(c, "highshelf", 3200, 0.7, 3), filtro(c, "lowpass", 9000));
/** Amplificador saturado con su altavoz de guitarra. */
const saturado =
  (fuerza: number): Caja =>
  (c, e) =>
    cadena(e, filtro(c, "highpass", 90), ganancia(c, 3.2), saturacion(c, fuerza), filtro(c, "peaking", 900, 0.9, 4), filtro(c, "lowpass", 3800, 0.9));
/** Amplificador limpio y brillante. */
const limpio: Caja = (c, e) => cadena(e, filtro(c, "highpass", 80), filtro(c, "peaking", 2500, 0.8, 3), filtro(c, "lowpass", 7000));
/**
 * Bajo con los dedos. El altavoz del móvil casi no da graves: un poco de saturación le
 * pone armónicos (el oído «oye» el grave por ellos) y un punto de medios, el chasquido.
 */
const bajoDedos: Caja = (c, e) =>
  cadena(e, ganancia(c, 1.6), saturacion(c, 1.8), filtro(c, "lowpass", 2200, 0.8), filtro(c, "peaking", 80, 1, 3), filtro(c, "peaking", 800, 1.2, 5), compresor(c));
/** Bajo en slap: mucho chasquido arriba y golpe abajo. */
const bajoSlap: Caja = (c, e) =>
  cadena(e, ganancia(c, 1.4), saturacion(c, 1.6), filtro(c, "peaking", 90, 1, 4), filtro(c, "peaking", 2500, 0.9, 7), filtro(c, "lowpass", 6500), compresor(c));
/** Bajo con púa: ataque marcado y algo sucio. */
const bajoPua: Caja = (c, e) =>
  cadena(e, ganancia(c, 2), saturacion(c, 2.4), filtro(c, "peaking", 1500, 1, 5), filtro(c, "lowpass", 3000), compresor(c));

interface Receta {
  pulsos: Pulso[];
  duracion: number;
  caja: Caja;
  /** cuánta sala */
  sala: number;
  volumen: number;
  /** dos copias un pelín desafinadas: el «chorus» de las guitarras limpias */
  coro?: boolean;
  /** estirón de cuerda (bend) y vibrato */
  estiron?: { desde: number; hasta: number; semitonos: number; vibrato: number };
}

/** Un rasgueo: las cuerdas una detrás de otra (hacia arriba, al revés). */
function rasgueo(midis: number[], cuando: number, o: Omit<Pulso, "midi" | "cuando" | "pan"> & { separacion: number; arriba?: boolean }): Pulso[] {
  const orden = o.arriba ? [...midis].reverse() : midis;
  return orden.map((midi, i) => ({
    midi,
    cuando: cuando + i * o.separacion,
    pan: -0.5 + (midis.indexOf(midi) / Math.max(1, midis.length - 1)),
    suavizado: o.suavizado,
    sostener: o.sostener,
    ataque: o.ataque,
    volumen: o.volumen,
    hasta: o.hasta,
  }));
}

/** Varias notas seguidas: cada una se apaga cuando entra la siguiente. */
function linea(midis: number[], cada: number, o: Omit<Pulso, "midi" | "cuando" | "pan" | "hasta">): Pulso[] {
  return midis.map((midi, i) => ({ midi, cuando: i * cada, pan: 0, ...o, hasta: i < midis.length - 1 ? (i + 1) * cada : undefined }));
}

export interface Variante {
  id: string;
  nombre: string;
  detalle: string;
  receta: () => Receta;
}

export const VARIANTES: Record<InstrumentoId, Variante[]> = {
  acustica: [
    {
      id: "acustica-1",
      nombre: "Rasgueo de Mi mayor",
      detalle: "Un golpe hacia abajo con las seis cuerdas al aire.",
      receta: () => ({
        pulsos: rasgueo([40, 47, 52, 56, 59, 64], 0, { separacion: 0.016, suavizado: 0.32, sostener: 0.9965, ataque: 0.85, volumen: 0.26 }),
        duracion: 2.6,
        caja: madera,
        sala: 0.28,
        volumen: 1.4,
      }),
    },
    {
      id: "acustica-2",
      nombre: "Arpegio de Sol con los dedos",
      detalle: "Las cuerdas de una en una, como al puntear.",
      receta: () => ({
        pulsos: [43, 50, 55, 59, 67, 59].map((midi, i) => ({ midi, cuando: i * 0.15, pan: -0.5 + i * 0.2, suavizado: 0.38, sostener: 0.9975, ataque: 0.6, volumen: 0.34 })),
        duracion: 2.8,
        caja: madera,
        sala: 0.3,
        volumen: 1.12,
      }),
    },
    {
      id: "acustica-3",
      nombre: "Rasgueo folk de Re",
      detalle: "Abajo, arriba y abajo, con ritmo de canción.",
      receta: () => {
        const re = [50, 57, 62, 66];
        const comun = { suavizado: 0.3, sostener: 0.9965, ataque: 0.85 };
        return {
          pulsos: [
            ...rasgueo(re, 0, { ...comun, separacion: 0.014, volumen: 0.3, hasta: 0.3 }),
            ...rasgueo(re, 0.3, { ...comun, separacion: 0.009, volumen: 0.2, arriba: true, hasta: 0.6 }),
            ...rasgueo(re, 0.6, { ...comun, separacion: 0.014, volumen: 0.3 }),
          ],
          duracion: 2.8,
          caja: madera,
          sala: 0.28,
          volumen: 1.26,
        };
      },
    },
    {
      id: "acustica-4",
      nombre: "Armónicos del traste 12",
      detalle: "Notas de campanita, suaves y largas.",
      receta: () => ({
        pulsos: [52, 57, 62, 67, 71, 76].map((midi, i) => ({ midi, cuando: i * 0.11, pan: -0.5 + i * 0.2, suavizado: 0.5, sostener: 0.9993, ataque: 0.15, volumen: 0.36 })),
        duracion: 3,
        caja: madera,
        sala: 0.45,
        volumen: 1.6,
      }),
    },
  ],
  electrica: [
    {
      id: "electrica-1",
      nombre: "Quinta de La saturada",
      detalle: "Un acorde de rock con el amplificador apretado.",
      receta: () => ({
        pulsos: rasgueo([45, 52, 57], 0, { separacion: 0.012, suavizado: 0.22, sostener: 0.9985, ataque: 0.95, volumen: 0.5 }),
        duracion: 2.6,
        caja: saturado(3.5),
        sala: 0.22,
        volumen: 0.18,
      }),
    },
    {
      id: "electrica-2",
      nombre: "Acorde limpio con brillo",
      detalle: "Mi menor con novena, limpio y con chorus.",
      receta: () => ({
        pulsos: rasgueo([40, 47, 54, 55, 59, 66], 0, { separacion: 0.022, suavizado: 0.25, sostener: 0.998, ataque: 0.8, volumen: 0.22 }),
        duracion: 3,
        caja: limpio,
        sala: 0.35,
        volumen: 1.26,
        coro: true,
      }),
    },
    {
      id: "electrica-3",
      nombre: "Riff de rock",
      detalle: "Dos golpes apagados con la mano y el acorde abierto.",
      receta: () => {
        const mi5 = [40, 47, 52];
        const apagado = { separacion: 0.008, suavizado: 0.5, sostener: 0.985, ataque: 0.9, volumen: 0.5 };
        return {
          pulsos: [
            ...rasgueo(mi5, 0, { ...apagado, hasta: 0.16 }),
            ...rasgueo(mi5, 0.18, { ...apagado, hasta: 0.34 }),
            ...rasgueo(mi5, 0.36, { separacion: 0.012, suavizado: 0.22, sostener: 0.9985, ataque: 0.95, volumen: 0.5 }),
          ],
          duracion: 2.8,
          caja: saturado(4),
          sala: 0.2,
          volumen: 0.18,
        };
      },
    },
    {
      id: "electrica-4",
      nombre: "Nota solista con estirón",
      detalle: "Una nota que sube un tono y vibra, como en un solo.",
      receta: () => ({
        pulsos: [{ midi: 62, cuando: 0, pan: 0, suavizado: 0.2, sostener: 0.9995, ataque: 0.95, volumen: 0.6 }],
        duracion: 2.8,
        caja: saturado(5),
        sala: 0.35,
        volumen: 0.2,
        estiron: { desde: 0.25, hasta: 0.45, semitonos: 2, vibrato: 0.006 },
      }),
    },
  ],
  bajo: [
    {
      id: "bajo-1",
      nombre: "Mi grave y su octava",
      detalle: "El Mi al aire con el pulgar y la octava pellizcada.",
      receta: () => ({
        pulsos: [
          { midi: 28, cuando: 0, pan: -0.1, suavizado: 0.36, sostener: 0.9992, ataque: 0.6, volumen: 0.9 },
          { midi: 40, cuando: 0.2, pan: 0.15, suavizado: 0.2, sostener: 0.998, ataque: 0.95, volumen: 0.6 },
        ],
        duracion: 2.4,
        caja: bajoDedos,
        sala: 0.08,
        volumen: 0.32,
      }),
    },
    {
      id: "bajo-2",
      nombre: "Slap",
      detalle: "Golpe de pulgar, nota muerta y pellizco: funky.",
      receta: () => ({
        pulsos: [
          { midi: 28, cuando: 0, pan: -0.1, suavizado: 0.15, sostener: 0.997, ataque: 1, volumen: 0.9, hasta: 0.36 },
          { midi: 33, cuando: 0.12, pan: 0, suavizado: 0.5, sostener: 0.95, ataque: 1, volumen: 0.4, hasta: 0.2 },
          { midi: 40, cuando: 0.24, pan: 0.15, suavizado: 0.12, sostener: 0.997, ataque: 1, volumen: 0.7 },
          { midi: 28, cuando: 0.36, pan: -0.1, suavizado: 0.15, sostener: 0.9985, ataque: 1, volumen: 0.9 },
        ],
        duracion: 2.4,
        caja: bajoSlap,
        sala: 0.08,
        volumen: 0.32,
      }),
    },
    {
      id: "bajo-3",
      nombre: "Línea caminando",
      detalle: "Mi, Sol, La y Si con los dedos, como un walking.",
      receta: () => ({
        pulsos: linea([28, 31, 33, 35], 0.32, { suavizado: 0.4, sostener: 0.999, ataque: 0.55, volumen: 0.85 }),
        duracion: 2.8,
        caja: bajoDedos,
        sala: 0.08,
        volumen: 0.32,
      }),
    },
    {
      id: "bajo-4",
      nombre: "Con púa",
      detalle: "Un La grave repetido con púa, para empujar el rock.",
      receta: () => ({
        pulsos: linea([33, 33, 33, 33, 33], 0.16, { suavizado: 0.25, sostener: 0.9985, ataque: 0.95, volumen: 0.8 }),
        duracion: 2.4,
        caja: bajoPua,
        sala: 0.08,
        volumen: 0.32,
      }),
    },
  ],
};

/** El sonido de cada instrumento en la app. */
export const ELEGIDOS: Record<InstrumentoId, string> = { acustica: "acustica-1", electrica: "electrica-1", bajo: "bajo-1" };

function buscar(id: string): Variante | undefined {
  for (const lista of Object.values(VARIANTES)) {
    const v = lista.find((x) => x.id === id);
    if (v) return v;
  }
  return undefined;
}

function montar(c: BaseAudioContext, receta: Receta, destino: AudioNode) {
  const salida = ganancia(c, receta.volumen);
  salida.connect(destino);
  const conSala = c.createConvolver();
  conSala.buffer = respuestaSala(c);
  conSala.connect(ganancia(c, receta.sala)).connect(salida);

  const buffer = cuerdas(c, receta.pulsos, receta.duracion);
  const entrada = c.createGain();
  const fuentes: AudioBufferSourceNode[] = [];
  const principal = c.createBufferSource();
  principal.buffer = buffer;
  principal.connect(entrada);
  fuentes.push(principal);
  if (receta.coro) {
    const copia = c.createBufferSource();
    copia.buffer = buffer;
    copia.playbackRate.value = 1.0045;
    const retardo = c.createDelay(0.05);
    retardo.delayTime.value = 0.014;
    copia.connect(retardo).connect(ganancia(c, 0.7)).connect(entrada);
    fuentes.push(copia);
  }
  const fin = receta.caja(c, entrada);
  fin.connect(salida);
  fin.connect(conSala);

  const empezar = (t: number) => {
    const e = receta.estiron;
    for (const f of fuentes) {
      const base = f.playbackRate.value;
      if (e) {
        const arriba = base * Math.pow(2, e.semitonos / 12);
        f.playbackRate.setValueAtTime(base, t + e.desde);
        f.playbackRate.linearRampToValueAtTime(arriba, t + e.hasta);
        if (e.vibrato) {
          const lfo = c.createOscillator();
          lfo.frequency.value = 5.5;
          const cuanto = ganancia(c, 0);
          cuanto.gain.setValueAtTime(0, t + e.hasta);
          cuanto.gain.linearRampToValueAtTime(arriba * e.vibrato, t + e.hasta + 0.4);
          lfo.connect(cuanto).connect(f.playbackRate);
          lfo.start(t + e.hasta);
          lfo.stop(t + receta.duracion);
        }
      }
      f.start(t);
    }
  };
  return { empezar, salida, fuentes };
}

/** Suena un instrumento (o una variante concreta). Hay que llamarlo dentro del toque: el iPhone lo exige. */
export function sonarInstrumento(id: InstrumentoId, varianteId: string = ELEGIDOS[id]) {
  const c = contexto();
  const v = buscar(varianteId);
  if (!c || !v) return;
  void c.resume().catch(() => undefined);
  const { empezar, salida, fuentes } = montar(c, v.receta(), c.destination);
  empezar(c.currentTime + 0.03);
  fuentes[0].onended = () => {
    // Deja que acabe la cola de la sala y suelta los nodos
    setTimeout(() => salida.disconnect(), 1000);
  };
}

/** Para medirlos sin altavoz (pruebas): una variante en un búfer. */
export async function renderizarVariante(varianteId: string): Promise<AudioBuffer | null> {
  const v = buscar(varianteId);
  if (!v) return null;
  const receta = v.receta();
  const c = new OfflineAudioContext(2, Math.round((receta.duracion + 0.8) * 44100), 44100);
  montar(c, receta, c.destination).empezar(0);
  return c.startRendering();
}
