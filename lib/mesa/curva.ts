// La escala de los faders, como en una mesa de verdad: el 0 dB (el sonido tal cual) a tres
// cuartos del recorrido, +10 dB arriba del todo y, bajando, −10, −20… hasta −∞ (silencio) abajo.
// Los ajustes guardan el volumen como multiplicador (1 = 0 dB); el fader trabaja en posición.

/** [posición 0–1, dB] */
const PUNTOS: [number, number][] = [
  [0.02, -70],
  [0.08, -50],
  [0.16, -40],
  [0.27, -30],
  [0.4, -20],
  [0.55, -10],
  [0.65, -5],
  [0.75, 0],
  [0.875, 5],
  [1, 10],
];

/** El 0 dB, en posición */
export const POS_CERO = 0.75;
/** Lo más alto: +10 dB */
export const MAXIMO = Math.pow(10, 10 / 20);
/** Marcas que se pintan en el fader */
export const MARCAS: { db: number; texto: string }[] = [
  { db: 10, texto: "+10" },
  { db: 5, texto: "+5" },
  { db: 0, texto: "0" },
  { db: -5, texto: "5" },
  { db: -10, texto: "10" },
  { db: -20, texto: "20" },
  { db: -30, texto: "30" },
  { db: -40, texto: "40" },
  { db: -Infinity, texto: "∞" },
];

export function dbDePos(pos: number): number {
  if (pos <= PUNTOS[0][0]) return -Infinity;
  for (let i = 1; i < PUNTOS.length; i++) {
    const [p1, d1] = PUNTOS[i];
    if (pos <= p1) {
      const [p0, d0] = PUNTOS[i - 1];
      return d0 + ((pos - p0) / (p1 - p0)) * (d1 - d0);
    }
  }
  return PUNTOS[PUNTOS.length - 1][1];
}

export function posDeDb(db: number): number {
  if (!Number.isFinite(db)) return 0;
  if (db <= PUNTOS[0][1]) return PUNTOS[0][0];
  for (let i = 1; i < PUNTOS.length; i++) {
    const [p1, d1] = PUNTOS[i];
    if (db <= d1) {
      const [p0, d0] = PUNTOS[i - 1];
      return p0 + ((db - d0) / (d1 - d0)) * (p1 - p0);
    }
  }
  return 1;
}

export const dbDeAmplitud = (a: number) => (a <= 0 ? -Infinity : 20 * Math.log10(a));
export const amplitudDeDb = (db: number) => (Number.isFinite(db) ? Math.pow(10, db / 20) : 0);
export const posDeAmplitud = (a: number) => posDeDb(dbDeAmplitud(a));

/** De la posición del fader al multiplicador; cerca del 0 dB se queda en 0 dB (la muesca). */
export function amplitudDePos(pos: number): number {
  const db = dbDePos(pos);
  if (Math.abs(db) < 0.3) return 1;
  return amplitudDeDb(db);
}

/** «0 dB», «−3,5 dB», «+6 dB», «−∞» */
export function verDb(a: number): string {
  const db = dbDeAmplitud(a);
  if (!Number.isFinite(db) || db < -69) return "−∞";
  const r = Math.round(db * 2) / 2;
  if (r === 0) return "0 dB";
  return `${r > 0 ? "+" : "−"}${Math.abs(r).toLocaleString("es-ES", { maximumFractionDigits: 1 })} dB`;
}
