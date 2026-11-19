// Ajustes de la Mesa: dos canales (entradas 1 y 2 de la interfaz) con sus efectos y el volumen
// general. Se recuerdan en este aparato. Los «sonidos» son puntos de partida (solo tocan efectos).

export interface AjustesCanal {
  /** dB que se suben o bajan a la entrada (0 = tal cual) */
  ganancia: number;
  /** Multiplicador: 1 = 0 dB (tal cual), hasta +10 dB (lib/mesa/curva) */
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
  /** Multiplicador: 1 = 0 dB */
  general: number;
  maestros: Maestros;
}

/**
 * Las ruedas de la sección general de la mesa, en dB (0 = tal cual): MASTER es el volumen de la
 * canción (las pistas juntas), MONITOR el de lo que tocas (las entradas juntas) y REV y DELAY
 * MASTER suben o bajan la reverb y el delay de todos los canales a la vez.
 */
export interface Maestros {
  cancion: number;
  monitor: number;
  reverb: number;
  delay: number;
}

export const MAESTROS_INICIALES: Maestros = { cancion: 0, monitor: 0, reverb: 0, delay: 0 };
/** Lo que se pueden subir o bajar las ruedas de la sección general */
export const MAESTRO_DB = 12;

const veces = (db: number) => Math.pow(10, db / 20);

/** Un canal con la reverb y el delay de la sección general (REV y DELAY MASTER) aplicados. */
export function conMaestros(c: AjustesCanal, m: Maestros): AjustesCanal {
  if (!m.reverb && !m.delay) return c;
  return {
    ...c,
    reverb: { ...c.reverb, mezcla: Math.min(1, c.reverb.mezcla * veces(m.reverb)) },
    delay: { ...c.delay, mezcla: Math.min(1, c.delay.mezcla * veces(m.delay)) },
  };
}
/** El volumen de las entradas: el general por el MONITOR */
export const generalEntradas = (a: AjustesMesa) => a.general * veces(a.maestros.monitor);
/** El volumen de la canción: el general por el MASTER */
export const generalCancion = (a: AjustesMesa) => a.general * veces(a.maestros.cancion);

function leerMaestros(m: unknown): Maestros {
  const o = (m && typeof m === "object" ? m : {}) as Partial<Record<keyof Maestros, unknown>>;
  const uno = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? Math.max(-MAESTRO_DB, Math.min(MAESTRO_DB, v)) : 0);
  return { cancion: uno(o.cancion), monitor: uno(o.monitor), reverb: uno(o.reverb), delay: uno(o.delay) };
}

export type Efecto = "puerta" | "compresor" | "distorsion" | "ecualizador" | "chorus" | "delay" | "reverb";

// Todos los mandos empiezan en 0 dB (el sonido tal cual): desde ahí se ajusta.
const BASE: AjustesCanal = {
  ganancia: 0,
  volumen: 1,
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
  maestros: { ...MAESTROS_INICIALES },
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
// v2: desde que todo empieza en 0 dB (lo de la v1 se deja: así cada pista empieza a 0 dB)
const CLAVE_PISTAS = "clavija:mesa:pistas:v2";
/** Ganancia, volumen, ecualizador y panorama a 0 dB (en el centro); los efectos, como estaban */
const aCero = (c: AjustesCanal): AjustesCanal => ({ ...c, ganancia: 0, volumen: 1, panorama: 0, ecualizador: { ...c.ecualizador, graves: 0, medios: 0, agudos: 0 } });

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
    if (p.v !== 2 && p.v !== 3 && general === GENERAL_ANTIGUO) general = AJUSTES_INICIALES.general;
    const canales: AjustesMesa["canales"] = [completar(p.canales[0], AJUSTES_INICIALES.canales[0]), completar(p.canales[1], AJUSTES_INICIALES.canales[1])];
    // Desde la versión 3 todo empieza en 0 dB: lo guardado antes se pone a 0 dB una vez (los efectos se quedan)
    const maestros = leerMaestros(p.maestros);
    if ((p.v ?? 1) < 3) return { canales: canales.map(aCero) as AjustesMesa["canales"], general: 1, maestros };
    return { canales, general, maestros };
  } catch {
    return structuredClone(AJUSTES_INICIALES);
  }
}

export function guardarAjustesMesa(a: AjustesMesa) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify({ ...a, v: 3 }));
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
