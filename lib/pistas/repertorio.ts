// Los repertorios para tocar en directo: una lista de canciones (del aparato) en orden, con su
// nombre. Se guardan en este aparato. Cada canción suena como la dejaste (ajustesCancion).

export interface Repertorio {
  id: string;
  nombre: string;
  /** ids de las canciones, en el orden del concierto */
  canciones: string[];
}

const CLAVE = "clavija:repertorios";

export function leerRepertorios(): Repertorio[] {
  try {
    const p = JSON.parse(localStorage.getItem(CLAVE) ?? "[]");
    if (!Array.isArray(p)) return [];
    return p
      .filter((r): r is Repertorio => !!r && typeof r.id === "string" && typeof r.nombre === "string" && Array.isArray(r.canciones))
      .map((r) => ({ id: r.id, nombre: r.nombre.slice(0, 60), canciones: r.canciones.filter((c) => typeof c === "string") }));
  } catch {
    return [];
  }
}

export function guardarRepertorios(rs: Repertorio[]) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(rs));
  } catch {
    /* sin almacenamiento */
  }
}

/** El click en el directo: por dónde sale, su volumen y si hay cuenta de entrada. */
export interface AjustesDirecto {
  ruta: "no" | "juntos" | "cascos";
  volumen: number;
  cuenta: boolean;
}

const CLAVE_DIRECTO = "clavija:directo";

export function leerAjustesDirecto(): AjustesDirecto {
  const base: AjustesDirecto = { ruta: "no", volumen: 0.8, cuenta: true };
  try {
    const p = JSON.parse(localStorage.getItem(CLAVE_DIRECTO) ?? "null") as Partial<AjustesDirecto> | null;
    if (!p) return base;
    return {
      ruta: p.ruta === "juntos" || p.ruta === "cascos" ? p.ruta : "no",
      volumen: typeof p.volumen === "number" && Number.isFinite(p.volumen) ? Math.max(0, Math.min(1.5, p.volumen)) : base.volumen,
      cuenta: typeof p.cuenta === "boolean" ? p.cuenta : base.cuenta,
    };
  } catch {
    return base;
  }
}

export function guardarAjustesDirecto(a: AjustesDirecto) {
  try {
    localStorage.setItem(CLAVE_DIRECTO, JSON.stringify(a));
  } catch {
    /* sin almacenamiento */
  }
}

export function nuevoRepertorio(nombre: string): Repertorio {
  return { id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, nombre, canciones: [] };
}
