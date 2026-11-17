// Clavija: mezcla las 6 pistas en tiempo real dentro del hilo de audio.
// Cada pista llega como Int16Array estéreo intercalado (L, R, L, R…) a 44,1 kHz.
// Así todas suenan siempre a la vez, muestra a muestra, sin desfases.

class MezcladorPistas extends AudioWorkletProcessor {
  constructor() {
    super();
    this.pistas = [];
    this.frames = 0;
    this.pos = 0;
    this.paso = 1;
    this.tocando = false;
    this.ganancia = new Float32Array(8);
    this.objetivo = new Float32Array(8);
    this.bloques = 0;
    this.port.onmessage = (e) => this.mensaje(e.data);
  }

  mensaje(m) {
    switch (m.tipo) {
      case "cargar":
        this.pistas = m.pistas;
        this.frames = m.frames;
        this.pos = 0;
        this.paso = m.frecuencia / sampleRate;
        this.tocando = false;
        this.avisar();
        break;
      case "vaciar":
        this.pistas = [];
        this.frames = 0;
        this.tocando = false;
        break;
      case "tocar":
        if (this.pos >= this.frames - 2) this.pos = 0;
        this.tocando = true;
        this.avisar();
        break;
      case "pausar":
        this.tocando = false;
        this.avisar();
        break;
      case "ir":
        this.pos = Math.max(0, Math.min(this.frames - 2, m.frame));
        this.avisar();
        break;
      case "ganancias":
        for (let i = 0; i < m.valores.length; i++) this.objetivo[i] = m.valores[i];
        if (m.inmediato) for (let i = 0; i < m.valores.length; i++) this.ganancia[i] = m.valores[i];
        break;
    }
  }

  avisar() {
    this.port.postMessage({ tipo: "pos", frame: this.pos, tocando: this.tocando });
  }

  process(_entradas, salidas) {
    const salida = salidas[0];
    const L = salida[0];
    const R = salida[1] || salida[0];
    if (!this.tocando || this.pistas.length === 0) return true;

    const n = L.length;
    const suavizado = 0.003;
    const total = this.pistas.length;
    for (let i = 0; i < n; i++) {
      if (this.pos >= this.frames - 2) {
        this.tocando = false;
        this.port.postMessage({ tipo: "fin" });
        break;
      }
      const p = this.pos | 0;
      const f = this.pos - p;
      const a = p * 2;
      let l = 0;
      let r = 0;
      for (let s = 0; s < total; s++) {
        const g = (this.ganancia[s] += (this.objetivo[s] - this.ganancia[s]) * suavizado);
        if (g < 0.0001) continue;
        const d = this.pistas[s];
        l += g * (d[a] + (d[a + 2] - d[a]) * f);
        r += g * (d[a + 1] + (d[a + 3] - d[a + 1]) * f);
      }
      l /= 32768;
      r /= 32768;
      L[i] = l > 1 ? 1 : l < -1 ? -1 : l;
      R[i] = r > 1 ? 1 : r < -1 ? -1 : r;
      this.pos += this.paso;
    }
    if (++this.bloques % 6 === 0) this.avisar();
    return true;
  }
}

registerProcessor("mezclador-pistas", MezcladorPistas);
