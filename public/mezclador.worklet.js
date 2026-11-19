// Clavija: toca las 6 pistas en tiempo real dentro del hilo de audio.
// Cada pista llega como Int16Array estéreo intercalado (L, R, L, R…) a 44,1 kHz y
// sale por su propia salida (una por pista, ya con su volumen): así cada una pasa
// por su canal de la Mesa (efectos) antes de juntarse (lib/pistas/reproductor).
//
// La salida se construye a trozos con WSOLA (solapar y sumar buscando el punto
// en que la onda encaja): así se puede tocar más lento sin que cambie el tono. El
// encaje se busca con la mezcla de todas y vale para todas: nunca se desfasan.
// A velocidad normal los trozos van seguidos y la reconstrucción es exacta. Los
// saltos (repetir un trozo, mover la barra) se funden solos en el solape.
// El tono: cada trozo se lee r veces más deprisa (r = 2^(semitonos/12)), así sube o
// baja el tono, y los trozos se siguen colocando al ritmo de la velocidad: el tempo
// no cambia.
// El click (para el directo): sale por una salida más, la última. Suena en cada golpe de la lista
// que se sacó de la batería (lib/pistas/pulso), mirando el segundo de la canción que suena en cada
// muestra: así va clavado con cualquier velocidad y sigue al batería si acelera o frena.

const N = 2048; // tamaño de cada trozo (~46 ms)
const HS = N / 2; // salto de salida (solape del 50 %)
const DELTA = 512; // margen de búsqueda del mejor encaje
const DEC = 4; // la búsqueda gruesa se hace con 1 de cada 4 muestras
const FIFO = 8192;
const MASCARA = FIFO - 1;

const VENTANA = new Float32Array(N);
for (let i = 0; i < N; i++) VENTANA[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);

class MezcladorPistas extends AudioWorkletProcessor {
  constructor(opciones) {
    super();
    // Una salida por pista (y, si se pide, una más para el click)
    const conClick = !!(opciones && opciones.processorOptions && opciones.processorOptions.conClick);
    const NS = Math.max(1, ((opciones && opciones.numberOfOutputs) || 1) - (conClick ? 1 : 0));
    this.ns = NS;
    this.salidaClick = conClick ? NS : -1;
    this.segFifo = new Float32Array(FIFO); // el segundo de la canción de cada muestra que sale
    this.click = { activo: false, golpes: new Float64Array(0), uno: 0, compas: 4 };
    this.golpe = null; // cuántos golpes de la lista han pasado ya
    this.sonando = -1; // muestras desde que empezó el click que suena
    this.acento = false;
    this.previa = null; // la cuenta de entrada: { t, hasta, golpes } en segundos de la canción
    this.segBloque = new Float32Array(4096);
    const varias = (largo) => Array.from({ length: NS }, () => new Float32Array(largo));
    this.pistas = [];
    this.frames = 0;
    this.paso = 1; // frames de la fuente por muestra de salida
    this.tocando = false;
    this.g = new Float32Array(8);
    this.gObjetivo = new Float32Array(8);
    this.velocidad = 1;
    this.r = 1; // tono: lo que se lee de la fuente por cada muestra de salida
    this.bucle = null; // { a, b } en muestras de salida
    this.analisis = 0;
    this.previo = -HS;
    this.colaL = varias(HS);
    this.colaR = varias(HS);
    this.fL = varias(FIFO);
    this.fR = varias(FIFO);
    this.fLeer = 0;
    this.fHay = 0;
    this.trozoL = varias(N);
    this.trozoR = varias(N);
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
    this.previo = pos - Math.round(HS * this.r);
    for (let s = 0; s < this.ns; s++) {
      this.colaL[s].fill(0);
      this.colaR[s].fill(0);
    }
    this.fHay = 0;
    this.fLeer = 0;
    this.golpe = null;
    this.sonando = -1;
    this.previa = null;
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
        if (m.cuenta && this.click.activo) this.empezarCuenta();
        this.avisar();
        break;
      case "pausar":
        this.tocando = false;
        this.previa = null;
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
      case "click":
        this.click = {
          activo: !!m.activo && !!m.golpes && m.golpes.length > 1,
          golpes: Float64Array.from(m.golpes || []),
          uno: m.uno || 0,
          compas: Math.max(1, m.compas || 4),
        };
        this.golpe = null;
        break;
      case "tono":
        this.r = Math.pow(2, Math.max(-6, Math.min(6, m.semitonos)) / 12);
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

  /** Un compás de click antes de que entre la canción, al tempo del golpe siguiente. */
  empezarCuenta() {
    const g = this.click.golpes;
    const pos = this.analisis / sampleRate;
    const k = contar(g, pos - 0.002);
    if (k >= g.length) return; // ya no quedan golpes
    const spb = k + 1 < g.length ? g[k + 1] - g[k] : g[k] - g[k - 1];
    if (!(spb > 0.15 && spb < 2.5)) return;
    const n = this.click.compas;
    const golpes = new Float64Array(n);
    for (let j = 0; j < n; j++) golpes[j] = g[k] - (n - j) * spb;
    this.previa = { t: golpes[0], hasta: pos, golpes };
    this.golpe = 0; // que suene ya el primero
  }

  avisar() {
    const pos = Math.max(0, this.previo + Math.round(HS * this.r)) * this.paso;
    this.port.postMessage({ tipo: "pos", frame: pos, tocando: this.tocando });
  }

  /** Cada pista (con su volumen) en [n0, n0+cuantos) de la señal de salida, en su trozo. */
  leer(n0, cuantos) {
    const ps = this.pistas;
    const paso = this.paso;
    const r = this.r;
    const F = this.frames;
    for (let s = 0; s < this.ns; s++) {
      const TL = this.trozoL[s];
      const TR = this.trozoR[s];
      const d = ps[s];
      const g = this.g[s];
      if (!d || g < 0.0001) {
        TL.fill(0, 0, cuantos);
        TR.fill(0, 0, cuantos);
        continue;
      }
      const k = g / 32768;
      for (let i = 0; i < cuantos; i++) {
        const p = (n0 + i * r) * paso;
        if (p >= 0 && p < F - 1) {
          const q = p | 0;
          const f = p - q;
          const a = q * 2;
          if (f === 0) {
            TL[i] = k * d[a];
            TR[i] = k * d[a + 1];
          } else {
            TL[i] = k * (d[a] + (d[a + 2] - d[a]) * f);
            TR[i] = k * (d[a + 1] + (d[a + 3] - d[a + 1]) * f);
          }
        } else {
          TL[i] = 0;
          TR[i] = 0;
        }
      }
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
    // Se compara la onda como va a sonar: cada muestra de salida avanza r en la fuente
    const r = this.r;
    const M = HS / DEC;
    this.mono(natural, M, DEC * r, this.ref);
    const inicio = nominal - DELTA;
    const cuenta = (2 * DELTA + HS) / DEC;
    this.mono(inicio, cuenta, DEC * r, this.region);
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
    const grueso = Math.round(inicio + mejorJ * DEC * r);
    const L = 256;
    this.mono(natural, L, r, this.ref);
    this.mono(grueso - DEC * r, L + 2 * DEC, r, this.region);
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
        fino = Math.round(grueso - DEC * r + d * r);
      }
    }
    return fino;
  }

  generar() {
    for (let s = 0; s < 8; s++) this.g[s] += (this.gObjetivo[s] - this.g[s]) * 0.6;

    if (this.bucle && this.analisis >= this.bucle.b) {
      // Vuelta al principio del trozo: el solape funde el final con el inicio.
      this.analisis = this.bucle.a;
      this.previo = this.bucle.a - Math.round(HS * this.r);
    }
    if (this.analisis >= this.total()) {
      this.tocando = false;
      this.port.postMessage({ tipo: "fin" });
      return;
    }

    const nominal = Math.round(this.analisis);
    const natural = this.previo + Math.round(HS * this.r);
    const inicio = Math.abs(nominal - natural) <= 1 ? natural : this.buscar(nominal, natural);

    this.leer(inicio, N);
    const w0 = (this.fLeer + this.fHay) & MASCARA;
    // El segundo de la canción de cada muestra de este trozo (para el click)
    for (let i = 0, w = w0; i < HS; i++, w = (w + 1) & MASCARA) this.segFifo[w] = (this.analisis + i * this.velocidad) / sampleRate;
    for (let s = 0; s < this.ns; s++) {
      const fL = this.fL[s];
      const fR = this.fR[s];
      const cL = this.colaL[s];
      const cR = this.colaR[s];
      const TL = this.trozoL[s];
      const TR = this.trozoR[s];
      let w = w0;
      for (let i = 0; i < HS; i++) {
        const v = VENTANA[i];
        fL[w] = cL[i] + TL[i] * v;
        fR[w] = cR[i] + TR[i] * v;
        w = (w + 1) & MASCARA;
      }
      for (let i = 0; i < HS; i++) {
        const v = VENTANA[HS + i];
        cL[i] = TL[HS + i] * v;
        cR[i] = TR[HS + i] * v;
      }
    }
    this.fHay += HS;
    this.previo = inicio;
    this.analisis += HS * this.velocidad;
  }

  process(_entradas, salidas) {
    if (!this.tocando || this.pistas.length === 0) return true;

    const n = salidas[0][0].length;
    if (this.previa) {
      // La cuenta de entrada: solo suena el click; la canción espera
      const p = this.previa;
      const avance = this.velocidad / sampleRate;
      for (let i = 0; i < n; i++) {
        this.segBloque[i] = p.t;
        p.t += avance;
      }
      for (let s = 0; s < this.ns && s < salidas.length; s++) for (const canal of salidas[s]) canal.fill(0);
      if (this.salidaClick >= 0 && salidas[this.salidaClick]) this.escribirClick(salidas[this.salidaClick], n, true);
      if (p.t > p.hasta + 0.003) {
        this.previa = null;
        this.golpe = contar(this.click.golpes, p.hasta - 0.002); // que suene el golpe en que entra
      }
      if (++this.bloques % 6 === 0) this.avisar();
      return true;
    }
    while (this.fHay < n && this.tocando) this.generar();
    const cuantos = Math.min(n, this.fHay);
    // Sin recortar: lo que pase de 1 lo frena el limitador del final, ya mezclado
    for (let s = 0; s < this.ns && s < salidas.length; s++) {
      const L = salidas[s][0];
      const R = salidas[s][1] || L;
      const fL = this.fL[s];
      const fR = this.fR[s];
      for (let i = 0; i < cuantos; i++) {
        const k = (this.fLeer + i) & MASCARA;
        L[i] = fL[k];
        R[i] = fR[k];
      }
    }
    if (this.salidaClick >= 0 && salidas[this.salidaClick]) {
      for (let i = 0; i < cuantos; i++) this.segBloque[i] = this.segFifo[(this.fLeer + i) & MASCARA];
      this.escribirClick(salidas[this.salidaClick], cuantos, false);
    }
    this.fLeer = (this.fLeer + cuantos) & MASCARA;
    this.fHay -= cuantos;
    if (++this.bloques % 6 === 0) this.avisar();
    return true;
  }
}

/** Cuántos golpes de la lista (en orden) caen en `seg` o antes. */
function contar(lista, seg) {
  let a = 0;
  let b = lista.length;
  while (a < b) {
    const m = (a + b) >> 1;
    if (lista[m] <= seg) a = m + 1;
    else b = m;
  }
  return a;
}

/** El click: un golpe corto en cada pulso (más agudo el primero del compás). */
MezcladorPistas.prototype.escribirClick = function (salida, cuantos, enCuenta) {
  const L = salida[0];
  const R = salida[1] || L;
  const c = this.click;
  const lista = enCuenta ? this.previa.golpes : c.golpes;
  const DURA = Math.round(0.035 * sampleRate);
  for (let i = 0; i < cuantos; i++) {
    let v = 0;
    if (c.activo) {
      const seg = this.segBloque[i];
      const k = this.golpe;
      if (k === null || (k > 0 && lista[k - 1] > seg + 0.05)) {
        // Al empezar, tras moverse o al dar la vuelta un bucle: no suena de golpe
        this.golpe = contar(lista, seg);
      } else if (k < lista.length && lista[k] <= seg) {
        let j = k;
        while (j < lista.length && lista[j] <= seg) j++;
        this.golpe = j;
        // Solo si se acaba de pasar un golpe (no al saltar)
        if (j - k === 1 && seg - lista[k] < 0.05) {
          this.sonando = 0;
          this.acento = enCuenta ? k === 0 : (((k - c.uno) % c.compas) + c.compas) % c.compas === 0;
        }
      }
      if (this.sonando >= 0 && this.sonando < DURA) {
        const t = this.sonando / sampleRate;
        const f = this.acento ? 1760 : 1175;
        v = 0.6 * Math.exp(-t * 90) * Math.sin(2 * Math.PI * f * t);
        this.sonando++;
      }
    }
    L[i] = v;
    if (R !== L) R[i] = v;
  }
};

registerProcessor("mezclador-pistas", MezcladorPistas);
