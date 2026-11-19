// La onda de la canción para la pantalla de la Mesa: la fuerza de la mezcla en `puntos` trozos.
// Se calcula al abrir la canción (antes de que las pistas pasen al hilo de audio) mirando unas
// pocas muestras de cada trozo: es para dibujar, no hace falta más y es instantáneo.

const MUESTRAS_POR_PUNTO = 96;

export function ondaDe(pistas: Int16Array[], frames: number, puntos = 480): Float32Array {
  const onda = new Float32Array(puntos);
  if (frames <= 0 || pistas.length === 0) return onda;
  const porPunto = frames / puntos;
  const paso = Math.max(1, Math.floor(porPunto / MUESTRAS_POR_PUNTO));
  let maximo = 1e-9;
  for (let k = 0; k < puntos; k++) {
    const ini = Math.floor(k * porPunto);
    const fin = Math.min(frames - 1, Math.floor((k + 1) * porPunto));
    let suma = 0;
    let n = 0;
    for (let f = ini; f < fin; f += paso) {
      let l = 0;
      let r = 0;
      for (const p of pistas) {
        if (2 * f + 1 >= p.length) continue;
        l += p[2 * f];
        r += p[2 * f + 1];
      }
      suma += (l * l + r * r) / 2;
      n++;
    }
    const v = n ? Math.sqrt(suma / n) : 0;
    onda[k] = v;
    if (v > maximo) maximo = v;
  }
  for (let k = 0; k < puntos; k++) onda[k] = Math.min(1, onda[k] / maximo);
  return onda;
}
