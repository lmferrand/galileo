"use client";

// La pala de la guitarra (3 + 3). Cada clavija es un botón con su nota:
// tocarla fija esa cuerda; la cuerda que está sonando vibra.

import { partesNota, type Notacion } from "@/lib/notas";

const POS_Y = [210, 145, 80, 80, 145, 210]; // cuerda 6.ª … 1.ª
const LADO = ["izq", "izq", "izq", "der", "der", "der"] as const;
const POSTE_X = { izq: 88, der: 212 };
const BOTON_X = { izq: 24, der: 276 };
const CEJUELA_Y = 292;
const ALTO = 330;
const CUERDA_X = [106, 123.6, 141.2, 158.8, 176.4, 194];
const GROSOR = [2.6, 2.2, 1.8, 1.4, 1.1, 0.9];

const SILUETA =
  "M98 292 C92 250 66 210 64 150 C62 100 64 60 78 34 Q86 20 104 24 Q150 48 196 24 Q214 20 222 34 C236 60 238 100 236 150 C234 210 208 250 202 292 Z";

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

export default function Pala({ notas, notacion, bemoles, seleccionada, sonando, afinadas, desactivada, onElegir }: Props) {
  return (
    <div className={`pala ${desactivada ? "es-desactivada" : ""}`}>
      <svg viewBox={`0 0 300 ${ALTO}`} className="pala-svg" aria-hidden="true" preserveAspectRatio="xMidYMax meet">
        <defs>
          <linearGradient id="madera-pala" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="var(--pala-1)" />
            <stop offset="100%" stopColor="var(--pala-2)" />
          </linearGradient>
          <filter id="brillo-cuerda" x="-50%" y="-10%" width="200%" height="120%">
            <feGaussianBlur stdDeviation="2.2" />
          </filter>
        </defs>

        {/* Ejes de las clavijas (por detrás de la pala) */}
        {POS_Y.map((y, i) => {
          const lado = LADO[i];
          const x1 = lado === "izq" ? BOTON_X.izq + 12 : POSTE_X.der;
          const x2 = lado === "izq" ? POSTE_X.izq : BOTON_X.der - 12;
          return <rect key={`eje${i}`} x={x1} y={y - 3.5} width={x2 - x1} height={7} rx={2} className="pala-eje" />;
        })}

        <path d={SILUETA} fill="url(#madera-pala)" className="pala-silueta" />
        <path d={SILUETA} className="pala-filete" transform="translate(150 158) scale(0.94) translate(-150 -158)" />

        <text x="150" y="64" textAnchor="middle" className="pala-marca">
          Clavija
        </text>

        {/* Diapasón y cejuela */}
        <rect x="98" y={CEJUELA_Y + 6} width="104" height={ALTO - CEJUELA_Y} className="pala-diapason" />
        <line x1="98" y1={ALTO - 6} x2="202" y2={ALTO - 6} className="pala-traste" />
        <rect x="97" y={CEJUELA_Y - 3} width="106" height="9" rx="1.5" className="pala-cejuela" />

        {/* Cuerdas */}
        {notas.map((_, i) => {
          const lado = LADO[i];
          const px = POSTE_X[lado];
          const py = POS_Y[i];
          const cx = CUERDA_X[i];
          const activa = sonando === i;
          const elegida = seleccionada === i;
          const clase = `pala-cuerda ${activa ? "activa" : ""} ${elegida ? "elegida" : ""} ${i < 3 ? "entorchada" : ""}`;
          return (
            <g key={`cuerda${i}`}>
              <line x1={px} y1={py} x2={cx} y2={CEJUELA_Y} className={clase} strokeWidth={GROSOR[i]} />
              <line x1={cx} y1={CEJUELA_Y} x2={cx} y2={ALTO} className={clase} strokeWidth={GROSOR[i]} />
              {activa && (
                <line x1={cx} y1={CEJUELA_Y + 4} x2={cx} y2={ALTO} className="pala-vibracion" strokeWidth={GROSOR[i] * 2.4} filter="url(#brillo-cuerda)" />
              )}
            </g>
          );
        })}

        {/* Postes */}
        {POS_Y.map((y, i) => (
          <g key={`poste${i}`}>
            <circle cx={POSTE_X[LADO[i]]} cy={y} r={8.5} className="pala-poste" />
            <circle cx={POSTE_X[LADO[i]]} cy={y} r={3.2} className="pala-poste-centro" />
          </g>
        ))}
      </svg>

      {notas.map((midi, i) => {
        const { base, alteracion, octava } = partesNota(midi, notacion, bemoles);
        const lado = LADO[i];
        const estado = afinadas.has(i) ? "afinada" : sonando === i ? "sonando" : "";
        return (
          <button
            key={`clavija${i}`}
            type="button"
            className={`clavija ${lado} ${seleccionada === i ? "elegida" : ""} ${estado}`}
            style={{ left: `${(BOTON_X[lado] / 300) * 100}%`, top: `${(POS_Y[i] / ALTO) * 100}%` }}
            onClick={() => onElegir(i)}
            disabled={desactivada}
            aria-pressed={seleccionada === i}
            aria-label={`Cuerda ${6 - i}: ${base}${alteracion}${octava}${afinadas.has(i) ? ", afinada" : ""}`}
          >
            <span className="clavija-nota">
              {base}
              {alteracion && <span className="clavija-alt">{alteracion}</span>}
            </span>
            {afinadas.has(i) && (
              <svg viewBox="0 0 16 16" className="clavija-ok" aria-hidden="true">
                <path d="M3.5 8.5 L6.6 11.4 L12.5 4.8" />
              </svg>
            )}
          </button>
        );
      })}
    </div>
  );
}
