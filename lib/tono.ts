// Nota de referencia: un sonido de cuerda pulsada hecho con armónicos.
// La frecuencia es exacta (la marca el oscilador), así sirve para afinar de oído.

const ondas = new WeakMap<BaseAudioContext, PeriodicWave>();

function ondaCuerda(ctx: BaseAudioContext): PeriodicWave {
  const hecha = ondas.get(ctx);
  if (hecha) return hecha;
  const n = 16;
  const real = new Float32Array(n + 1);
  const imag = new Float32Array(n + 1);
  for (let k = 1; k <= n; k++) {
    // Pulsada cerca del puente: armónicos que caen poco a poco, algo más flojos los pares.
    imag[k] = (1 / Math.pow(k, 1.25)) * (k % 2 === 0 ? 0.7 : 1) * Math.sin((k * Math.PI) / 7 + 0.4);
  }
  const onda = ctx.createPeriodicWave(real, imag);
  ondas.set(ctx, onda);
  return onda;
}

/** Toca una nota y devuelve cuántos milisegundos va a sonar. */
export function tocarNota(ctx: AudioContext, frecuencia: number, retraso = 0, duracion = 2.4): number {
  const t = ctx.currentTime + 0.02 + retraso;

  const osc = ctx.createOscillator();
  osc.setPeriodicWave(ondaCuerda(ctx));
  osc.frequency.value = frecuencia;

  const filtro = ctx.createBiquadFilter();
  filtro.type = "lowpass";
  filtro.Q.value = 0.7;
  filtro.frequency.setValueAtTime(Math.min(9000, frecuencia * 14), t);
  filtro.frequency.exponentialRampToValueAtTime(Math.max(frecuencia * 2, 400), t + duracion * 0.8);

  const volumen = ctx.createGain();
  volumen.gain.setValueAtTime(0.0001, t);
  volumen.gain.exponentialRampToValueAtTime(0.42, t + 0.006);
  volumen.gain.exponentialRampToValueAtTime(0.16, t + 0.35);
  volumen.gain.exponentialRampToValueAtTime(0.0001, t + duracion);

  osc.connect(filtro).connect(volumen).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duracion + 0.05);
  return (retraso + duracion) * 1000;
}

/** Las seis cuerdas una detrás de otra, de la 6.ª a la 1.ª. */
export function tocarArpegio(ctx: AudioContext, frecuencias: number[]): number {
  let total = 0;
  frecuencias.forEach((f, i) => {
    total = Math.max(total, tocarNota(ctx, f, i * 0.42, 1.9));
  });
  return total;
}
