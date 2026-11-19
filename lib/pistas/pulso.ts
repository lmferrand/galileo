// Sacar el pulso de una canción de su pista de batería: en qué segundo cae cada golpe, para el
// click del directo. Así el click sigue a la canción aunque el batería acelere o frene un poco.
//   1) La fuerza de los ataques cada 10 ms (flujo espectral hasta 2 kHz: bombo y caja, sin los
//      charles, que en corcheas harían creer que va al doble; aparte, el de los graves del bombo).
//   2) El tempo: la autocorrelación de esa fuerza, con preferencia por los 120 por minuto.
//   3) Los golpes: programación dinámica (Ellis, 2007): cae en los ataques sin salirse del tempo.
//   4) Si la canción va a tempo fijo (grabada con click), una rejilla recta: así no se corre nunca.
//   5) El 1 del compás: de cada grupo de golpes, el que más bombo lleva.

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

/** `estereo`: Int16 intercalado (I, D, I, D…). Da null si no hay pulso claro. */
export function sacarPulso(estereo: Int16Array, frecuencia: number, compas = 4): Pulso | null {
  const { fuerza, medios, graves } = fuerzaDeAtaques(estereo, frecuencia);
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
  const uno = (elUno(golpes, graves, compas) + antes.length) % compas;
  return { golpes: [...antes, ...tiempos], uno, compas, bpm: Math.round(600 / mediana(tiempos)) / 10, fijo: !!recta };
}

/** El 1 de un compás de `compas` golpes: el grupo (por posición) con más bombo. */
export function elUno(golpes: number[], graves: Float32Array, compas: number): number {
  const suma = new Float64Array(compas);
  for (let i = 0; i < golpes.length; i++) {
    let m = 0;
    const g = Math.round(golpes[i]);
    for (let f = g - 2; f <= g + 2; f++) if (f >= 0 && f < graves.length) m = Math.max(m, graves[f]);
    suma[i % compas] += m;
  }
  let mejor = 0;
  for (let k = 1; k < compas; k++) if (suma[k] > suma[mejor]) mejor = k;
  return mejor;
}

/** Flujo espectral (lo que sube cada banda de un trozo al siguiente), total y de los graves. */
function fuerzaDeAtaques(estereo: Int16Array, frecuencia: number): { fuerza: Float32Array; medios: Float32Array; graves: Float32Array } {
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
    for (let k = 1; k < B; k++) {
      const m = Math.log(1 + 1000 * Math.hypot(re[k], im[k]));
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
    [antes, ahora] = [ahora, antes];
  }
  return { fuerza, medios, graves };
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
