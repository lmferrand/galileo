// Ajustes de la Mesa: dos canales (entradas 1 y 2 de la interfaz) con sus efectos y el volumen
// general. Se recuerdan en este aparato. Los «sonidos» son puntos de partida (solo tocan efectos).

export interface AjustesCanal {
  /** dB que se suben a la entrada (0–30) */
  ganancia: number;
  /** 0–1,5 */
  volumen: number;
  /** −1 (izquierda) a 1 (derecha) */
  panorama: number;
  silencio: boolean;
  puerta: { activo: boolean; umbral: number };
  compresor: { activo: boolean; cantidad: number };
  distorsion: { activo: boolean; drive: number; tono: number; nivel: number };
  ecualizador: { activo: boolean; graves: number; medios: number; agudos: number };
  chorus: { activo: boolean; velocidad: number; profundidad: number; mezcla: number };
  delay: { activo: boolean; tiempo: number; repeticiones: number; mezcla: number };
  reverb: { activo: boolean; tamano: number; mezcla: number };
}

export interface AjustesMesa {
  canales: [AjustesCanal, AjustesCanal];
  /** 0–1,5 */
  general: number;
}

export type Efecto = "puerta" | "compresor" | "distorsion" | "ecualizador" | "chorus" | "delay" | "reverb";

const BASE: AjustesCanal = {
  ganancia: 6,
  volumen: 0.8,
  panorama: 0,
  silencio: false,
  puerta: { activo: false, umbral: -60 },
  compresor: { activo: true, cantidad: 0.35 },
  distorsion: { activo: false, drive: 0.4, tono: 0.55, nivel: 0.7 },
  ecualizador: { activo: true, graves: 0, medios: 0, agudos: 0 },
  chorus: { activo: false, velocidad: 0.25, profundidad: 0.4, mezcla: 0.45 },
  delay: { activo: false, tiempo: 380, repeticiones: 0.3, mezcla: 0.25 },
  reverb: { activo: true, tamano: 0.4, mezcla: 0.2 },
};

export const AJUSTES_INICIALES: AjustesMesa = {
  canales: [structuredClone(BASE), { ...structuredClone(BASE), compresor: { activo: true, cantidad: 0.45 }, reverb: { activo: true, tamano: 0.45, mezcla: 0.18 } }],
  general: 1,
};

type Sonido = Pick<AjustesCanal, Efecto>;

/** Puntos de partida para la guitarra (y uno para la voz). */
export const SONIDOS: { nombre: string; efectos: Sonido }[] = [
  {
    nombre: "Limpio",
    efectos: { ...pick(BASE), chorus: { ...BASE.chorus, activo: false }, reverb: { activo: true, tamano: 0.35, mezcla: 0.18 } },
  },
  {
    nombre: "Blues",
    efectos: {
      ...pick(BASE),
      compresor: { activo: true, cantidad: 0.3 },
      distorsion: { activo: true, drive: 0.3, tono: 0.45, nivel: 0.75 },
      ecualizador: { activo: true, graves: 1, medios: 3, agudos: -1 },
      delay: { activo: true, tiempo: 320, repeticiones: 0.2, mezcla: 0.15 },
      reverb: { activo: true, tamano: 0.45, mezcla: 0.22 },
    },
  },
  {
    nombre: "Rock",
    efectos: {
      ...pick(BASE),
      puerta: { activo: true, umbral: -55 },
      compresor: { activo: true, cantidad: 0.4 },
      distorsion: { activo: true, drive: 0.75, tono: 0.6, nivel: 0.6 },
      ecualizador: { activo: true, graves: 2, medios: -2, agudos: 2 },
      reverb: { activo: true, tamano: 0.3, mezcla: 0.12 },
    },
  },
  {
    nombre: "Ambiente",
    efectos: {
      ...pick(BASE),
      chorus: { activo: true, velocidad: 0.2, profundidad: 0.5, mezcla: 0.5 },
      delay: { activo: true, tiempo: 480, repeticiones: 0.45, mezcla: 0.32 },
      reverb: { activo: true, tamano: 0.85, mezcla: 0.4 },
    },
  },
  {
    nombre: "Voz",
    efectos: {
      ...pick(BASE),
      puerta: { activo: true, umbral: -58 },
      compresor: { activo: true, cantidad: 0.5 },
      ecualizador: { activo: true, graves: -3, medios: 1, agudos: 2 },
      reverb: { activo: true, tamano: 0.5, mezcla: 0.2 },
    },
  },
];

function pick(c: AjustesCanal): Sonido {
  return {
    puerta: { ...c.puerta, activo: false },
    compresor: { ...c.compresor },
    distorsion: { ...c.distorsion, activo: false },
    ecualizador: { activo: true, graves: 0, medios: 0, agudos: 0 },
    chorus: { ...c.chorus, activo: false },
    delay: { ...c.delay, activo: false },
    reverb: { ...c.reverb },
  };
}

const CLAVE = "clavija:mesa:v1";
const CLAVE_PISTAS = "clavija:mesa:pistas:v1";
/** El volumen general de serie era 0,7: ahora es 1 (también manda en la canción de Pistas). */
const GENERAL_ANTIGUO = 0.7;

/** Lo guardado de un canal, completado con lo de serie (por si faltan efectos de una versión anterior). */
function completar(g: Partial<AjustesCanal> | undefined, base: AjustesCanal): AjustesCanal {
  const p = (g ?? {}) as Partial<AjustesCanal>;
  const efecto = <K extends Efecto>(k: K) => ({ ...base[k], ...(p[k] ?? {}) }) as AjustesCanal[K];
  return {
    ganancia: typeof p.ganancia === "number" ? p.ganancia : base.ganancia,
    volumen: typeof p.volumen === "number" ? p.volumen : base.volumen,
    panorama: typeof p.panorama === "number" ? p.panorama : base.panorama,
    silencio: p.silencio === true,
    puerta: efecto("puerta"),
    compresor: efecto("compresor"),
    distorsion: efecto("distorsion"),
    ecualizador: efecto("ecualizador"),
    chorus: efecto("chorus"),
    delay: efecto("delay"),
    reverb: efecto("reverb"),
  };
}

export function leerAjustesMesa(): AjustesMesa {
  try {
    const p = JSON.parse(localStorage.getItem(CLAVE) ?? "null") as (Partial<AjustesMesa> & { v?: number }) | null;
    if (!p || !Array.isArray(p.canales)) return structuredClone(AJUSTES_INICIALES);
    let general = typeof p.general === "number" ? p.general : AJUSTES_INICIALES.general;
    if (p.v !== 2 && general === GENERAL_ANTIGUO) general = AJUSTES_INICIALES.general;
    return { canales: [completar(p.canales[0], AJUSTES_INICIALES.canales[0]), completar(p.canales[1], AJUSTES_INICIALES.canales[1])], general };
  } catch {
    return structuredClone(AJUSTES_INICIALES);
  }
}

export function guardarAjustesMesa(a: AjustesMesa) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ ...a, v: 2 }));
  } catch {
    /* sin almacenamiento: vale para esta visita */
  }
}

/**
 * Las pistas de la canción (voz, guitarra…) en la Mesa: sin efectos de serie, para que suene como
 * siempre hasta que toques algo. Su volumen y su silencio son los del reproductor (no van aquí).
 */
export const AJUSTES_PISTA: AjustesCanal = {
  ...structuredClone(BASE),
  ganancia: 0,
  volumen: 1,
  compresor: { activo: false, cantidad: 0.35 },
  ecualizador: { activo: false, graves: 0, medios: 0, agudos: 0 },
  reverb: { activo: false, tamano: 0.4, mezcla: 0.2 },
};

/** Los ajustes de cada pista, en el orden de PISTAS (lib/pistas/tipos). */
export function leerAjustesPistas(cuantas: number): AjustesCanal[] {
  let guardadas: Partial<AjustesCanal>[] = [];
  try {
    const p = JSON.parse(localStorage.getItem(CLAVE_PISTAS) ?? "null");
    if (Array.isArray(p)) guardadas = p;
  } catch {
    /* nada guardado */
  }
  return Array.from({ length: cuantas }, (_, i) => completar(guardadas[i], AJUSTES_PISTA));
}

export function guardarAjustesPistas(a: AjustesCanal[]) {
  try {
    localStorage.setItem(CLAVE_PISTAS, JSON.stringify(a));
  } catch {
    /* sin almacenamiento */
  }
}
