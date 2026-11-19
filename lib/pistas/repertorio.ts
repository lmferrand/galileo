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

export function nuevoRepertorio(nombre: string): Repertorio {
  return { id: `r${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, nombre, canciones: [] };
}
