// Los grupos del selector de pistas: artistas, álbumes, proyectos, el estudio… los que el usuario
// quiera. Cada canción guarda el suyo (Cancion.grupo). Si no tiene, va a uno automático: el artista
// si el nombre es «Artista - Título» o el crédito dice «…, de Artista.», «Para tocar» si es de esa
// lista y, si no, «Mis canciones». Los grupos vacíos y el orden se guardan en este aparato.

import type { Cancion } from "./tipos";

export const SIN_GRUPO = "Mis canciones";
export const PARA_TOCAR = "Para tocar";
const CLAVE = "clavija:grupos";

export interface Grupo {
  nombre: string;
  canciones: Cancion[];
}

/** El grupo en que se ve una canción. */
export function grupoDe(c: Cancion): string {
  const propio = c.grupo?.trim();
  if (propio) return propio;
  const guion = c.nombre.match(/^(.{2,40}?)\s+[-–—]\s+\S/);
  if (guion) return guion[1].trim();
  if (c.id.startsWith("tocar-")) return PARA_TOCAR;
  const credito = c.credito?.match(/,\s*de\s+([^.]{2,40})\./);
  if (credito) return credito[1].trim();
  return SIN_GRUPO;
}

/** El título sin el artista delante («Artista - Título» → «Título») cuando ya se ve en su grupo. */
export function tituloEn(c: Cancion, grupo: string): string {
  const m = c.nombre.match(/^(.{2,40}?)\s+[-–—]\s+(.+)$/);
  return m && m[1].trim() === grupo ? m[2].trim() : c.nombre;
}

export function leerGrupos(): string[] {
  try {
    const p = JSON.parse(localStorage.getItem(CLAVE) ?? "[]");
    return Array.isArray(p) ? p.filter((g): g is string => typeof g === "string" && g.trim().length > 0).map((g) => g.trim().slice(0, 40)) : [];
  } catch {
    return [];
  }
}

export function guardarGrupos(gs: string[]) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify([...new Set(gs)]));
  } catch {
    /* sin almacenamiento */
  }
}

/** Los grupos con sus canciones: primero los guardados (en su orden, aunque estén vacíos), luego
 *  los demás por nombre y «Mis canciones» al final. */
export function agrupar(canciones: Cancion[], guardados: string[]): Grupo[] {
  const por = new Map<string, Cancion[]>();
  for (const g of guardados) por.set(g, []);
  for (const c of canciones) {
    const g = grupoDe(c);
    if (!por.has(g)) por.set(g, []);
    por.get(g)!.push(c);
  }
  const resto = [...por.keys()].filter((g) => !guardados.includes(g) && g !== SIN_GRUPO).sort((a, b) => a.localeCompare(b, "es"));
  const orden = [...guardados.filter((g) => g !== SIN_GRUPO), ...resto, ...(por.has(SIN_GRUPO) ? [SIN_GRUPO] : [])];
  return orden.map((nombre) => ({ nombre, canciones: (por.get(nombre) ?? []).slice().sort((a, b) => a.nombre.localeCompare(b.nombre, "es")) }));
}
