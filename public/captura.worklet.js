// Clavija, looper: recoge lo que entra por el micro (o la interfaz) dentro del hilo
// de audio y lo manda en trozos, cada uno con la hora exacta (reloj del audio) de
// su primera muestra. Así las capas se colocan en su sitio del bucle.

const TROZO = 2048;

class CapturaLooper extends AudioWorkletProcessor {
  constructor() {
    super();
    this.activo = false;
    this.buffer = new Float32Array(TROZO);
    this.lleno = 0;
    this.inicio = 0;
    this.port.onmessage = (e) => {
      if (e.data === "empezar") {
        this.activo = true;
        this.lleno = 0;
      } else if (e.data === "parar") {
        this.soltar();
        this.activo = false;
      }
    };
  }

  soltar() {
    if (!this.lleno) return;
    const datos = this.buffer.slice(0, this.lleno);
    this.port.postMessage({ t: this.inicio, datos }, [datos.buffer]);
    this.lleno = 0;
  }

  process(inputs) {
    const canal = inputs[0] && inputs[0][0];
    if (!this.activo || !canal) return true;
    for (let i = 0; i < canal.length; i++) {
      if (this.lleno === 0) this.inicio = currentTime + i / sampleRate;
      this.buffer[this.lleno++] = canal[i];
      if (this.lleno === TROZO) this.soltar();
    }
    return true;
  }
}

registerProcessor("clavija-captura", CapturaLooper);
