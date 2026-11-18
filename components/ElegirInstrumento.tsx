"use client";

// Al abrir la app: el estudio entero y «¿Qué vas a afinar?». Tocas un
// instrumento, la vista se acerca a él y se funde con el afinador, donde su
// clavijero sube a primer plano (lo hace Afinador). Las medidas van en píxeles
// de cada foto (vertical para el móvil, horizontal para PC e iPad tumbado). La foto
// se ve entera (con margen a los lados) y lo que sobra arriba y abajo es la misma
// sala desenfocada. Sin etiquetas: se toca el instrumento.

import { useEffect, useState, type CSSProperties } from "react";
import type { InstrumentoId } from "@/lib/instrumentos";
import { useHorizontal } from "@/lib/horizontal";

interface Opcion {
  id: InstrumentoId;
  nombre: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** Todavía sin pala. */
  pronto?: boolean;
}

interface Foto {
  src: string;
  /** La misma, desenfocada, para rellenar lo que no ocupa la foto. */
  fondo: string;
  ancho: number;
  alto: number;
  zoom: number;
  opciones: Opcion[];
}

const VERTICAL: Foto = {
  src: "/estudio/pistas-1.webp",
  fondo: "/estudio/pistas-fondo-1.webp",
  ancho: 941,
  alto: 1671,
  zoom: 2.4,
  opciones: [
    { id: "acustica", nombre: "Acústica", cx: 158, cy: 918, rx: 74, ry: 182 },
    { id: "bajo", nombre: "Bajo", cx: 728, cy: 903, rx: 50, ry: 164 },
    { id: "electrica", nombre: "Eléctrica", cx: 808, cy: 935, rx: 58, ry: 150 },
  ],
};

const HORIZONTAL: Foto = {
  src: "/estudio/completo-h1.webp",
  fondo: "/estudio/completo-h-fondo-1.webp",
  ancho: 1536,
  alto: 1024,
  zoom: 2.1,
  opciones: [
    { id: "acustica", nombre: "Acústica", cx: 215, cy: 650, rx: 98, ry: 272 },
    { id: "bajo", nombre: "Bajo", cx: 1243, cy: 615, rx: 64, ry: 240 },
    { id: "electrica", nombre: "Eléctrica", cx: 1378, cy: 660, rx: 86, ry: 235 },
  ],
};

interface Props {
  /** La que se ha tocado: se acerca a ella mientras la pantalla se va. */
  saliendo: InstrumentoId | null;
  /** Al volver desde el afinador: empieza cerca de ese instrumento y se aleja hasta el estudio entero. */
  volviendoDe?: InstrumentoId | null;
  onElegir: (id: InstrumentoId) => void;
}

export default function ElegirInstrumento({ saliendo, volviendoDe = null, onElegir }: Props) {
  // Hasta saber si la pantalla es apaisada no se pinta ninguna foto (así no se descarga la que no toca).
  const horizontal = useHorizontal();
  const foto = horizontal ? HORIZONTAL : VERTICAL;
  const { ancho: ANCHO, alto: ALTO, zoom: ZOOM } = foto;
  // Volviendo: el primer fotograma ya está cerca del instrumento y en el siguiente se aleja (con la transición).
  const [acercada, setAcercada] = useState(volviendoDe !== null);
  useEffect(() => {
    if (!acercada) return;
    let segundo = 0;
    const primero = requestAnimationFrame(() => {
      segundo = requestAnimationFrame(() => setAcercada(false));
    });
    return () => {
      cancelAnimationFrame(primero);
      cancelAnimationFrame(segundo);
    };
  }, [acercada]);
  const destino = saliendo ?? (acercada ? volviendoDe : null);
  const elegida = foto.opciones.find((o) => o.id === destino);

  return (
    <div
      className={`elegir ${saliendo ? "saliendo" : ""} ${volviendoDe ? "llegando" : ""}`}
      style={horizontal !== null ? ({ "--fondo-elegir": `url("${foto.fondo}")` } as CSSProperties) : undefined} role="dialog" aria-modal="true" aria-labelledby="elegir-titulo">
      {horizontal !== null && (
        <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} preserveAspectRatio="xMidYMid meet" className="elegir-svg">
          <defs>
            {/* Los bordes de la foto se funden con la sala desenfocada de detrás */}
          <linearGradient id="elegir-borde-v" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#000" />
            <stop offset="0.06" stopColor="#fff" />
            <stop offset="0.94" stopColor="#fff" />
            <stop offset="1" stopColor="#000" />
          </linearGradient>
          <linearGradient id="elegir-borde-h" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#000" />
            <stop offset="0.04" stopColor="#fff" />
            <stop offset="0.96" stopColor="#fff" />
            <stop offset="1" stopColor="#000" />
          </linearGradient>
          <mask id="elegir-mascara-v" maskUnits="userSpaceOnUse" x="0" y="0" width={ANCHO} height={ALTO}>
            <rect width={ANCHO} height={ALTO} fill="url(#elegir-borde-v)" />
          </mask>
          <mask id="elegir-mascara-h" maskUnits="userSpaceOnUse" x="0" y="0" width={ANCHO} height={ALTO}>
            <rect width={ANCHO} height={ALTO} fill="url(#elegir-borde-h)" />
          </mask>
          <radialGradient id="elegir-halo">
              <stop offset="0%" stopColor="#ffe2ad" stopOpacity="0.32" />
              <stop offset="100%" stopColor="#ffe2ad" stopOpacity="0" />
            </radialGradient>
          </defs>
          {/* Al tocar uno, la vista se acerca y lo lleva al centro (el centro de la foto es el de la pantalla) */}
          <g
            className="elegir-foto"
            style={
              elegida
                ? { transform: `translate(${ANCHO / 2 - ZOOM * elegida.cx}px, ${ALTO / 2 - ZOOM * elegida.cy}px) scale(${ZOOM})` }
                : undefined
            }
          >
            <g mask="url(#elegir-mascara-h)">
            <image href={foto.src} width={ANCHO} height={ALTO} mask="url(#elegir-mascara-v)" />
          </g>
            {foto.opciones.map((o) => (
              <g key={o.id} className={`elegir-opcion ${o.pronto ? "pronto" : ""}`}>
                {!o.pronto && <ellipse cx={o.cx} cy={o.cy} rx={o.rx * 1.5} ry={o.ry * 1.15} fill="url(#elegir-halo)" className="elegir-halo" />}
                <ellipse
                  cx={o.cx}
                  cy={o.cy}
                  rx={o.rx}
                  ry={o.ry}
                  className="elegir-toque"
                  role="button"
                  tabIndex={o.pronto ? -1 : 0}
                  aria-disabled={o.pronto || undefined}
                  aria-label={o.pronto ? `${o.nombre}: muy pronto` : `Afinar ${o.id === "bajo" ? "el bajo" : o.id === "electrica" ? "la guitarra eléctrica" : "la guitarra acústica"}`}
                  onClick={() => !o.pronto && !saliendo && onElegir(o.id)}
                  onKeyDown={(e) => {
                    if ((e.key === "Enter" || e.key === " ") && !o.pronto && !saliendo) {
                      e.preventDefault();
                      onElegir(o.id);
                    }
                  }}
                />
              </g>
          ))}
        </g>
      </svg>
      )}

      <div className="elegir-texto">
        <h1 id="elegir-titulo">¿Qué vas a afinar?</h1>
        <p>Toca el instrumento.</p>
      </div>
    </div>
  );
}
