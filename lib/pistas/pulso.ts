// Sacar el pulso de una canción de su pista de batería: en qué segundo cae cada golpe, para el
// click del directo. Así el click sigue a la canción aunque el batería acelere o frene un poco.
//   1) La fuerza de los ataques cada 10 ms (flujo espectral hasta 2 kHz: bombo y caja, sin los
//      charles, que en corcheas harían creer que va al doble; aparte, el de los graves del bombo).
//   2) El tempo: la autocorrelación de esa fuerza, con preferencia por los 120 por minuto.
//   3) Los golpes: programación dinámica (Ellis, 2007): cae en los ataques sin salirse del tempo.
//   4) Si la canción va a tempo fijo (grabada con click), una rejilla recta: así no se corre nunca.
//      Y el pulso se apoya en el bombo: si se ha quedado a contratiempo (en la caja), se corre medio
//      golpe (ver alBombo).
//   5) El compás: cada cuántos golpes se repite el dibujo de bombo y caja (3, 4 o 6; ver elCompas).
//   6) El 1 del compás: de cada grupo de golpes, el que más bombo lleva y, si se da la pista del
//      bajo, en el que más cambia de nota (los acordes suelen cambiar en el 1; ver elUno).

/** Cambia cuando el análisis mejora: los pulsos guardados con otro número se vuelven a sacar */
export const VERSION_PULSO = 2;

export interface Pulso {
  /** Segundo de cada golpe, en orden */
  golpes: number[];
  /** La canción va a tempo fijo: los golpes son una rejilla recta */
  fijo?: boolean;
  /** Índice del primer golpe que es un 1 de compás */
  uno: number;
  compas: number;
  /** Tempo medio (golpes por minuto) */
  bpm: number;
  /** Con qué versión del análisis se sacó (VERSION_PULSO) */
  v?: number;
}

export interface OpcionesPulso {
  /** El compás, si ya se sabe (si no, se detecta) */
  compas?: number;
  /** La pista del bajo (Int16 intercalado, a la misma frecuencia): ayuda a encontrar el 1 */
  bajo?: Int16Array | null;
}

const SR = 11025; // se trabaja a un cuarto de la frecuencia: sobra para los ataques
const N = 512; // ventana (~46 ms)
const SALTO = 110; // ~10 ms
const FE = SR / SALTO; // fuerzas por segundo
// Dónde cae el ataque respecto al principio de la ventana en que más crece (medido con golpes
// sintéticos; ver scripts de prueba)
const ADELANTO = (2 * N) / 3;
const AGUDO_GRAVE = 150; // Hz: lo de debajo es el bombo
const AGUDO_MEDIO = 2000; // Hz: bombo y caja; los charles quedan por encima

/** `estereo`: la batería, en Int16 intercalado (I, D, I, D…). Da null si no hay pulso claro. */
export function sacarPulso(estereo: Int16Array, frecuencia: number, opciones: OpcionesPulso = {}): Pulso | null {
  const { fuerza, medios, graves, niveles } = fuerzaDeAtaques(estereo, frecuencia);
  if (fuerza.length < FE * 8) return null; // menos de 8 segundos

  // Si casi no hay bombo ni caja (solo percusión aguda), con todo
  const o = normalizar(medios) ?? normalizar(fuerza);
  if (!o) return null;
  const periodo = tempo(o);
  if (!periodo) return null;
  const local = fuerzaLocal(o, periodo);
  let golpes = seguirGolpes(local, periodo);
  golpes = recortarBordes(golpes, o, periodo);
  if (golpes.length < 8) return null;
  const recta = rejillaFija(golpes, local);
  if (recta) golpes = recta;
  golpes = alBombo(golpes, niveles.grave, graves);
  if (golpes.length < 8) return null;

  const segundo = (f: number) => Math.round(((f * SALTO + ADELANTO) / SR) * 1000) / 1000;
  const tiempos = golpes.map(segundo);
  const mediana = (ts: number[]) => {
    const iv = ts.slice(1).map((t, i) => t - ts[i]).sort((a, b) => a - b);
    return iv[iv.length >> 1];
  };
  // Hacia atrás hasta el principio, al tempo del arranque: la intro sin batería también lleva click
  const arranque = mediana(tiempos.slice(0, 9));
  const antes: number[] = [];
  for (let t = tiempos[0] - arranque; t >= 0.05; t -= arranque) antes.unshift(Math.round(t * 1000) / 1000);
  const rasgos = rasgosDeGolpes(golpes, niveles);
  const compas = opciones.compas ?? elCompas(rasgos);
  const armonia = opciones.bajo ? cambiosDeArmonia(opciones.bajo, frecuencia, golpes.map((f) => (f * SALTO + ADELANTO) / SR)) : null;
  const uno = (elUno(rasgos.bombo, compas, armonia) + antes.length) % compas;
  return { golpes: [...antes, ...tiempos], uno, compas, bpm: Math.round(600 / mediana(tiempos)) / 10, fijo: !!recta, v: VERSION_PULSO };
}

/**
 * El pulso se apoya en el bombo. Si el bombo cae casi siempre entre golpe y golpe y casi nunca en
 * ellos, el seguimiento se ha quedado a contratiempo, en la caja (pasa cuando la caja manda más que
 * el bombo en los ataques, como en la canción de ejemplo): se corre medio golpe, a donde está el bombo.
 */
function alBombo(golpes: number[], grave: Float32Array, ataquesGraves: Float32Array): number[] {
  const n = golpes.length;
  if (n < 8) return golpes;
  const entre = golpes.slice(0, -1).map((g, i) => (g + golpes[i + 1]) / 2);
  let enEllos = 0;
  let enMedio = 0;
  for (let i = 0; i < entre.length; i++) {
    enEllos += subida(grave, golpes[i]);
    enMedio += subida(grave, entre[i]);
  }
  // Además tiene que haber bombo de verdad entre los golpes (más que el volumen medio de los graves):
  // en una percusión sin bombo, «el doble de casi nada» no dice nada
  let media = 0;
  for (const v of grave) media += v;
  media /= Math.max(1, grave.length);
  if (enMedio <= 2 * enEllos || enMedio / entre.length <= media) return golpes;
  // El bombo no tiene por qué caer justo en la mitad: el corrimiento (el mismo para todos) que mejor
  // coge sus ataques
  let mejor = 0;
  let valor = -Infinity;
  for (let d = -4; d <= 4; d++) {
    let s = 0;
    for (const g of entre) {
      const f = Math.round(g + d);
      if (f >= 0 && f < ataquesGraves.length) s += ataquesGraves[f];
    }
    if (s > valor) {
      valor = s;
      mejor = d;
    }
  }
  const ultimo = entre[entre.length - 1] + (golpes[n - 1] - golpes[n - 2]);
  return [...entre, ...(ultimo < grave.length ? [ultimo] : [])].map((g) => g + mejor);
}

/** El volumen de la batería en cada trozo (~10 ms), por bandas: graves (el bombo), medios y agudos */
interface Niveles {
  grave: Float32Array;
  medio: Float32Array;
  agudo: Float32Array;
}

/** Lo que tiene cada golpe de bombo y de caja */
export interface Rasgos {
  bombo: Float64Array;
  caja: Float64Array;
}

/** Cuánto sube una banda al llegar un golpe: lo más alto de justo después menos lo que había antes. */
function subida(nivel: Float32Array, golpe: number): number {
  const g = Math.round(golpe);
  let pico = 0;
  for (let f = g - 1; f <= g + 5; f++) if (f >= 0 && f < nivel.length) pico = Math.max(pico, nivel[f]);
  let antes = 0;
  let n = 0;
  for (let f = g - 8; f <= g - 4; f++) {
    if (f < 0 || f >= nivel.length) continue;
    antes += nivel[f];
    n++;
  }
  return Math.max(0, pico - (n ? antes / n : 0));
}

/**
 * Lo que hay de bombo y de caja en cada golpe: lo que suben los graves (hasta 150 Hz) y lo que suben
 * los medios y los agudos, quitando lo que ahí mete el propio bombo. (Antes se miraba el flujo
 * espectral de los graves, que va en logaritmos y en una batería de verdad apenas distingue el bombo
 * de la caja: el 1 salía casi al azar.)
 */
export function rasgosDeGolpes(golpes: number[], niveles: Niveles): Rasgos {
  const n = golpes.length;
  const bombo = Float64Array.from(golpes, (g) => subida(niveles.grave, g));
  const arriba = Float64Array.from(golpes, (g) => subida(niveles.medio, g) + subida(niveles.agudo, g));
  // Lo que el bombo suena por arriba (su chasquido): se mira en los golpes con más graves
  const fuertes = Array.from(bombo.keys()).sort((a, b) => bombo[b] - bombo[a]).slice(0, Math.max(4, n >> 2));
  const razones = fuertes.filter((i) => bombo[i] > 1e-9).map((i) => arriba[i] / bombo[i]).sort((a, b) => a - b);
  const delBombo = razones.length ? razones[razones.length >> 2] : 0; // de las más bajas: bombo solo, sin caja encima
  const caja = arriba.map((v, i) => Math.max(0, v - delBombo * bombo[i]));
  return { bombo, caja };
}

/** Cuánto tiene que ganar lo ternario a lo binario para decir que el compás es de 3 o de 6 */
const MARGEN_TERNARIO = 0.1;
/** Y cuánto tiene que parecerse la batería a sí misma 3 o 6 golpes después (de −1 a 1): si toca
 *  igual en todos los golpes, no se parece más a ninguna distancia (queda en ±0,05) y va de 4 */
const MINIMO_TERNARIO = 0.2;

/**
 * El compás: cada cuántos golpes se repite el dibujo de bombo y caja. Se mira cuánto se parece la
 * batería a sí misma 2, 3, 4 y 6 golpes después (autocorrelación del bombo y de la caja, golpe a
 * golpe):
 *  - si se repite cada 2 o cada 4 → 4 (un 2/4 no se distingue de un 4/4 por la batería: va de 4);
 *  - si se repite cada 3 → 3 (un vals);
 *  - si no se repite cada 3 pero sí cada 6 (bombo en el 1, caja en el 4) → 6 (un 6/8 contado en corcheas).
 * Con pocos golpes o sin un dibujo claro, 4.
 */
export function elCompas(rasgos: Rasgos): number {
  const n = rasgos.bombo.length;
  if (n < 24) return 4;
  // A cada golpe se le quita la media de los 12 de alrededor (12: múltiplo de 2, 3, 4 y 6, no
  // favorece a ningún compás): lo que cuenta es el dibujo, no que un trozo de la canción suene más
  // fuerte que otro (con eso solo, la batería «se parece a sí misma» a cualquier distancia).
  const normal = (x: Float64Array) => {
    const acum = new Float64Array(n + 1);
    for (let i = 0; i < n; i++) acum[i + 1] = acum[i] + x[i];
    const sin = new Float64Array(n);
    let s2 = 0;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, Math.min(n - 12, i - 6));
      sin[i] = x[i] - (acum[a + 12] - acum[a]) / 12;
      s2 += sin[i] ** 2;
    }
    const d = Math.sqrt(s2 / n);
    return sin.map((v) => (d > 1e-9 ? v / d : 0));
  };
  const bombo = normal(rasgos.bombo);
  const caja = normal(rasgos.caja);
  const parecido = (l: number) => {
    let s = 0;
    for (let i = 0; i + l < n; i++) s += bombo[i] * bombo[i + l] + caja[i] * caja[i + l];
    return s / (2 * (n - l));
  };
  const cada3 = parecido(3);
  const cada6 = parecido(6);
  const binario = Math.max(parecido(2), parecido(4));
  const ternario = Math.max(cada3, cada6);
  if (ternario < MINIMO_TERNARIO || ternario <= binario + MARGEN_TERNARIO) return 4;
  return cada3 >= cada6 - 0.15 ? 3 : 6;
}

/**
 * El 1 de un compás de `compas` golpes: la posición (de las `compas` que hay) con más bombo y, si
 * se da `armonia` (cuánto cambia el bajo en cada golpe), en la que más cambia de nota: en un 4/4 de
 * rock el bombo cae igual en el 1 que en el 3, y lo que los distingue es que el acorde cambia en el 1.
 */
export function elUno(bomboDeCadaGolpe: Float64Array, compas: number, armonia?: Float32Array | null): number {
  const n = bomboDeCadaGolpe.length;
  const bombo = new Float64Array(compas);
  const cambio = new Float64Array(compas);
  for (let i = 0; i < n; i++) {
    bombo[i % compas] += bomboDeCadaGolpe[i];
    if (armonia) cambio[i % compas] += armonia[i] ?? 0;
  }
  // Cada pista, como lo que destaca cada posición sobre la media de todas (0 = como las demás).
  // `suelo`: si en total hay muy poco (el bajo apenas cambia), que lo poco que haya no mande.
  const destaca = (x: Float64Array, suelo: number) => {
    const media = x.reduce((a, v) => a + v, 0) / compas;
    const base = Math.max(media, suelo);
    return x.map((v) => (base > 1e-9 ? (v - media) / base : 0));
  };
  const b = destaca(bombo, 0);
  // El cambio va de 0 a 1 por golpe: por debajo de 0,1 de media por golpe, casi no hay cambios
  const c = destaca(cambio, (0.1 * n) / compas);
  let mejor = 0;
  for (let k = 1; k < compas; k++) if (b[k] + c[k] > b[mejor] + c[mejor]) mejor = k;
  return mejor;
}

const SR_BAJO = 2756.25; // el bajo se mira hasta ~500 Hz: sobra con esto

/**
 * Cuánto cambia la nota del bajo al llegar a cada golpe (0: sigue igual o no suena; 1: otra cosa):
 * se compara el espectro grave (30–500 Hz) de cada golpe con el del golpe anterior.
 * `bajo`: Int16 intercalado; `segundos`: cuándo cae cada golpe.
 */
export function cambiosDeArmonia(bajo: Int16Array, frecuencia: number, segundos: number[]): Float32Array {
  const n = segundos.length;
  const cambios = new Float32Array(n);
  if (n < 2) return cambios;
  // A mono y a SR_BAJO
  const d = frecuencia / SR_BAJO;
  const frames = bajo.length >> 1;
  const largo = Math.floor(frames / d);
  const x = new Float32Array(largo);
  for (let j = 0; j < largo; j++) {
    const a = Math.floor(j * d);
    const b = Math.min(frames, Math.floor((j + 1) * d));
    let s = 0;
    for (let i = a; i < b; i++) s += bajo[2 * i] + bajo[2 * i + 1];
    x[j] = s / (2 * 32768 * Math.max(1, b - a));
  }
  // Una ventana por golpe, que quepa en él (más corta si el tempo es rápido)
  const iv = segundos.slice(1).map((t, i) => t - segundos[i]).sort((p, q) => p - q);
  const NB = iv[iv.length >> 1] >= 0.45 ? 1024 : 512;
  const ventana = new Float32Array(NB);
  for (let i = 0; i < NB; i++) ventana[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / NB);
  const k1 = Math.max(1, Math.round((30 * NB) / SR_BAJO));
  const k2 = Math.min(NB / 2 - 1, Math.round((500 * NB) / SR_BAJO));
  const re = new Float32Array(NB);
  const im = new Float32Array(NB);
  const espectros: (Float32Array | null)[] = [];
  const energias: number[] = [];
  for (let g = 0; g < n; g++) {
    // Un poco después del golpe: sin el ataque de la nota, que suena igual en todas
    const p = Math.round((segundos[g] + 0.04) * SR_BAJO);
    if (p < 0 || p + NB > largo) {
      espectros.push(null);
      energias.push(0);
      continue;
    }
    for (let i = 0; i < NB; i++) {
      re[i] = x[p + i] * ventana[i];
      im[i] = 0;
    }
    fft(re, im);
    const e = new Float32Array(k2 - k1 + 1);
    let energia = 0;
    for (let k = k1; k <= k2; k++) {
      const m = Math.hypot(re[k], im[k]);
      e[k - k1] = m;
      energia += m * m;
    }
    espectros.push(e);
    energias.push(energia);
  }
  // Donde el bajo casi no suena no hay nada que comparar
  const orden = energias.filter((e) => e > 0).sort((p, q) => p - q);
  const umbral = orden.length ? 0.02 * orden[orden.length >> 1] : Infinity;
  // Cada golpe en que suena, contra el último en que sonaba (los silencios de en medio no cuentan)
  let ultimo = -1;
  for (let g = 0; g < n; g++) {
    const b = espectros[g];
    if (!b || energias[g] < umbral) continue;
    const a = ultimo >= 0 ? espectros[ultimo] : null;
    if (a) {
      let punto = 0;
      for (let k = 0; k < a.length; k++) punto += a[k] * b[k];
      cambios[g] = Math.max(0, 1 - punto / Math.sqrt(energias[ultimo] * energias[g]));
    }
    ultimo = g;
  }
  return cambios;
}

/** Flujo espectral (lo que sube cada banda de un trozo al siguiente), total y de los graves. */
function fuerzaDeAtaques(estereo: Int16Array, frecuencia: number): { fuerza: Float32Array; medios: Float32Array; graves: Float32Array; niveles: Niveles } {
  // A mono y a SR (media de cada grupo de muestras: filtra lo bastante para esto)
  const d = frecuencia / SR;
  const frames = estereo.length >> 1;
  const largo = Math.floor(frames / d);
  const x = new Float32Array(largo);
  for (let j = 0; j < largo; j++) {
    const a = Math.floor(j * d);
    const b = Math.min(frames, Math.floor((j + 1) * d));
    let s = 0;
    for (let i = a; i < b; i++) s += estereo[2 * i] + estereo[2 * i + 1];
    x[j] = s / (2 * 32768 * Math.max(1, b - a));
  }

  const cuantos = Math.max(0, Math.floor((largo - N) / SALTO));
  const fuerza = new Float32Array(cuantos);
  const graves = new Float32Array(cuantos);
  const medios = new Float32Array(cuantos);
  const niveles: Niveles = { grave: new Float32Array(cuantos), medio: new Float32Array(cuantos), agudo: new Float32Array(cuantos) };
  const ventana = new Float32Array(N);
  for (let i = 0; i < N; i++) ventana[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
  const re = new Float32Array(N);
  const im = new Float32Array(N);
  const B = N / 2;
  let antes = new Float32Array(B);
  let ahora = new Float32Array(B);
  const kGrave = Math.max(2, Math.round((AGUDO_GRAVE * N) / SR));
  const kMedio = Math.round((AGUDO_MEDIO * N) / SR);
  for (let f = 0; f < cuantos; f++) {
    const p = f * SALTO;
    for (let i = 0; i < N; i++) {
      re[i] = x[p + i] * ventana[i];
      im[i] = 0;
    }
    fft(re, im);
    let total = 0;
    let bajo = 0;
    let medio = 0;
    let nGrave = 0;
    let nMedio = 0;
    let nAgudo = 0;
    for (let k = 1; k < B; k++) {
      const modulo = Math.hypot(re[k], im[k]);
      if (k <= kGrave) nGrave += modulo;
      else if (k <= kMedio) nMedio += modulo;
      else nAgudo += modulo;
      const m = Math.log(1 + 1000 * modulo);
      ahora[k] = m;
      const sube = m - antes[k];
      if (sube > 0 && f > 0) {
        total += sube;
        if (k <= kGrave) bajo += sube;
        if (k <= kMedio) medio += sube;
      }
    }
    fuerza[f] = total;
    graves[f] = bajo;
    medios[f] = medio;
    niveles.grave[f] = nGrave;
    niveles.medio[f] = nMedio;
    niveles.agudo[f] = nAgudo;
    [antes, ahora] = [ahora, antes];
  }
  return { fuerza, medios, graves, niveles };
}

/** Quita la media de cada tramo de ~1 s y divide por la desviación: así el umbral no depende del volumen. */
function normalizar(f: Float32Array): Float32Array | null {
  const n = f.length;
  const W = Math.round(FE / 2);
  const acum = new Float64Array(n + 1);
  for (let i = 0; i < n; i++) acum[i + 1] = acum[i] + f[i];
  const o = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - W);
    const b = Math.min(n, i + W + 1);
    o[i] = Math.max(0, f[i] - (acum[b] - acum[a]) / (b - a));
  }
  let s2 = 0;
  for (let i = 0; i < n; i++) s2 += o[i] * o[i];
  const desv = Math.sqrt(s2 / n);
  if (!(desv > 1e-6)) return null;
  for (let i = 0; i < n; i++) o[i] /= desv;
  return o;
}

/** El periodo del golpe (en fuerzas, con decimales): la autocorrelación con preferencia por 120. */
function tempo(o: Float32Array): number | null {
  const n = o.length;
  const min = Math.floor((FE * 60) / 220);
  const max = Math.ceil((FE * 60) / 50);
  const tope = 2 * max + 2; // también el doble de cada periodo
  const r = new Float64Array(tope + 1);
  for (let l = min - 1; l <= tope; l++) {
    let s = 0;
    for (let i = l; i < n; i++) s += o[i] * o[i - l];
    r[l] = s / (n - l);
  }
  const centro = FE * 0.5; // 120 por minuto
  const peso = (l: number) => Math.exp(-0.5 * (Math.log2(l / centro) / 0.9) ** 2);
  let mejor = -1;
  let valor = -Infinity;
  for (let l = min; l <= max; l++) {
    // Un pulso también refuerza el doble de su periodo
    const doble = 0.5 * Math.max(r[2 * l - 1], r[2 * l], r[2 * l + 1]);
    const v = peso(l) * (r[l] + doble);
    if (v > valor && r[l] >= r[l - 1] && r[l] >= r[l + 1]) {
      valor = v;
      mejor = l;
    }
  }
  if (mejor < 0) return null;
  // Afinar el pico con una parábola
  const a = r[mejor - 1];
  const b = r[mejor];
  const c = r[mejor + 1];
  const den = a - 2 * b + c;
  return mejor + (den < 0 ? (0.5 * (a - c)) / den : 0);
}

/** La fuerza, suavizada un poco alrededor de cada punto. */
function fuerzaLocal(o: Float32Array, periodo: number): Float32Array {
  const n = o.length;
  const sigma = Math.max(1, periodo / 32);
  const radio = Math.ceil(3 * sigma);
  const local = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = -radio; k <= radio; k++) {
      const j = i + k;
      if (j >= 0 && j < n) s += o[j] * Math.exp(-0.5 * (k / sigma) ** 2);
    }
    local[i] = s;
  }
  return local;
}

/** Si una rejilla recta (un tempo fijo) cae en los ataques casi tan bien como los golpes que se
 *  siguieron uno a uno, la canción va a tempo fijo: mejor la rejilla, que no se corre. Si el batería
 *  acelera o frena, la recta se va saliendo de los ataques y se quedan los seguidos. */
function rejillaFija(golpes: number[], local: Float32Array): number[] | null {
  const n = golpes.length;
  if (n < 16) return null;
  const valor = (f: number) => {
    const i = Math.round(f);
    return i >= 0 && i < local.length ? local[i] : 0;
  };
  let seguidos = 0;
  for (const g of golpes) seguidos += valor(g);
  if (!(seguidos > 0)) return null;
  const a = golpes[0];
  const p0 = (golpes[n - 1] - a) / (n - 1);
  let mejor = { suma: -Infinity, p: p0, f0: a };
  for (let d = -0.006; d <= 0.0061; d += 0.0005) {
    const p = p0 * (1 + d);
    for (let f0 = a - p / 2; f0 < a + p / 2; f0 += 0.5) {
      let suma = 0;
      for (let k = 0; k < n; k++) suma += valor(f0 + k * p);
      if (suma > mejor.suma) mejor = { suma, p, f0 };
    }
  }
  if (mejor.suma < 0.93 * seguidos) return null;
  return Array.from({ length: n }, (_, k) => mejor.f0 + k * mejor.p);
}

/** Programación dinámica: cada golpe suma su fuerza y paga por alejarse del periodo. */
function seguirGolpes(local: Float32Array, periodo: number): number[] {
  const n = local.length;
  const APRIETE = 680; // alto: que no se pase al contratiempo; sigue igual al batería que acelera poco a poco
  const desde = Math.round(periodo / 2);
  const hasta = Math.round(periodo * 2);
  const coste = new Float32Array(hasta + 1);
  for (let k = desde; k <= hasta; k++) coste[k] = -APRIETE * Math.log(k / periodo) ** 2;
  const total = new Float32Array(n);
  const anterior = new Int32Array(n).fill(-1);
  for (let i = 0; i < n; i++) {
    let mejor = 0;
    let de = -1;
    for (let k = desde; k <= hasta && i - k >= 0; k++) {
      const v = total[i - k] + coste[k];
      if (de < 0 || v > mejor) {
        mejor = v;
        de = i - k;
      }
    }
    total[i] = local[i] + (de >= 0 ? Math.max(0, mejor) : 0);
    anterior[i] = de >= 0 && mejor > 0 ? de : -1;
  }
  // El último golpe: el mejor del final
  let fin = Math.max(0, n - hasta);
  for (let i = fin; i < n; i++) if (total[i] > total[fin]) fin = i;
  const golpes: number[] = [];
  for (let i = fin; i >= 0; i = anterior[i]) golpes.push(i);
  return golpes.reverse();
}

/** Fuera los golpes flojos del principio y del final (silencios, intros sin ritmo). */
function recortarBordes(golpes: number[], o: Float32Array, periodo: number): number[] {
  if (golpes.length < 3) return golpes;
  const r = Math.max(1, Math.round(periodo / 8));
  const fuerza = golpes.map((g) => {
    let m = 0;
    for (let f = g - r; f <= g + r; f++) if (f >= 0 && f < o.length) m = Math.max(m, o[f]);
    return m;
  });
  // Solo por los bordes: un golpe flojo suelto en mitad de la canción se queda
  const suave = fuerza;
  const umbral = 0.5 * Math.sqrt(suave.reduce((a, v) => a + v * v, 0) / suave.length);
  let a = 0;
  while (a < suave.length && suave[a] < umbral) a++;
  let b = suave.length - 1;
  while (b > a && suave[b] < umbral) b--;
  return golpes.slice(a, b + 1);
}

/** FFT compleja en el sitio (radix 2). */
function fft(re: Float32Array, im: Float32Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let largo = 2; largo <= n; largo <<= 1) {
    const ang = (-2 * Math.PI) / largo;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    const mitad = largo >> 1;
    for (let i = 0; i < n; i += largo) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < mitad; k++) {
        const a = i + k;
        const b = a + mitad;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const t = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = t;
      }
    }
  }
}
