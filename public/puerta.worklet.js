// Puerta de ruido de la Mesa: cuando lo que entra baja del umbral (la guitarra no suena y solo
// queda el zumbido), cierra el paso poco a poco; al volver a tocar, abre al momento.
// Parámetros: umbral (dB) y activo (0/1). Sin activo, deja pasar todo.

class PuertaRuido extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "umbral", defaultValue: -60, minValue: -100, maxValue: 0, automationRate: "k-rate" },
      { name: "activo", defaultValue: 0, minValue: 0, maxValue: 1, automationRate: "k-rate" },
    ];
  }

  constructor() {
    super();
    this.envolvente = 0;
    this.paso = 1;
    // Coeficientes de seguir la señal y de abrir/cerrar (ataque rápido, cierre suave)
    const k = (s) => 1 - Math.exp(-1 / (sampleRate * s));
    this.sigueSube = k(0.002);
    this.sigueBaja = k(0.12);
    this.abre = k(0.001);
    this.cierra = k(0.08);
  }

  process(entradas, salidas, p) {
    const entrada = entradas[0];
    const salida = salidas[0];
    if (!entrada || !entrada.length) return true;
    const activo = p.activo[0] > 0.5;
    const umbral = Math.pow(10, p.umbral[0] / 20);
    const n = entrada[0].length;
    for (let i = 0; i < n; i++) {
      let pico = 0;
      for (let c = 0; c < entrada.length; c++) pico = Math.max(pico, Math.abs(entrada[c][i]));
      this.envolvente += (pico > this.envolvente ? this.sigueSube : this.sigueBaja) * (pico - this.envolvente);
      const objetivo = !activo || this.envolvente > umbral ? 1 : 0;
      this.paso += (objetivo > this.paso ? this.abre : this.cierra) * (objetivo - this.paso);
      for (let c = 0; c < salida.length; c++) salida[c][i] = (entrada[c] || entrada[0])[i] * this.paso;
    }
    return true;
  }
}

registerProcessor("puerta-ruido", PuertaRuido);
