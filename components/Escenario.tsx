"use client";

// El estudio detrás del reproductor: cada pista tiene un foco sobre su
// instrumento (la voz, el micrófono; la guitarra, las dos guitarras) y el
// «resto» es la luz de la sala. Al quitar una pista su instrumento se queda a
// oscuras, y la luz baja con el volumen. Tocar un instrumento lo quita o lo
// vuelve a poner. Las medidas van en píxeles de cada foto: la vertical (móvil),
// que el SVG recorta como `cover`, y la horizontal (PC e iPad tumbado), que se
// ve entera con los mandos al lado. Así los focos caen siempre en su sitio.

import { useEffect, useRef } from "react";
import { PISTAS, type Pista } from "@/lib/pistas/tipos";

interface Foco {
  pista: Pista;
  que: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

interface Foto {
  src: string;
  ancho: number;
  alto: number;
  /** Fila donde acaban los instrumentos: en vertical, ahí empiezan los mandos. */
  pie: number;
  /** De dónde bajan los haces de luz. */
  techo: number;
  // En orden de atrás adelante (el piano queda detrás del micrófono).
  focos: Foco[];
}

const VERTICAL: Foto = {
  src: "/estudio/pistas-3.webp",
  ancho: 941,
  alto: 1671,
  pie: 1090,
  techo: 300,
  focos: [
    { pista: "piano", que: "el piano", cx: 300, cy: 842, rx: 124, ry: 84 },
    { pista: "guitarra", que: "la guitarra acústica", cx: 158, cy: 918, rx: 70, ry: 178 },
    { pista: "bateria", que: "la batería", cx: 516, cy: 930, rx: 186, ry: 152 },
    { pista: "voz", que: "el micrófono", cx: 305, cy: 868, rx: 36, ry: 236 },
    { pista: "bajo", que: "el bajo", cx: 728, cy: 903, rx: 48, ry: 160 },
    { pista: "guitarra", que: "la guitarra eléctrica", cx: 806, cy: 935, rx: 58, ry: 146 },
  ],
};

const HORIZONTAL: Foto = {
  src: "/estudio/completo-h3.webp",
  ancho: 1536,
  alto: 1024,
  pie: 960,
  techo: 40,
  focos: [
    { pista: "piano", que: "el piano", cx: 505, cy: 535, rx: 190, ry: 112 },
    { pista: "guitarra", que: "la guitarra acústica", cx: 215, cy: 650, rx: 98, ry: 272 },
    { pista: "bateria", que: "la batería", cx: 855, cy: 680, rx: 300, ry: 232 },
    { pista: "voz", que: "el micrófono", cx: 474, cy: 600, rx: 44, ry: 338 },
    { pista: "bajo", que: "el bajo", cx: 1243, cy: 615, rx: 64, ry: 240 },
    { pista: "guitarra", que: "la guitarra eléctrica", cx: 1378, cy: 660, rx: 86, ry: 235 },
  ],
};

interface Props {
  /** Luz de cada pista (0 apagada … 1), en el orden de PISTAS. */
  luces: number[];
  onTocar: (pista: Pista) => void;
  /** Dónde acaban los instrumentos en la pantalla (px desde arriba del escenario), en vertical. */
  onMedir?: (pie: number) => void;
  /** PC e iPad tumbado: foto horizontal entera, pegada abajo, con los mandos al lado. */
  horizontal?: boolean;
}

export default function Escenario({ luces, onTocar, onMedir, horizontal }: Props) {
  const caja = useRef<HTMLDivElement>(null);
  const foto = horizontal ? HORIZONTAL : VERTICAL;
  const { ancho: ANCHO, alto: ALTO } = foto;
  const FOCOS = foto.focos;
  const luz = (p: Pista) => luces[PISTAS.findIndex((x) => x.id === p)] ?? 0;
  const sala = luz("resto");

  // La foto se recorta como `cover`: dónde cae el pie del escenario depende del tamaño de la pantalla.
  useEffect(() => {
    const el = caja.current;
    if (!el || !onMedir || horizontal) return;
    const medir = () => {
      const { width: w, height: h } = el.getBoundingClientRect();
      const escala = Math.max(w / VERTICAL.ancho, h / VERTICAL.alto);
      onMedir((h - VERTICAL.alto * escala) / 2 + VERTICAL.pie * escala);
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [onMedir, horizontal]);

  return (
    <div ref={caja} className={`escenario-estudio ${horizontal ? "horizontal" : ""}`}>
      <svg viewBox={`0 0 ${ANCHO} ${ALTO}`} preserveAspectRatio={horizontal ? "xMidYMax meet" : "xMidYMid slice"} className="escenario-svg">
        <defs>
          <radialGradient id="foco-suave">
            <stop offset="0%" stopColor="#fff" />
            <stop offset="58%" stopColor="#fff" />
            <stop offset="100%" stopColor="#000" />
          </radialGradient>
          <radialGradient id="foco-calido">
            <stop offset="0%" stopColor="#ffd9a0" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#ffd9a0" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="foco-haz" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#ffe2b0" stopOpacity="0" />
            <stop offset="100%" stopColor="#ffe2b0" stopOpacity="0.2" />
          </linearGradient>
          {FOCOS.map((f, i) => (
            <mask key={i} id={`foco-${i}`} maskUnits="userSpaceOnUse" x="0" y="0" width={ANCHO} height={ALTO}>
              <ellipse cx={f.cx} cy={f.cy} rx={f.rx * 1.3} ry={f.ry * 1.14} fill="url(#foco-suave)" />
            </mask>
          ))}
        </defs>

        {/* La sala: más oscura si el «resto» está quitado */}
        <image href={foto.src} width={ANCHO} height={ALTO} />
        <rect width={ANCHO} height={ALTO} className="escenario-sala" style={{ opacity: 0.64 + 0.2 * (1 - sala) }} />

        {FOCOS.map((f, i) => (
          <g key={i} className="escenario-foco" style={{ opacity: luz(f.pista) }}>
            <polygon
              points={`${f.cx - 10},${foto.techo} ${f.cx + 10},${foto.techo} ${f.cx + f.rx * 0.95},${f.cy} ${f.cx - f.rx * 0.95},${f.cy}`}
              fill="url(#foco-haz)"
              className="escenario-luz"
            />
            <image href={foto.src} width={ANCHO} height={ALTO} mask={`url(#foco-${i})`} />
            <ellipse cx={f.cx} cy={f.cy} rx={f.rx * 1.1} ry={f.ry} fill="url(#foco-calido)" className="escenario-luz" />
            <ellipse
              cx={f.cx}
              cy={f.cy + f.ry * 0.94}
              rx={f.rx * 1.45}
              ry={Math.max(16, f.ry * 0.13)}
              fill="url(#foco-calido)"
              className="escenario-luz"
            />
          </g>
        ))}

        {/* PC e iPad: la foto va pegada abajo; su borde de arriba se funde con la sala oscura
            (antes ahí asomaba otra copia desenfocada de la foto y se veía repetida y cortada) */}
        {horizontal && (
          <>
            <defs>
              <linearGradient id="funde-arriba" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#120a06" stopOpacity="1" />
                <stop offset="100%" stopColor="#120a06" stopOpacity="0" />
              </linearGradient>
            </defs>
            <rect width={ANCHO} height={ALTO * 0.3} fill="url(#funde-arriba)" pointerEvents="none" />
          </>
        )}

        {/* Tocar un instrumento lo quita o lo vuelve a poner */}
        {FOCOS.map((f, i) => {
          const nombre = PISTAS.find((p) => p.id === f.pista)?.nombre.toLowerCase() ?? f.pista;
          const suena = luz(f.pista) > 0;
          return (
            <ellipse
              key={`t${i}`}
              cx={f.cx}
              cy={f.cy}
              rx={f.rx}
              ry={f.ry}
              className="escenario-toque"
              role="button"
              tabIndex={0}
              aria-label={`${suena ? "Quitar" : "Volver a oír"} ${nombre} (${f.que})`}
              onClick={() => onTocar(f.pista)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onTocar(f.pista);
                }
              }}
            />
          );
        })}
      </svg>
    </div>
  );
}
