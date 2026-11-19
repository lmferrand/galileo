// Clavija, Mesa: graba lo que tocas (las entradas ya con los efectos de la mesa), en estéreo.
// Manda trozos intercalados (izquierda, derecha, izquierda…) al hilo principal.

const TROZO = 4096;

class TomaMesa extends AudioWorkletProcessor {
  constructor() {
    super();
    this.activo = false;
    this.buffer = new Float32Array(TROZO * 2);
    this.lleno = 0;
    this.port.onmessage = (e) => {
      if (e.data === "empezar") {
        this.activo = true;
        this.lleno = 0;
      } else if (e.data === "parar") {
        this.soltar();
        this.activo = false;
        this.port.postMessage("parado");
      }
    };
  }

  soltar() {
    if (!this.lleno) return;
    const datos = this.buffer.slice(0, this.lleno * 2);
    this.port.postMessage(datos, [datos.buffer]);
    this.lleno = 0;
  }

  process(inputs) {
    const entrada = inputs[0];
    if (!this.activo || !entrada || entrada.length === 0) return true;
    const l = entrada[0];
    const r = entrada[1] || entrada[0];
    for (let i = 0; i < l.length; i++) {
      this.buffer[this.lleno * 2] = l[i];
      this.buffer[this.lleno * 2 + 1] = r[i];
      if (++this.lleno === TROZO) this.soltar();
    }
    return true;
  }
}

registerProcessor("clavija-toma", TomaMesa);
