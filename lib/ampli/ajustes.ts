// Los equipos de las guitarras: cada una tiene su amplificador y su pedalera de cinco pedales.
// Diseños y nombres propios (ninguna marca). Aquí van sus mandos, cómo vienen de serie y dónde se
// recuerdan (en este aparato, cada equipo por su lado). El sonido lo hace lib/ampli/cadena y lo
// enciende lib/ampli/ampli.
//  - Eléctrica: cuatro amplis de válvulas a elegir (Clásico, Cristal, Corona y Volcán: del limpio
//    al de mucha ganancia; todos con reverb de muelles) y Sostén, Brasa, Trueno, Marea y Eco.
//  - Acústica: un ampli limpio de toda la gama (reverb de sala) y Sostén, Madera, Marea, Latido y Eco.
// Todos los mandos van de 0 a 1 (en pantalla, de 0 a 10, como en un ampli de verdad).

export type EquipoId = "electrica" | "acustica";
export type PedalId = "sosten" | "brasa" | "trueno" | "marea" | "eco" | "madera" | "latido";

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
  /** Cómo vienen de serie sus mandos (apagado) */
  serie: Record<string, number>;
}

const SOSTEN: Pedal = {
  id: "sosten",
  nombre: "Sostén",
  tipo: "Compresor",
  mandos: [
    { k: "cantidad", nombre: "Sostén" },
    { k: "nivel", nombre: "Nivel" },
  ],
  serie: { cantidad: 0.5, nivel: 0.5 },
};
const BRASA: Pedal = {
  id: "brasa",
  nombre: "Brasa",
  tipo: "Saturación",
  mandos: [
    { k: "ganancia", nombre: "Ganancia" },
    { k: "tono", nombre: "Tono" },
    { k: "nivel", nombre: "Nivel" },
  ],
  serie: { ganancia: 0.45, tono: 0.5, nivel: 0.5 },
};
const TRUENO: Pedal = {
  id: "trueno",
  nombre: "Trueno",
  tipo: "Distorsión",
  mandos: [
    { k: "ganancia", nombre: "Ganancia" },
    { k: "tono", nombre: "Tono" },
    { k: "nivel", nombre: "Nivel" },
  ],
  serie: { ganancia: 0.6, tono: 0.5, nivel: 0.5 },
};
const MAREA: Pedal = {
  id: "marea",
  nombre: "Marea",
  tipo: "Chorus",
  mandos: [
    { k: "velocidad", nombre: "Velocidad" },
    { k: "hondura", nombre: "Hondura" },
  ],
  serie: { velocidad: 0.3, hondura: 0.5 },
};
const ECO: Pedal = {
  id: "eco",
  nombre: "Eco",
  tipo: "Delay",
  mandos: [
    { k: "tiempo", nombre: "Tiempo" },
    { k: "repite", nombre: "Repite" },
    { k: "mezcla", nombre: "Mezcla" },
  ],
  serie: { tiempo: 0.4, repite: 0.35, mezcla: 0.35 },
};
const MADERA: Pedal = {
  id: "madera",
  nombre: "Madera",
  tipo: "Realce",
  mandos: [
    { k: "cuerpo", nombre: "Cuerpo" },
    { k: "brillo", nombre: "Brillo" },
  ],
  serie: { cuerpo: 0.5, brillo: 0.5 },
};
const LATIDO: Pedal = {
  id: "latido",
  nombre: "Latido",
  tipo: "Trémolo",
  mandos: [
    { k: "velocidad", nombre: "Velocidad" },
    { k: "hondura", nombre: "Hondura" },
  ],
  serie: { velocidad: 0.45, hondura: 0.6 },
};

/** Los mandos de los amplificadores, de izquierda a derecha (los dos tienen los mismos) */
export const MANDOS_AMPLI: MandoEquipo[] = [
  { k: "ganancia", nombre: "Ganancia" },
  { k: "graves", nombre: "Graves" },
  { k: "medios", nombre: "Medios" },
  { k: "agudos", nombre: "Agudos" },
  { k: "reverb", nombre: "Reverb" },
  { k: "volumen", nombre: "Volumen" },
];

/** Un amplificador que se puede elegir: su sonido está en lib/ampli/cadena (VOCES) y su dibujo en equipo.css (.amp-<id>) */
export interface ModeloAmpli {
  id: string;
  /** Su nombre, en la placa */
  nombre: string;
  /** Cómo suena, en una línea */
  caracter: string;
}

export interface Equipo {
  id: EquipoId;
  /** «de la eléctrica», «de la acústica» */
  de: string;
  /** Los pedales, en el orden en que pasa el sonido: de la guitarra al ampli */
  pedales: Pedal[];
  /** Cómo vienen de serie los mandos del ampli */
  ampli: Record<string, number>;
  /** Los amplis entre los que se elige (el primero, el de serie). Los mandos son los mismos al cambiar de uno a otro */
  amplis: ModeloAmpli[];
}

export const EQUIPOS: Record<EquipoId, Equipo> = {
  electrica: {
    id: "electrica",
    de: "de la eléctrica",
    pedales: [SOSTEN, BRASA, TRUENO, MAREA, ECO],
    ampli: { ganancia: 0.3, graves: 0.5, medios: 0.5, agudos: 0.55, reverb: 0.25, volumen: 0.5 },
    amplis: [
      { id: "clasico", nombre: "Clásico", caracter: "Cálido: limpio con poca ganancia y rasga al subirla." },
      { id: "cristal", nombre: "Cristal", caracter: "Limpio y brillante, de los que casi no saturan." },
      { id: "corona", nombre: "Corona", caracter: "Los medios por delante: el crujido del rock de siempre." },
      { id: "volcan", nombre: "Volcán", caracter: "Mucha ganancia y graves prietos, para solos y rock duro." },
    ],
  },
  acustica: {
    id: "acustica",
    de: "de la acústica",
    pedales: [SOSTEN, MADERA, MAREA, LATIDO, ECO],
    ampli: { ganancia: 0.3, graves: 0.5, medios: 0.5, agudos: 0.5, reverb: 0.3, volumen: 0.5 },
    amplis: [{ id: "acustico", nombre: "Acústico", caracter: "Limpio y de toda la gama: no colorea." }],
  },
};

export type AjustesPedal = { activo: boolean } & Record<string, number | boolean>;

export interface AjustesEquipo {
  /** La entrada de la interfaz por la que entra la guitarra: 0 (la 1) o 1 (la 2) */
  entrada: 0 | 1;
  /** El ampli elegido (el id de uno de los de su equipo) */
  modelo: string;
  ampli: Record<string, number>;
  /** Por el id de cada pedal del equipo */
  pedales: Record<string, AjustesPedal>;
}

/** Un equipo como viene de serie: todos los pedales sin pisar */
export function equipoDeSerie(id: EquipoId): AjustesEquipo {
  const e = EQUIPOS[id];
  return {
    entrada: 0,
    modelo: e.amplis[0].id,
    ampli: { ...e.ampli },
    pedales: Object.fromEntries(e.pedales.map((p) => [p.id, { activo: false, ...p.serie }])),
  };
}

const clave = (id: EquipoId) => `galileo:equipo:${id}:v1`;

const entre01 = (v: unknown, serie: number) => (typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : serie);

/** Lo guardado de un equipo, completado con lo de serie (por si un día hay un mando o un pedal más). */
export function leerEquipo(id: EquipoId): AjustesEquipo {
  const serie = equipoDeSerie(id);
  try {
    const g = JSON.parse(localStorage.getItem(clave(id)) ?? "null") as Partial<AjustesEquipo> | null;
    if (!g || typeof g !== "object") return serie;
    if (g.entrada === 1) serie.entrada = 1;
    if (EQUIPOS[id].amplis.some((m) => m.id === g.modelo)) serie.modelo = g.modelo as string;
    for (const m of MANDOS_AMPLI) serie.ampli[m.k] = entre01(g.ampli?.[m.k], serie.ampli[m.k]);
    for (const p of EQUIPOS[id].pedales) {
      const guardado = g.pedales?.[p.id];
      if (!guardado || typeof guardado !== "object") continue;
      serie.pedales[p.id].activo = guardado.activo === true;
      for (const m of p.mandos) serie.pedales[p.id][m.k] = entre01(guardado[m.k], p.serie[m.k]);
    }
  } catch {
    /* nada guardado, o roto: lo de serie */
  }
  return serie;
}

export function guardarEquipo(id: EquipoId, a: AjustesEquipo) {
  try {
    localStorage.setItem(clave(id), JSON.stringify(a));
  } catch {
    /* sin almacenamiento: vale para esta visita */
  }
}

/** Un mando (0–1) como se lee en el ampli: de 0 a 10, con un decimal si hace falta */
export const enDiez = (v: number) => (Math.round(v * 100) / 10).toLocaleString("es-ES", { maximumFractionDigits: 1 });
