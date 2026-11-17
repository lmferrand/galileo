// Clavija: mezcla las 6 pistas en tiempo real dentro del hilo de audio.
// Cada pista llega como Int16Array estéreo intercalado (L, R, L, R…) a 44,1 kHz.
//
// La salida se construye a trozos con WSOLA (solapar y sumar buscando el punto
// en que la onda encaja): así se puede tocar más lento sin que cambie el tono.
// A velocidad normal los trozos van seguidos y la reconstrucción es exacta. Los
// saltos (repetir un trozo, mover la barra) se funden solos en el solape.

const N = 2048; // tamaño de cada trozo (~46 ms)
const HS = N / 2; // salto de salida (solape del 50 %)
const DELTA = 512; // margen de búsqueda del mejor encaje
const DEC = 4; // la búsqueda gruesa se hace con 1 de cada 4 muestras
const FIFO = 8192;
const MASCARA = FIFO - 1;

const VENTANA = new Float32Array(N);
for (let i = 0; i < N; i++) VENTANA[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);

class MezcladorPistas extends AudioWorkletProcessor {
  constructor() {
    super();
    this.pistas = [];
    this.frames = 0;
    this.paso = 1; // frames de la fuente por muestra de salida
    this.tocando = false;
    this.g = new Float32Array(8);
    this.gObjetivo = new Float32Array(8);
    this.velocidad = 1;
    this.bucle = null; // { a, b } en muestras de salida
    this.analisis = 0;
    this.previo = -HS;
    this.colaL = new Float32Array(HS);
    this.colaR = new Float32Array(HS);
    this.fL = new Float32Array(FIFO);
    this.fR = new Float32Array(FIFO);
    this.fLeer = 0;
    this.fHay = 0;
    this.trozoL = new Float32Array(N);
    this.trozoR = new Float32Array(N);
    this.ref = new Float32Array(HS);
    this.region = new Float32Array(2 * DELTA + HS + 2 * DEC);
    this.bloques = 0;
    this.port.onmessage = (e) => this.mensaje(e.data);
  }

  total() {
    return Math.max(0, Math.floor((this.frames - 2) / this.paso));
  }

  reiniciar(pos) {
    this.analisis = pos;
    this.previo = pos - HS;
    this.colaL.fill(0);
    this.colaR.fill(0);
    this.fHay = 0;
    this.fLeer = 0;
  }

  mensaje(m) {
    switch (m.tipo) {
      case "cargar":
        this.pistas = m.pistas;
        this.frames = m.frames;
        this.paso = m.frecuencia / sampleRate;
        this.tocando = false;
        this.bucle = null;
        this.reiniciar(0);
        this.avisar();
        break;
      case "vaciar":
        this.pistas = [];
        this.frames = 0;
        this.tocando = false;
        break;
      case "tocar":
        if (this.analisis >= this.total() - 1) this.reiniciar(this.bucle ? this.bucle.a : 0);
        this.tocando = true;
        this.avisar();
        break;
      case "pausar":
        this.tocando = false;
        this.avisar();
        break;
      case "ir":
        this.reiniciar(Math.max(0, Math.min(this.total() - 1, Math.round(m.frame / this.paso))));
        this.avisar();
        break;
      case "ganancias":
        for (let i = 0; i < m.valores.length; i++) this.gObjetivo[i] = m.valores[i];
        if (m.inmediato) for (let i = 0; i < m.valores.length; i++) this.g[i] = m.valores[i];
        break;
      case "velocidad":
        this.velocidad = Math.max(0.5, Math.min(1.25, m.valor));
        break;
      case "bucle":
        if (!m.a && m.a !== 0) {
          this.bucle = null;
        } else {
          const a = Math.round(m.a / this.paso);
          const b = Math.round(m.b / this.paso);
          this.bucle = { a, b };
          // Si estás fuera del trozo, se salta a su inicio.
          if (this.previo + HS < a || this.previo + HS >= b) this.reiniciar(a);
        }
        break;
    }
  }

  avisar() {
    const pos = Math.max(0, this.previo + HS) * this.paso;
    this.port.postMessage({ tipo: "pos", frame: pos, tocando: this.tocando });
  }

  /** Mezcla de las pistas en [n0, n0+cuantos) de la señal de salida. */
  leer(n0, cuantos, L, R) {
    const ps = this.pistas;
    const np = ps.length;
    const paso = this.paso;
    const F = this.frames;
    for (let i = 0; i < cuantos; i++) {
      const p = (n0 + i) * paso;
      let l = 0;
      let r = 0;
      if (p >= 0 && p < F - 1) {
        const k = p | 0;
        const f = p - k;
        const a = k * 2;
        for (let s = 0; s < np; s++) {
          const g = this.g[s];
          if (g < 0.0001) continue;
          const d = ps[s];
          if (f === 0) {
            l += g * d[a];
            r += g * d[a + 1];
          } else {
            l += g * (d[a] + (d[a + 2] - d[a]) * f);
            r += g * (d[a + 1] + (d[a + 3] - d[a + 1]) * f);
          }
        }
      }
      L[i] = l / 32768;
      R[i] = r / 32768;
    }
  }

  /** Mezcla en mono, tomando 1 de cada `paso` muestras (para buscar el encaje). */
  mono(n0, cuantos, salto, salida) {
    const ps = this.pistas;
    const np = ps.length;
    const F = this.frames;
    for (let j = 0; j < cuantos; j++) {
      const p = Math.round((n0 + j * salto) * this.paso);
      let v = 0;
      if (p >= 0 && p < F - 1) {
        const a = p * 2;
        for (let s = 0; s < np; s++) {
          const g = this.g[s];
          if (g < 0.0001) continue;
          v += g * (ps[s][a] + ps[s][a + 1]);
        }
      }
      salida[j] = v;
    }
  }

  /** Busca, cerca de `nominal`, el trozo que mejor continúa la onda que ya ha sonado. */
  buscar(nominal, natural) {
    const M = HS / DEC;
    this.mono(natural, M, DEC, this.ref);
    const inicio = nominal - DELTA;
    const cuenta = (2 * DELTA + HS) / DEC;
    this.mono(inicio, cuenta, DEC, this.region);
    let mejor = -Infinity;
    let mejorJ = DELTA / DEC;
    const candidatos = (2 * DELTA) / DEC;
    for (let j = 0; j <= candidatos; j++) {
      let c = 0;
      let e = 1e-9;
      for (let k = 0; k < M; k++) {
        const v = this.region[j + k];
        c += v * this.ref[k];
        e += v * v;
      }
      const s = c / Math.sqrt(e);
      if (s > mejor) {
        mejor = s;
        mejorJ = j;
      }
    }
    // Afinar muestra a muestra alrededor del mejor candidato.
    const grueso = inicio + mejorJ * DEC;
    const L = 256;
    this.mono(natural, L, 1, this.ref);
    this.mono(grueso - DEC, L + 2 * DEC, 1, this.region);
    let fino = grueso;
    mejor = -Infinity;
    for (let d = 0; d <= 2 * DEC; d++) {
      let c = 0;
      let e = 1e-9;
      for (let k = 0; k < L; k++) {
        const v = this.region[d + k];
        c += v * this.ref[k];
        e += v * v;
      }
      const s = c / Math.sqrt(e);
      if (s > mejor) {
        mejor = s;
        fino = grueso - DEC + d;
      }
    }
    return fino;
  }

  generar() {
    for (let s = 0; s < 8; s++) this.g[s] += (this.gObjetivo[s] - this.g[s]) * 0.6;

    if (this.bucle && this.analisis >= this.bucle.b) {
      // Vuelta al principio del trozo: el solape funde el final con el inicio.
      this.analisis = this.bucle.a;
      this.previo = this.bucle.a - HS;
    }
    if (this.analisis >= this.total()) {
      this.tocando = false;
      this.port.postMessage({ tipo: "fin" });
      return;
    }

    const nominal = Math.round(this.analisis);
    const natural = this.previo + HS;
    const inicio = Math.abs(nominal - natural) <= 1 ? natural : this.buscar(nominal, natural);

    this.leer(inicio, N, this.trozoL, this.trozoR);
    let w = (this.fLeer + this.fHay) & MASCARA;
    for (let i = 0; i < HS; i++) {
      const v = VENTANA[i];
      this.fL[w] = this.colaL[i] + this.trozoL[i] * v;
      this.fR[w] = this.colaR[i] + this.trozoR[i] * v;
      w = (w + 1) & MASCARA;
    }
    for (let i = 0; i < HS; i++) {
      const v = VENTANA[HS + i];
      this.colaL[i] = this.trozoL[HS + i] * v;
      this.colaR[i] = this.trozoR[HS + i] * v;
    }
    this.fHay += HS;
    this.previo = inicio;
    this.analisis += HS * this.velocidad;
  }

  process(_entradas, salidas) {
    const salida = salidas[0];
    const L = salida[0];
    const R = salida[1] || salida[0];
    if (!this.tocando || this.pistas.length === 0) return true;

    const n = L.length;
    while (this.fHay < n && this.tocando) this.generar();
    const cuantos = Math.min(n, this.fHay);
    for (let i = 0; i < cuantos; i++) {
      const k = (this.fLeer + i) & MASCARA;
      const l = this.fL[k];
      const r = this.fR[k];
      L[i] = l > 1 ? 1 : l < -1 ? -1 : l;
      R[i] = r > 1 ? 1 : r < -1 ? -1 : r;
    }
    this.fLeer = (this.fLeer + cuantos) & MASCARA;
    this.fHay -= cuantos;
    if (++this.bloques % 6 === 0) this.avisar();
    return true;
  }
}

registerProcessor("mezclador-pistas", MezcladorPistas);
