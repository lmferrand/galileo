// Cola de subidas a la nube, fuera de las pantallas: sigue aunque abras el
// reproductor o cambies al afinador. De una en una, para no saturar.

import { subirCancion } from "./subir";
import type { Cancion } from "@/lib/pistas/tipos";

export interface EstadoSubida {
  /** id → fracción hecha (0–1) de las que están en marcha o esperando */
  enCurso: Record<string, number>;
  /** id → mensaje de error de la última vez */
  fallos: Record<string, string>;
  /** se incrementa al terminar cada subida (para recargar listas) */
  terminadas: number;
}

let estado: EstadoSubida = { enCurso: {}, fallos: {}, terminadas: 0 };
const oyentes = new Set<(e: EstadoSubida) => void>();
const pendientes: Cancion[] = [];
let trabajando = false;

function publicar(cambio: Partial<EstadoSubida>) {
  estado = { ...estado, ...cambio };
  oyentes.forEach((f) => f(estado));
}

export function suscribirSubidas(f: (e: EstadoSubida) => void): () => void {
  oyentes.add(f);
  f(estado);
  return () => {
    oyentes.delete(f);
  };
}

export function encolarSubida(c: Cancion) {
  if (c.id in estado.enCurso) return;
  const { [c.id]: _quitado, ...fallos } = estado.fallos;
  void _quitado;
  publicar({ enCurso: { ...estado.enCurso, [c.id]: 0 }, fallos });
  pendientes.push(c);
  void siguiente();
}

async function siguiente() {
  if (trabajando) return;
  const c = pendientes.shift();
  if (!c) return;
  trabajando = true;
  try {
    await subirCancion(c, (f) => publicar({ enCurso: { ...estado.enCurso, [c.id]: f } }));
    const { [c.id]: _hecha, ...resto } = estado.enCurso;
    void _hecha;
    publicar({ enCurso: resto, terminadas: estado.terminadas + 1 });
  } catch (e) {
    const { [c.id]: _fallida, ...resto } = estado.enCurso;
    void _fallida;
    publicar({ enCurso: resto, fallos: { ...estado.fallos, [c.id]: (e as Error).message || "No se ha podido subir." } });
  } finally {
    trabajando = false;
    void siguiente();
  }
}
