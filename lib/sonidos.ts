// Sonido de cada instrumento al elegirlo en el estudio. Nada de grabaciones: las
// cuerdas se simulan con el método de Karplus-Strong (un ruido corto que da vueltas
// por un retardo y se va suavizando, como una cuerda pulsada) y luego cada una pasa
// por su «caja»:
//  - acústica: rasgueo de un Mi mayor abierto, con cuerpo de madera y algo de sala;
//  - eléctrica: quinta de La con el amplificador saturado;
//  - bajo: un Mi grave con el pulgar y su octava pellizcada, redondo.

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
  /** 0 grave … 1 aguda: dónde suena en estéreo (−1 izquierda, 1 derecha) */
  pan: number;
  /** 0,5 = cuerda apagada pronto, 0,1 = muy brillante */
  suavizado: number;
  /** pérdida por vuelta (0,99–0,9995): cuánto dura */
  sostener: number;
  /** 0–1: ruido del ataque más o menos brillante */
  ataque: number;
  volumen: number;
}

/** Las cuerdas de un sonido, mezcladas en un búfer estéreo. */
function cuerdas(c: BaseAudioContext, pulsos: Pulso[], duracion: number): AudioBuffer {
  const sr = c.sampleRate;
  const largo = Math.round(duracion * sr);
  const buf = c.createBuffer(2, largo, sr);
  const L = buf.getChannelData(0);
  const R = buf.getChannelData(1);
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
    let k = 0;
    for (let n = inicio; n < largo; n++) {
      const a = linea[k];
      const b = linea[(k + 1) % periodo];
      const v = p.sostener * ((1 - p.suavizado) * a + p.suavizado * b);
      linea[k] = v;
      k = (k + 1) % periodo;
      // Fundido al final para que no se corte de golpe
      const cola = Math.min(1, (largo - n) / (0.25 * sr));
      L[n] += a * izq * cola;
      R[n] += a * der * cola;
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

/** Suena el instrumento elegido. Hay que llamarlo dentro del toque (el iPhone lo exige). */
export function sonarInstrumento(id: InstrumentoId) {
  const c = contexto();
  if (!c) return;
  void c.resume().catch(() => undefined);
  const { fuente, salida } = montar(c, id, c.destination);
  fuente.start(c.currentTime + 0.03);
  fuente.onended = () => {
    // Deja que acabe la cola de la sala y suelta los nodos
    setTimeout(() => salida.disconnect(), 1000);
  };
}

/** Para escucharlos sin altavoz (pruebas): el sonido de cada instrumento en un búfer. */
export async function renderizarInstrumento(id: InstrumentoId): Promise<AudioBuffer> {
  const c = new OfflineAudioContext(2, Math.round(3.4 * 44100), 44100);
  montar(c, id, c.destination).fuente.start(0);
  return c.startRendering();
}

function montar(c: BaseAudioContext, id: InstrumentoId, destino: AudioNode) {
  const fuente = c.createBufferSource();
  const salida = c.createGain();
  salida.connect(destino);
  // La sala, en paralelo con el sonido seco
  const conSala = c.createConvolver();
  conSala.buffer = respuestaSala(c);
  const mojado = c.createGain();
  conSala.connect(mojado).connect(salida);

  let entrada: AudioNode;
  if (id === "acustica") {
    // Rasgueo hacia abajo de un Mi mayor abierto: Mi2 Si2 Mi3 Sol#3 Si3 Mi4
    const acorde = [40, 47, 52, 56, 59, 64];
    fuente.buffer = cuerdas(
      c,
      acorde.map((midi, i) => ({ midi, cuando: i * 0.016, pan: -0.5 + i * 0.2, suavizado: 0.32, sostener: 0.9965, ataque: 0.85, volumen: 0.26 })),
      2.6,
    );
    // Cuerpo de madera: graves redondos y algo de brillo de las cuerdas de acero
    const cuerpo = filtro(c, "peaking", 110, 1.1, 5);
    const brillo = filtro(c, "highshelf", 3200, 0.7, 3);
    const techo = filtro(c, "lowpass", 9000);
    fuente.connect(cuerpo).connect(brillo).connect(techo);
    entrada = techo;
    mojado.gain.value = 0.28;
    salida.gain.value = 0.9;
  } else if (id === "electrica") {
    // Quinta de La (La2 Mi3 La3) con púa, saturada en el amplificador
    const acorde = [45, 52, 57];
    fuente.buffer = cuerdas(
      c,
      acorde.map((midi, i) => ({ midi, cuando: i * 0.012, pan: -0.25 + i * 0.25, suavizado: 0.22, sostener: 0.9985, ataque: 0.95, volumen: 0.5 })),
      2.6,
    );
    const antes = filtro(c, "highpass", 90);
    const empuje = c.createGain();
    empuje.gain.value = 3.2;
    const amp = saturacion(c, 3.5);
    // Altavoz de guitarra: sin graves de más ni agudos chillones, con un punto de medios
    const medios = filtro(c, "peaking", 900, 0.9, 4);
    const altavoz = filtro(c, "lowpass", 3800, 0.9);
    fuente.connect(antes).connect(empuje).connect(amp).connect(medios).connect(altavoz);
    entrada = altavoz;
    mojado.gain.value = 0.22;
    salida.gain.value = 0.18;
  } else {
    // Bajo: Mi1 con el pulgar y, un momento después, su octava pellizcada
    fuente.buffer = cuerdas(
      c,
      [
        { midi: 28, cuando: 0, pan: -0.1, suavizado: 0.36, sostener: 0.9992, ataque: 0.6, volumen: 0.9 },
        { midi: 40, cuando: 0.2, pan: 0.15, suavizado: 0.2, sostener: 0.998, ataque: 0.95, volumen: 0.6 },
      ],
      2.4,
    );
    // El altavoz del móvil casi no da graves: un poco de saturación le pone armónicos
    // (el oído «oye» el Mi grave por ellos) y un punto de medios, el chasquido de la cuerda.
    const empuje = c.createGain();
    empuje.gain.value = 1.6;
    const calor = saturacion(c, 1.8);
    const redondo = filtro(c, "lowpass", 2200, 0.8);
    const cuerpo = filtro(c, "peaking", 80, 1, 3);
    const chasquido = filtro(c, "peaking", 800, 1.2, 5);
    const compresor = c.createDynamicsCompressor();
    compresor.threshold.value = -18;
    compresor.ratio.value = 4;
    fuente.connect(empuje).connect(calor).connect(redondo).connect(cuerpo).connect(chasquido).connect(compresor);
    entrada = compresor;
    mojado.gain.value = 0.08;
    salida.gain.value = 0.4;
  }

  entrada.connect(salida);
  entrada.connect(conSala);
  return { fuente, salida };
}
