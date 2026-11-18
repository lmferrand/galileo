"use client";

// Diapasón dibujado para «Aprender»: como en una tablatura, la cuerda 1 (Mi agudo) arriba y la 6
// abajo, la cejuela a la izquierda. Marca dónde pisar la nota que toca: un círculo de latón con
// el dedo, o un aro antes de la cejuela si es al aire. La cuerda que suena se ilumina.

import { dedoDePaso, ESTANDAR, type Paso } from "@/lib/aprender/curso";
import { nombreNota, type Notacion } from "@/lib/notas";

interface Props {
  paso: Paso | null;
  estado: "normal" | "acierto" | "fallo";
  notacion: Notacion;
  /** Cuántos trastes se dibujan */
  trastes?: number;
}

const ANCHO = 360;
const ALTO = 176;
const CEJUELA = 58;
const ARRIBA = 22;
const ABAJO = ALTO - 22;
const yCuerda = (c: number) => ARRIBA + ((c - 1) * (ABAJO - ARRIBA)) / 5;

export default function Diapason({ paso, estado, notacion, trastes = 4 }: Props) {
  const paso1 = (ANCHO - CEJUELA - 8) / trastes;
  const xTraste = (t: number) => CEJUELA + t * paso1;
  const xNota = (t: number) => (t === 0 ? CEJUELA - 22 : xTraste(t) - paso1 / 2);

  return (
    <svg className={`diapason ${estado}`} viewBox={`0 0 ${ANCHO} ${ALTO}`} role="img" aria-label={paso ? `Cuerda ${paso.cuerda}, ${paso.traste === 0 ? "al aire" : `traste ${paso.traste}`}` : "Diapasón"}>
      <defs>
        <linearGradient id="dia-madera" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3b2015" />
          <stop offset="0.5" stopColor="#2c170f" />
          <stop offset="1" stopColor="#3b2015" />
        </linearGradient>
        <linearGradient id="dia-traste" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#8d8a84" />
          <stop offset="0.5" stopColor="#e9e5dc" />
          <stop offset="1" stopColor="#8d8a84" />
        </linearGradient>
        <radialGradient id="dia-laton" cx="0.34" cy="0.28" r="0.8">
          <stop offset="0" stopColor="#fff1cf" />
          <stop offset="0.25" stopColor="#f1d59d" />
          <stop offset="0.65" stopColor="#c69a52" />
          <stop offset="1" stopColor="#7f5d2b" />
        </radialGradient>
      </defs>

      {/* Madera y marcas de los trastes 3 y 5 */}
      <rect x={CEJUELA} y={ARRIBA - 12} width={ANCHO - CEJUELA - 4} height={ABAJO - ARRIBA + 24} rx="6" fill="url(#dia-madera)" />
      {[3, 5, 7, 9].filter((t) => t <= trastes).map((t) => (
        <circle key={t} cx={xTraste(t) - paso1 / 2} cy={(ARRIBA + ABAJO) / 2} r="5" fill="#d8c9a9" opacity="0.55" />
      ))}

      {/* Trastes y cejuela */}
      {Array.from({ length: trastes }, (_, i) => i + 1).map((t) => (
        <rect key={t} x={xTraste(t) - 1.6} y={ARRIBA - 12} width="3.2" height={ABAJO - ARRIBA + 24} fill="url(#dia-traste)" />
      ))}
      <rect x={CEJUELA - 5} y={ARRIBA - 13} width="7" height={ABAJO - ARRIBA + 26} rx="2" fill="#efe6d2" />
      {Array.from({ length: trastes }, (_, i) => i + 1).map((t) => (
        <text key={t} x={xTraste(t) - paso1 / 2} y={ALTO - 2} className="diapason-num" textAnchor="middle">
          {t}
        </text>
      ))}

      {/* Cuerdas, con su nombre al aire */}
      {ESTANDAR.map((midi, i) => {
        const c = i + 1;
        const suena = paso?.cuerda === c;
        return (
          <g key={c} className={suena ? "cuerda suena" : "cuerda"}>
            <text x="6" y={yCuerda(c) + 4.5} className="diapason-nombre">
              {nombreNota(midi, notacion)}
            </text>
            <line x1={CEJUELA - 30} x2={ANCHO - 4} y1={yCuerda(c)} y2={yCuerda(c)} strokeWidth={0.9 + i * 0.42} />
          </g>
        );
      })}

      {/* Dónde pisar */}
      {paso &&
        (paso.traste === 0 ? (
          <circle key={`${paso.cuerda}-0`} className="diapason-aire" cx={xNota(0)} cy={yCuerda(paso.cuerda)} r="9.5" />
        ) : (
          <g key={`${paso.cuerda}-${paso.traste}`} className="diapason-dedo">
            <circle cx={xNota(paso.traste)} cy={yCuerda(paso.cuerda)} r="12" fill="url(#dia-laton)" />
            <text x={xNota(paso.traste)} y={yCuerda(paso.cuerda) + 5} textAnchor="middle">
              {dedoDePaso(paso)}
            </text>
          </g>
        ))}
    </svg>
  );
}
