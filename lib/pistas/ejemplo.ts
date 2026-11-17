// Canción de ejemplo ya separada (en el PC, con el mismo modelo), para ver
// cómo quedan las pistas sin tener que descargar el separador en el móvil.
// «Time Poor», de The Basics, licencia CC BY 3.0, de Wikimedia Commons:
// https://commons.wikimedia.org/wiki/File:The_Basics_-_Time_Poor.opus

import { listarCanciones } from "./almacen";
import { importarPistas } from "./importar";
import { PISTAS, type Cancion, type Pista } from "./tipos";

const BASE = "/ejemplo/time-poor/";
export const ID_EJEMPLO = "ejemplo-time-poor";
export const PESO_EJEMPLO = "11 MB";

const CREDITO =
  "«Time Poor», de The Basics. Licencia CC BY 3.0 (Wikimedia Commons). Separada en pistas por Clavija.";

export async function cargarEjemplo(alProgreso: (fraccion: number) => void): Promise<Cancion> {
  const ya = (await listarCanciones()).find((c) => c.id === ID_EJEMPLO);
  if (ya) return ya;
  const urls = Object.fromEntries(PISTAS.map((p) => [p.id, `${BASE}${p.id}.mp3`])) as Record<Pista, string>;
  return importarPistas(urls, { id: ID_EJEMPLO, nombre: "Time Poor (ejemplo)", creada: Date.now(), credito: CREDITO }, alProgreso);
}
