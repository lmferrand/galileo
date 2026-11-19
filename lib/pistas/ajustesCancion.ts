// Lo que cada canción recuerda en este aparato: su mezcla (volumen y silencio de cada pista), la
// velocidad, el tono, las marcas de sus partes (intro, estrofa…) y su tempo para el click. Así, al
// volver a abrirla (o en el repertorio de un concierto), suena como la dejaste.

export interface Marca {
  /** Segundo de la canción */
  segundo: number;
  nombre: string;
}

/** El pulso de la canción (sacado de su batería, lib/pistas/pulso), para el click del directo */
export interface ClickCancion {
  /** Segundo de cada golpe, en orden */
  golpes: number[];
  /** Índice del primer golpe que es un 1 de compás */
  uno: number;
  /** Golpes por compás */
  compas: number;
  /** Tempo medio, para enseñarlo */
  bpm: number;
}

export interface AjustesCancion {
  volumen: number[];
  silencio: boolean[];
  velocidad: number;
  /** Semitonos (0 = tal cual) */
  tono: number;
  marcas: Marca[];
  click: ClickCancion | null;
}

export const NOMBRES_PARTES = ["Intro", "Estrofa", "Estribillo", "Puente", "Solo", "Final"];

const clave = (id: string) => `clavija:cancion:${id}`;

export function ajustesPorDefecto(n: number): AjustesCancion {
  return { volumen: Array.from({ length: n }, () => 1), silencio: Array.from({ length: n }, () => false), velocidad: 1, tono: 0, marcas: [], click: null };
}

export function leerAjustesCancion(id: string, n: number): AjustesCancion {
  const base = ajustesPorDefecto(n);
  try {
    const p = JSON.parse(localStorage.getItem(clave(id)) ?? "null") as Partial<AjustesCancion> | null;
    if (!p) return base;
    const numero = (v: unknown, min: number, max: number, def: number) => (typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, v)) : def);
    return {
      volumen: base.volumen.map((d, i) => numero(p.volumen?.[i], 0, 1.5, d)),
      silencio: base.silencio.map((d, i) => (typeof p.silencio?.[i] === "boolean" ? (p.silencio[i] as boolean) : d)),
      velocidad: numero(p.velocidad, 0.5, 1, 1),
      tono: Math.round(numero(p.tono, -6, 6, 0)),
      marcas: Array.isArray(p.marcas)
        ? p.marcas
            .filter((m): m is Marca => !!m && typeof m.segundo === "number" && typeof m.nombre === "string")
            .map((m) => ({ segundo: Math.max(0, m.segundo), nombre: m.nombre.slice(0, 24) }))
            .sort((a, b) => a.segundo - b.segundo)
        : [],
      click: leerClick(p.click),
    };
  } catch {
    return base;
  }
}

function leerClick(c: unknown): ClickCancion | null {
  if (!c || typeof c !== "object") return null;
  const p = c as Partial<ClickCancion>;
  if (!Array.isArray(p.golpes)) return null;
  const golpes = p.golpes.filter((g): g is number => typeof g === "number" && Number.isFinite(g) && g >= 0).slice(0, 8000);
  if (golpes.length < 2) return null;
  for (let i = 1; i < golpes.length; i++) if (golpes[i] <= golpes[i - 1]) return null;
  const compas = typeof p.compas === "number" ? Math.max(2, Math.min(7, Math.round(p.compas))) : 4;
  const uno = typeof p.uno === "number" ? ((Math.round(p.uno) % compas) + compas) % compas : 0;
  const medio = (golpes[golpes.length - 1] - golpes[0]) / (golpes.length - 1);
  const bpm = typeof p.bpm === "number" && Number.isFinite(p.bpm) ? p.bpm : Math.round(600 / medio) / 10;
  return { golpes, uno, compas, bpm };
}

export function guardarAjustesCancion(id: string, a: AjustesCancion) {
  try {
    localStorage.setItem(clave(id), JSON.stringify(a));
  } catch {
    /* sin almacenamiento: vale para esta vez */
  }
}

/** «Estrofa», «Estrofa 2»…: el nombre de una parte nueva sin repetir los que ya hay */
export function nombreNuevo(marcas: Marca[], nombre: string): string {
  const iguales = marcas.filter((m) => m.nombre === nombre || m.nombre.startsWith(`${nombre} `)).length;
  return iguales === 0 ? nombre : `${nombre} ${iguales + 1}`;
}
