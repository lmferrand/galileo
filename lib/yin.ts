// Detección del tono con el algoritmo YIN (de Cheveigné y Kawahara, 2002).
// Recibe un trozo de audio y devuelve la frecuencia fundamental, o null si
// lo que suena no es una nota clara (ruido, silencio, voces…).

export interface Lectura {
  frecuencia: number;
  /** 0–1: lo limpia que es la nota (1 = perfecta). */
  claridad: number;
  /** Volumen RMS del trozo. */
  volumen: number;
}

export interface OpcionesYin {
  frecuenciaMin?: number;
  frecuenciaMax?: number;
  umbral?: number;
  volumenMin?: number;
}

/**
 * @param muestras audio en bruto (-1…1)
 * @param frecuenciaMuestreo muestras por segundo de `muestras`
 */
export function detectarTono(
  muestras: Float32Array,
  frecuenciaMuestreo: number,
  { frecuenciaMin = 50, frecuenciaMax = 1200, umbral = 0.15, volumenMin = 0.004 }: OpcionesYin = {},
): Lectura | null {
  const n = muestras.length;

  let suma = 0;
  for (let i = 0; i < n; i++) suma += muestras[i] * muestras[i];
  const volumen = Math.sqrt(suma / n);
  if (volumen < volumenMin) return null;

  const tauMin = Math.max(2, Math.floor(frecuenciaMuestreo / frecuenciaMax));
  const tauMax = Math.min(Math.floor(n / 2), Math.ceil(frecuenciaMuestreo / frecuenciaMin));
  const ventana = n - tauMax;
  if (ventana < tauMax) return null;

  // 1) Función diferencia y 2) diferencia normalizada acumulada.
  const d = new Float32Array(tauMax + 1);
  d[0] = 1;
  let acumulado = 0;
  for (let tau = 1; tau <= tauMax; tau++) {
    let s = 0;
    for (let i = 0; i < ventana; i++) {
      const delta = muestras[i] - muestras[i + tau];
      s += delta * delta;
    }
    acumulado += s;
    d[tau] = acumulado > 0 ? (s * tau) / acumulado : 1;
  }

  // 3) Primer mínimo por debajo del umbral (evita confundir la octava).
  let tau = -1;
  for (let t = tauMin; t <= tauMax; t++) {
    if (d[t] < umbral) {
      while (t + 1 <= tauMax && d[t + 1] < d[t]) t++;
      tau = t;
      break;
    }
  }
  if (tau === -1) return null;

  // Mínimo de d cerca de una posición (±3 muestras), o -1 si no hay un valle ahí.
  const valleCerca = (centro: number) => {
    if (centro - 3 < tauMin || centro + 3 > tauMax) return -1;
    let mejor = centro;
    for (let t = centro - 3; t <= centro + 3; t++) if (d[t] < d[mejor]) mejor = t;
    return d[mejor] <= d[mejor - 1] && d[mejor] <= d[mejor + 1] ? mejor : -1;
  };

  // 3b) Octava de arriba: en una cuerda grave el 2.º armónico suena muy fuerte (y el
  // micro del móvil apenas coge el fundamental), así que el primer valle puede ser la
  // mitad del periodo. Si el doble (o el triple) encaja mucho mejor, la nota es esa.
  // Con una nota de verdad aguda el doble encaja igual, no mucho mejor: no la baja.
  let corregida = false;
  if (d[tau] > 0.03) {
    for (const k of [2, 3]) {
      const t = valleCerca(tau * k);
      if (t > 0 && d[t] < d[tau] * 0.55) {
        tau = t;
        corregida = true;
        break;
      }
    }
  }

  // 3c) Octava de abajo: con poca señal (final de una nota, sala con ruido) el periodo
  // bueno queda justo por encima del umbral y el doble por debajo. Si el valle elegido
  // es flojo y la mitad (o un tercio, o un cuarto) encaja casi igual de bien, es esa.
  if (!corregida && d[tau] > 0.05) {
    for (const k of [4, 3, 2]) {
      const t = valleCerca(Math.round(tau / k));
      if (t > 0 && d[t] < d[tau] * 1.5 + 0.03) {
        tau = t;
        break;
      }
    }
  }

  // 4) Interpolación parabólica para afinar el periodo entre muestras.
  let periodo = tau;
  if (tau > 1 && tau < tauMax) {
    const a = d[tau - 1];
    const b = d[tau];
    const c = d[tau + 1];
    const denom = a + c - 2 * b;
    if (denom !== 0) periodo = tau + (a - c) / (2 * denom);
  }

  return { frecuencia: frecuenciaMuestreo / periodo, claridad: 1 - d[tau], volumen };
}

/**
 * Baja a la mitad la frecuencia de muestreo promediando pares de muestras.
 * Las notas de una guitarra no pasan de ~1.300 Hz, así que no se pierde nada
 * y el cálculo va cuatro veces más rápido.
 */
export function reducirAMitad(entrada: Float32Array, salida: Float32Array): Float32Array {
  const m = Math.floor(entrada.length / 2);
  for (let i = 0; i < m; i++) salida[i] = (entrada[2 * i] + entrada[2 * i + 1]) * 0.5;
  return salida;
}

export function mediana(valores: number[]): number {
  const v = [...valores].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}
