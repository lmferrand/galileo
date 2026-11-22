// Los instrumentos que se ven al fondo del afinador (los que no tienes en las manos). Se tocan y
// cambian el instrumento que afinas (Afinador: la pala baja y sube la del que has tocado).
// También el amplificador que hay junto a la batería: con la eléctrica en las manos, tocarlo abre el
// ampli con su pedalera (components/EquipoElectrica).
// Cada foto del fondo (lib/instrumentos: `fondo` y `fondoHorizontal`) enseña el estudio sin el
// instrumento elegido y con los otros dos en sus soportes. Aquí va dónde cae cada uno en su foto
// (una elipse, en píxeles de la foto) y la cuenta de dónde queda en la pantalla, que repite la de
// los estilos del fondo (globals.css, «.fondo-estudio.vertical .fondo-ambiente»): la foto cubre la
// pantalla con 40 px de más por cada lado y se desplaza con el giroscopio (--gx, --gy).
// No son botones: el fondo queda detrás de toda la pantalla y lo que se toca se sabe por el sitio.

import type { InstrumentoId } from "./instrumentos";

/** Lo que se puede tocar en el fondo: uno de los otros instrumentos o el amplificador */
export type DelFondo = InstrumentoId | "ampli";

interface Zona {
  id: DelFondo;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}
interface FotoFondo {
  ancho: number;
  alto: number;
  /** Lo que el CSS pone en background-position, de arriba abajo (de 0 a 1) */
  y: number;
  zonas: Zona[];
}

/** Lo que sobresale la foto de la pantalla por cada lado (inset: -40px) */
const SOBRA = 40;
/** Lo mínimo que mide la zona desde su centro (px de pantalla): que el dedo acierte en el móvil */
const MINIMO = 26;

const ACUSTICA_V: Zona = { id: "acustica", cx: 158, cy: 918, rx: 74, ry: 182 };
const ELECTRICA_V: Zona = { id: "electrica", cx: 808, cy: 935, rx: 57, ry: 150 };
const ACUSTICA_H: Zona = { id: "acustica", cx: 215, cy: 650, rx: 98, ry: 272 };
const ELECTRICA_H: Zona = { id: "electrica", cx: 1378, cy: 660, rx: 86, ry: 235 };

/** Las fotos verticales (móvil, tableta de pie): según el instrumento que afinas */
const VERTICAL: Record<InstrumentoId, FotoFondo> = {
  acustica: { ancho: 941, alto: 1670, y: 0.58, zonas: [{ id: "bajo", cx: 730, cy: 905, rx: 48, ry: 160 }, ELECTRICA_V] },
  bajo: { ancho: 942, alto: 1670, y: 0.58, zonas: [ACUSTICA_V, ELECTRICA_V] },
  // (sin la eléctrica, el bajo está un poco más a la derecha)
  electrica: { ancho: 942, alto: 1670, y: 0.58, zonas: [ACUSTICA_V, { id: "bajo", cx: 790, cy: 925, rx: 52, ry: 160 }, { id: "ampli", cx: 710, cy: 893, rx: 60, ry: 56 }] },
};
/** Las horizontales (ordenador, tableta tumbada) */
const HORIZONTAL: Record<InstrumentoId, FotoFondo> = {
  acustica: { ancho: 1536, alto: 1024, y: 0.5, zonas: [{ id: "bajo", cx: 1243, cy: 615, rx: 64, ry: 240 }, ELECTRICA_H] },
  bajo: { ancho: 1536, alto: 1024, y: 0.5, zonas: [ACUSTICA_H, ELECTRICA_H] },
  electrica: { ancho: 1536, alto: 1024, y: 0.5, zonas: [ACUSTICA_H, { id: "bajo", cx: 1335, cy: 655, rx: 72, ry: 245 }, { id: "ampli", cx: 1206, cy: 592, rx: 96, ry: 78 }] },
};

/** La foto del fondo que toca con esa pantalla y dónde cae en ella: su escala y su esquina */
function encaje(afinando: InstrumentoId, pantalla: { w: number; h: number }) {
  // (la misma consulta que el CSS: «min-aspect-ratio: 1/1» pone la foto horizontal)
  const foto = (pantalla.w >= pantalla.h ? HORIZONTAL : VERTICAL)[afinando];
  const cajaW = pantalla.w + 2 * SOBRA;
  const cajaH = pantalla.h + 2 * SOBRA;
  const k = Math.max(cajaW / foto.ancho, cajaH / foto.alto);
  return { foto, k, x0: -SOBRA + (cajaW - foto.ancho * k) * 0.5, y0: -SOBRA + (cajaH - foto.alto * k) * foto.y };
}

/**
 * Dónde queda en la pantalla (sin contar el giroscopio) una de las cosas del fondo: el rectángulo de
 * dentro de su zona. Para ponerle encima un botón de verdad: en el móvil el ampli queda pegado a una
 * clavija de la pala y, sin botón propio, el navegador le daba el toque a la clavija (el botón más
 * cercano al dedo). null: en esa foto no está.
 */
export function sitioDelFondo(afinando: InstrumentoId, id: DelFondo, pantalla: { w: number; h: number }): { x: number; y: number; w: number; h: number } | null {
  if (!(pantalla.w > 0 && pantalla.h > 0)) return null;
  const { foto, k, x0, y0 } = encaje(afinando, pantalla);
  const z = foto.zonas.find((x) => x.id === id);
  if (!z) return null;
  const rx = Math.max(z.rx * k, MINIMO) * 0.82;
  const ry = Math.max(z.ry * k, MINIMO) * 0.82;
  return { x: x0 + z.cx * k - rx, y: y0 + z.cy * k - ry, w: 2 * rx, h: 2 * ry };
}

/**
 * Lo que hay en ese punto de la pantalla: un instrumento del fondo, el amplificador o nada (null).
 * `pantalla`: lo que mide el fondo (la pantalla entera). `movida`: lo que el giroscopio tiene
 * desplazada la foto en ese momento. Si el punto cae en dos (el bajo y la eléctrica están juntos
 * cuando afinas la acústica), gana el que tenga el centro más cerca.
 */
export function instrumentoDelFondo(
  afinando: InstrumentoId,
  punto: { x: number; y: number },
  pantalla: { w: number; h: number },
  movida: { x: number; y: number } = { x: 0, y: 0 },
): DelFondo | null {
  if (!(pantalla.w > 0 && pantalla.h > 0)) return null;
  const { foto, k, x0: sinMoverX, y0: sinMoverY } = encaje(afinando, pantalla);
  const x0 = sinMoverX + movida.x;
  const y0 = sinMoverY + movida.y;
  let mejor: DelFondo | null = null;
  let distancia = 1;
  for (const z of foto.zonas) {
    const rx = Math.max(z.rx * k, MINIMO);
    const ry = Math.max(z.ry * k, MINIMO);
    const d = ((punto.x - (x0 + z.cx * k)) / rx) ** 2 + ((punto.y - (y0 + z.cy * k)) / ry) ** 2;
    if (d <= distancia) {
      mejor = z.id;
      distancia = d;
    }
  }
  return mejor;
}
