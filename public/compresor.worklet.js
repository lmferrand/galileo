// Compresor de las entradas de la Mesa sin espera: lo que cantas o tocas sale en el mismo instante.
// El compresor del navegador (DynamicsCompressorNode) espera unos 6 ms para ver venir los picos
// («lookahead») y ese retraso se nota al oírte en los cascos. Este hace la misma cuenta que pide la
// norma de Web Audio para aquel, para que suene igual:
//  - por debajo del umbral, tal cual; desde el umbral, una rodilla suave de `rodilla` dB en la que la
//    pendiente pasa de 1 a 1/razón; por encima, 1/razón;
//  - la compensación automática de volumen: (1 / lo que el compresor deja de un pico a 0 dB) ^ 0,6.
// Lo único distinto: baja el volumen cuando llega el pico, no unos milisegundos antes.
// Parámetros: umbral (dB), razon y rodilla (dB). Opciones: ataque y suelta (segundos).

class CompresorMesa extends AudioWorkletProcessor {
  static get parameterDescriptors() {
    return [
      { name: "umbral", defaultValue: -24, minValue: -100, maxValue: 0, automationRate: "k-rate" },
      { name: "razon", defaultValue: 12, minValue: 1, maxValue: 20, automationRate: "k-rate" },
      { name: "rodilla", defaultValue: 30, minValue: 0, maxValue: 40, automationRate: "k-rate" },
    ];
  }

  constructor(opciones) {
    super();
    const o = (opciones && opciones.processorOptions) || {};
    const k = (s) => 1 - Math.exp(-1 / (sampleRate * Math.max(0.0001, s)));
    this.ataque = k(o.ataque ?? 0.003);
    this.suelta = k(o.suelta ?? 0.25);
    /** Lo que se baja ahora mismo (dB, 0 o negativo) */
    this.reduccion = 0;
  }

  /** Lo que sale (dB) por lo que entra (dB) */
  curva(x, umbral, razon, rodilla) {
    const pendiente = 1 / razon - 1;
    if (x <= umbral) return x;
    if (rodilla > 0 && x < umbral + rodilla) {
      const d = x - umbral;
      return x + (pendiente * d * d) / (2 * rodilla);
    }
    return x + pendiente * (x - umbral - rodilla / 2);
  }

  process(entradas, salidas, p) {
    const entrada = entradas[0];
    const salida = salidas[0];
    if (!entrada || !entrada.length) return true;
    const umbral = p.umbral[0];
    const razon = p.razon[0];
    const rodilla = p.rodilla[0];
    // La compensación de la norma: lo que se pierde en un pico a 0 dB, elevado a 0,6
    const compensa = -0.6 * this.curva(0, umbral, razon, rodilla);
    const n = salida[0].length;
    for (let i = 0; i < n; i++) {
      let pico = 0;
      for (let c = 0; c < entrada.length; c++) {
        const v = Math.abs(entrada[c][i]);
        if (v > pico) pico = v;
      }
      const nivel = pico > 1e-6 ? 20 * Math.log10(pico) : -120;
      const objetivo = this.curva(nivel, umbral, razon, rodilla) - nivel;
      this.reduccion += (objetivo < this.reduccion ? this.ataque : this.suelta) * (objetivo - this.reduccion);
      const g = Math.pow(10, (this.reduccion + compensa) / 20);
      for (let c = 0; c < salida.length; c++) salida[c][i] = (entrada[c] || entrada[0])[i] * g;
    }
    return true;
  }
}

registerProcessor("compresor-mesa", CompresorMesa);
