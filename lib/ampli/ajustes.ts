// El equipo de la guitarra eléctrica: una pedalera de cinco pedales y un amplificador. Diseños y
// nombres propios (ninguna marca). Aquí van sus mandos, cómo vienen de serie y dónde se recuerdan
// (en este aparato). El sonido lo hace lib/ampli/cadena y lo enciende lib/ampli/ampli.
// Todos los mandos van de 0 a 1 (en pantalla, de 0 a 10, como en un ampli de verdad).

export type PedalId = "sosten" | "brasa" | "trueno" | "marea" | "eco";

export interface MandoEquipo {
  k: string;
  nombre: string;
}

export interface Pedal {
  id: PedalId;
  /** El nombre pintado en el pedal */
  nombre: string;
  /** Lo que hace, para quien no lo vea */
  tipo: string;
  mandos: MandoEquipo[];
}

/** En el orden en que pasa el sonido: de la guitarra al ampli */
export const PEDALES: Pedal[] = [
  {
    id: "sosten",
    nombre: "Sostén",
    tipo: "Compresor",
    mandos: [
      { k: "cantidad", nombre: "Sostén" },
      { k: "nivel", nombre: "Nivel" },
    ],
  },
  {
    id: "brasa",
    nombre: "Brasa",
    tipo: "Saturación",
    mandos: [
      { k: "ganancia", nombre: "Ganancia" },
      { k: "tono", nombre: "Tono" },
      { k: "nivel", nombre: "Nivel" },
    ],
  },
  {
    id: "trueno",
    nombre: "Trueno",
    tipo: "Distorsión",
    mandos: [
      { k: "ganancia", nombre: "Ganancia" },
      { k: "tono", nombre: "Tono" },
      { k: "nivel", nombre: "Nivel" },
    ],
  },
  {
    id: "marea",
    nombre: "Marea",
    tipo: "Chorus",
    mandos: [
      { k: "velocidad", nombre: "Velocidad" },
      { k: "hondura", nombre: "Hondura" },
    ],
  },
  {
    id: "eco",
    nombre: "Eco",
    tipo: "Delay",
    mandos: [
      { k: "tiempo", nombre: "Tiempo" },
      { k: "repite", nombre: "Repite" },
      { k: "mezcla", nombre: "Mezcla" },
    ],
  },
];

/** Los mandos del amplificador, de izquierda a derecha */
export const MANDOS_AMPLI: MandoEquipo[] = [
  { k: "ganancia", nombre: "Ganancia" },
  { k: "graves", nombre: "Graves" },
  { k: "medios", nombre: "Medios" },
  { k: "agudos", nombre: "Agudos" },
  { k: "reverb", nombre: "Reverb" },
  { k: "volumen", nombre: "Volumen" },
];

export type AjustesPedal = { activo: boolean } & Record<string, number | boolean>;

export interface AjustesEquipo {
  /** La entrada de la interfaz por la que entra la guitarra: 0 (la 1) o 1 (la 2) */
  entrada: 0 | 1;
  ampli: Record<string, number>;
  pedales: Record<PedalId, AjustesPedal>;
}

export const EQUIPO_INICIAL: AjustesEquipo = {
  entrada: 0,
  ampli: { ganancia: 0.3, graves: 0.5, medios: 0.5, agudos: 0.55, reverb: 0.25, volumen: 0.5 },
  pedales: {
    sosten: { activo: false, cantidad: 0.5, nivel: 0.5 },
    brasa: { activo: false, ganancia: 0.45, tono: 0.5, nivel: 0.5 },
    trueno: { activo: false, ganancia: 0.6, tono: 0.5, nivel: 0.5 },
    marea: { activo: false, velocidad: 0.3, hondura: 0.5 },
    eco: { activo: false, tiempo: 0.4, repite: 0.35, mezcla: 0.35 },
  },
};

const CLAVE = "galileo:equipo:electrica:v1";

const entre01 = (v: unknown, serie: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : serie);

/** Lo guardado, completado con lo de serie (por si un día hay un mando o un pedal más). */
export function leerEquipo(): AjustesEquipo {
  const serie = structuredClone(EQUIPO_INICIAL);
  try {
    const g = JSON.parse(localStorage.getItem(CLAVE) ?? "null") as Partial<AjustesEquipo> | null;
    if (!g || typeof g !== "object") return serie;
    if (g.entrada === 1) serie.entrada = 1;
    for (const m of MANDOS_AMPLI) serie.ampli[m.k] = entre01(g.ampli?.[m.k], serie.ampli[m.k]);
    for (const p of PEDALES) {
      const guardado = g.pedales?.[p.id];
      if (!guardado || typeof guardado !== "object") continue;
      serie.pedales[p.id].activo = guardado.activo === true;
      for (const m of p.mandos) serie.pedales[p.id][m.k] = entre01(guardado[m.k], serie.pedales[p.id][m.k] as number);
    }
  } catch {
    /* nada guardado, o roto: lo de serie */
  }
  return serie;
}

export function guardarEquipo(a: AjustesEquipo) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(a));
  } catch {
    /* sin almacenamiento: vale para esta visita */
  }
}

/** Un mando (0–1) como se lee en el ampli: de 0 a 10, con un decimal si hace falta */
export const enDiez = (v: number) => (Math.round(v * 100) / 10).toLocaleString("es-ES", { maximumFractionDigits: 1 });
