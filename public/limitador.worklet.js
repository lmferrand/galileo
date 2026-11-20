// Limitador de la salida de la Mesa sin espera: lo que tocas sale en el mismo instante.
// El limitador del navegador (DynamicsCompressorNode) espera unos 6 ms para ver venir los picos
// («lookahead»): al cantar o tocar con cascos, ese retraso se suma al del aparato y se nota.
// Este baja el volumen en el momento en que llega un pico (nunca pasa del techo) y lo recupera poco
// a poco; aguanta un instante antes de recuperarlo para no ondular con las notas graves.

const TECHO = Math.pow(10, -3 / 20); // -3 dB, como el limitador de antes

class LimitadorMesa extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ganancia = 1;
    this.aguanta = 0;
    this.muestrasAguante = Math.round(sampleRate * 0.02);
    this.suelta = 1 - Math.exp(-1 / (sampleRate * 0.1));
  }

  process(entradas, salidas) {
    const entrada = entradas[0];
    const salida = salidas[0];
    if (!entrada || !entrada.length) {
      for (const canal of salida) canal.fill(0);
      return true;
    }
    const n = salida[0].length;
    for (let i = 0; i < n; i++) {
      let pico = 0;
      for (let c = 0; c < entrada.length; c++) {
        const v = Math.abs(entrada[c][i]);
        if (v > pico) pico = v;
      }
      const objetivo = pico > TECHO ? TECHO / pico : 1;
      if (objetivo < this.ganancia) {
        this.ganancia = objetivo;
        this.aguanta = this.muestrasAguante;
      } else if (this.aguanta > 0) {
        this.aguanta--;
      } else {
        this.ganancia += this.suelta * (objetivo - this.ganancia);
      }
      for (let c = 0; c < salida.length; c++) salida[c][i] = (entrada[c] || entrada[0])[i] * this.ganancia;
    }
    return true;
  }
}

registerProcessor("limitador-mesa", LimitadorMesa);
