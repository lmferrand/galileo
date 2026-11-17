"use client";

// La boca de la guitarra hace de medidor: el mosaico de la roseta se enciende
// desde arriba (afinado) hacia el lado al que se va la nota. Arco superior =
// de −50 a +50 cents. Cuando la cuerda está afinada, la roseta brilla como el nácar.

import { useMemo, type CSSProperties, type ReactNode } from "react";

const C = 200;
const TESELAS = 72; // 5° cada una
const GRADOS_POR_CENT = 1.8; // ±50 cents = ±90°

function punto(r: number, grados: number) {
  const a = (grados * Math.PI) / 180;
  return [C + r * Math.sin(a), C - r * Math.cos(a)] as const;
}

function sector(r1: number, r2: number, desde: number, hasta: number) {
  const [x1, y1] = punto(r2, desde);
  const [x2, y2] = punto(r2, hasta);
  const [x3, y3] = punto(r1, hasta);
  const [x4, y4] = punto(r1, desde);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${r2} ${r2} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}L${x3.toFixed(2)} ${y3.toFixed(2)}A${r1} ${r1} 0 0 0 ${x4.toFixed(2)} ${y4.toFixed(2)}Z`;
}

interface Props {
  /** Desviación en cents, o null si no suena nada. */
  cents: number | null;
  afinada: boolean;
  /** Celebración: todas las cuerdas afinadas. */
  brillo: boolean;
  apagada: boolean;
  children: ReactNode;
}

export default function Roseta({ cents, afinada, brillo, apagada, children }: Props) {
  const teselas = useMemo(
    () =>
      Array.from({ length: TESELAS }, (_, i) => {
        const centro = i * 5 > 180 ? i * 5 - 360 : i * 5; // −175…180, 0 arriba
        return {
          i,
          centro,
          d: sector(152, 178, centro - 2.5 + 0.35, centro + 2.5 - 0.35),
          // Mosaico: grupos de tres (oscura, clara, oscura) como una roseta de taracea.
          variante: i % 3 === 1 ? "b" : "a",
        };
      }),
    [],
  );

  const marcas = useMemo(
    () =>
      Array.from({ length: 11 }, (_, i) => {
        const c = -50 + i * 10;
        const g = c * GRADOS_POR_CENT;
        const largo = c === 0 ? 14 : c % 50 === 0 ? 10 : 6;
        const [x1, y1] = punto(140, g);
        const [x2, y2] = punto(140 - largo, g);
        return { c, x1, y1, x2, y2 };
      }),
    [],
  );

  const c = cents === null ? null : Math.max(-50, Math.min(50, cents));
  const angulo = c === null ? 0 : c * GRADOS_POR_CENT;

  const encendida = (centro: number) => {
    if (c === null || Math.abs(centro) > 92) return false;
    if (Math.abs(centro) < 2.6) return true;
    return angulo > 0 ? centro > 0 && centro - 2.5 <= angulo : centro < 0 && centro + 2.5 >= angulo;
  };

  return (
    <div className={`roseta ${afinada ? "es-afinada" : ""} ${brillo ? "es-brillo" : ""} ${apagada ? "es-apagada" : ""}`}>
      <svg viewBox="0 0 400 400" aria-hidden="true" className="roseta-svg">
        <defs>
          <radialGradient id="boca" cx="50%" cy="42%" r="60%">
            <stop offset="0%" stopColor="var(--boca-centro)" />
            <stop offset="100%" stopColor="var(--boca-borde)" />
          </radialGradient>
        </defs>

        <circle cx={C} cy={C} r={193} className="roseta-filete" />
        <circle cx={C} cy={C} r={186} className="roseta-filete fino" />
        <circle cx={C} cy={C} r={148} className="roseta-filete fino" />

        {teselas.map((t) => (
          <path
            key={t.centro}
            d={t.d}
            className={`tesela ${t.variante} ${encendida(t.centro) ? "on" : ""} ${Math.abs(t.centro) > 92 ? "fuera" : ""}`}
            style={{ "--i": Math.abs(t.centro) / 5 } as CSSProperties}
          />
        ))}

        {marcas.map((m) => (
          <line key={m.c} x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2} className={`raya ${m.c === 0 ? "cero" : ""}`} />
        ))}

        {/* Muesca de latón arriba: ahí está la nota perfecta. */}
        <path d="M200 4 L209 18 L191 18 Z" className="muesca" />

        <circle cx={C} cy={C} r={128} fill="url(#boca)" className="boca" />

        <g className="aguja" style={{ transform: `rotate(${angulo}deg)`, opacity: c === null ? 0 : 1 }}>
          <path d="M200 16 L208.5 35 L200 54 L191.5 35 Z" className="aguja-perla" />
        </g>
      </svg>

      <div className="roseta-nacar" aria-hidden="true" />
      <div className="roseta-centro">{children}</div>
    </div>
  );
}
