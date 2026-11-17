"use client";

// El clavijero: la foto de la pala (lacado negro, llaves doradas y nácar) con
// todo lo interactivo encima. Las coordenadas están en píxeles de la imagen
// recortada (820 × 1428) y se pasan a porcentajes, así encajan a cualquier tamaño.

import { partesNota, type Notacion } from "@/lib/notas";

const ANCHO = 820;
const ALTO = 1428;
const CEJUELA_Y = 1310;

// Cuerda 6.ª … 1.ª: las tres graves a la izquierda (de abajo arriba) y las tres agudas a la derecha.
const LLAVE = [
  { x: 75, y: 831, lado: "izq" },
  { x: 75, y: 628, lado: "izq" },
  { x: 75, y: 417, lado: "izq" },
  { x: 735, y: 417, lado: "der" },
  { x: 735, y: 628, lado: "der" },
  { x: 735, y: 831, lado: "der" },
] as const;
const POSTE = [
  { x: 263, y: 837 },
  { x: 263, y: 632 },
  { x: 260, y: 420 },
  { x: 560, y: 420 },
  { x: 550, y: 630 },
  { x: 555, y: 837 },
];
// Donde la cuerda sale del poste y donde cruza la cejuela.
const SALIDA = [
  { x: 288, y: 845 },
  { x: 288, y: 635 },
  { x: 278, y: 430 },
  { x: 538, y: 430 },
  { x: 532, y: 640 },
  { x: 535, y: 845 },
];
const CEJUELA_X = [277, 327, 367, 438, 492, 536];

interface Props {
  notas: number[];
  notacion: Notacion;
  bemoles?: boolean;
  seleccionada: number | null;
  sonando: number | null;
  afinadas: Set<number>;
  desactivada?: boolean;
  onElegir: (indice: number) => void;
}

const pct = (v: number, total: number) => `${(v / total) * 100}%`;

export default function Pala({ notas, notacion, bemoles, seleccionada, sonando, afinadas, desactivada, onElegir }: Props) {
  return (
    <div className={`pala ${desactivada ? "es-desactivada" : ""}`}>
      {/* Imagen fija con srcset propio: no hace falta el optimizador de Next. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="pala-foto"
        src="/pala/clavijero-820.webp"
        srcSet="/pala/clavijero-500.webp 500w, /pala/clavijero-820.webp 820w"
        sizes="(min-width: 900px) 420px, 300px"
        width={ANCHO}
        height={ALTO}
        alt=""
        draggable={false}
      />

      <svg className="pala-capa" viewBox={`0 0 ${ANCHO} ${ALTO}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="oro-marca" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fff2c8" />
            <stop offset="45%" stopColor="#e9c46e" />
            <stop offset="100%" stopColor="#a8792c" />
          </linearGradient>
          <filter id="brillo-pala" x="-50%" y="-10%" width="200%" height="120%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>

        {/* Nuestra marca, en el sitio donde iba la del fabricante */}
        <text x="404" y="206" textAnchor="middle" className="pala-marca-texto">
          Clavija
        </text>

        {notas.map((_, i) => {
          const activa = sonando === i;
          const elegida = seleccionada === i;
          if (!activa && !elegida) return null;
          const d = `M${SALIDA[i].x} ${SALIDA[i].y} L${CEJUELA_X[i]} ${CEJUELA_Y} L${CEJUELA_X[i]} ${ALTO}`;
          return (
            <g key={i} className={`pala-luz ${activa ? "activa" : "elegida"}`}>
              <circle cx={POSTE[i].x} cy={POSTE[i].y} r="46" className="pala-luz-poste" filter="url(#brillo-pala)" />
              <path d={d} className="pala-luz-halo" filter="url(#brillo-pala)" />
              <path d={d} className="pala-luz-cuerda" />
            </g>
          );
        })}
      </svg>

      {notas.map((midi, i) => {
        const { base, alteracion, octava } = partesNota(midi, notacion, bemoles);
        const { x, y, lado } = LLAVE[i];
        const estado = afinadas.has(i) ? "afinada" : sonando === i ? "sonando" : "";
        return (
          <button
            key={i}
            type="button"
            className={`llave ${lado} ${seleccionada === i ? "elegida" : ""} ${estado}`}
            style={{ left: pct(x, ANCHO), top: pct(y, ALTO) }}
            onClick={() => onElegir(i)}
            disabled={desactivada}
            aria-pressed={seleccionada === i}
            aria-label={`Cuerda ${6 - i}: ${base}${alteracion}${octava}${afinadas.has(i) ? ", afinada" : ""}`}
          >
            <span className="llave-nota">
              {base}
              {alteracion && <span className="llave-alt">{alteracion}</span>}
            </span>
            {afinadas.has(i) && (
              <svg viewBox="0 0 16 16" className="llave-ok" aria-hidden="true">
                <path d="M3.5 8.5 L6.6 11.4 L12.5 4.8" />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}
