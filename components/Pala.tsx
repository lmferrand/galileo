"use client";

// El clavijero: la foto de la pala (lacado negro, llaves doradas y nácar) con
// todo lo interactivo encima. Las coordenadas están en píxeles de la imagen
// recortada (820 × 1412) y se pasan a porcentajes, así encajan a cualquier tamaño.
// Las cuerdas se dibujan encima de las de la foto (que a tamaño de móvil casi no
// se ven) y siguen por un mástil dibujado hasta el borde de la pantalla.

import { partesNota, type Notacion } from "@/lib/notas";

const ANCHO = 820;
const ALTO = 1412;
const FONDO = 3200; // hasta dónde se dibuja el mástil (se recorta con la pantalla)

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
// Recorrido de cada cuerda en la foto, medido fila a fila: de su poste a la cejuela.
const RECORRIDO: [number, number][][] = [
  [[287, 865], [285, 900], [282, 1000], [280, 1100], [278, 1200], [277, 1300], [275, 1340]],
  [[289, 655], [291, 700], [295, 760], [298, 800], [306, 900], [310, 960], [312, 1000], [317, 1100], [321, 1200], [327, 1300], [327, 1340]],
  [[280, 445], [284, 470], [290, 520], [300, 600], [311, 700], [319, 760], [324, 800], [337, 900], [344, 960], [350, 1000], [357, 1100], [366, 1200], [373, 1280], [375, 1300], [377, 1340]],
  [[538, 445], [533, 470], [527, 520], [517, 600], [506, 700], [498, 760], [494, 800], [483, 900], [476, 960], [471, 1000], [460, 1100], [450, 1200], [441, 1280], [439, 1300], [436, 1340]],
  [[532, 655], [529, 700], [525, 760], [522, 800], [514, 900], [510, 960], [508, 1000], [503, 1100], [496, 1200], [490, 1280], [489, 1300], [486, 1340]],
  [[537, 865], [537, 900], [537, 1340]],
];
const GROSOR = [10, 9, 8, 6, 5, 4.5];
// Trastes a partir de la cejuela (≈ 1375), cada uno un 5,6 % más cerca que el anterior.
const TRASTES = (() => {
  const t: number[] = [];
  let y = 1375;
  let paso = 274;
  for (let i = 0; i < 7; i++) {
    y += paso;
    t.push(Math.round(y));
    paso *= 0.9439;
  }
  return t;
})();

function camino(i: number) {
  const puntos = RECORRIDO[i];
  const [ux] = puntos[puntos.length - 1];
  return `M${puntos.map(([x, y]) => `${x} ${y}`).join(" L")} L${ux} ${FONDO}`;
}

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
      {/* El mástil sigue debajo de la foto hasta el borde de la pantalla */}
      <svg className="pala-capa pala-mastil" viewBox={`0 0 ${ANCHO} ${ALTO}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="palisandro" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#240f09" />
            <stop offset="50%" stopColor="#36180f" />
            <stop offset="100%" stopColor="#220e08" />
          </linearGradient>
          <linearGradient id="filete-oro" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#a8782c" />
            <stop offset="50%" stopColor="#f7d98f" />
            <stop offset="100%" stopColor="#8a6122" />
          </linearGradient>
          <linearGradient id="traste" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fbf8f1" />
            <stop offset="100%" stopColor="#8f897f" />
          </linearGradient>
        </defs>
        <rect x="241" y={ALTO - 2} width="325" height={FONDO - ALTO} fill="url(#palisandro)" />
        <rect x="241" y={ALTO - 2} width="11" height={FONDO - ALTO} fill="url(#filete-oro)" />
        <rect x="555" y={ALTO - 2} width="11" height={FONDO - ALTO} fill="url(#filete-oro)" />
        {TRASTES.map((y) => (
          <rect key={y} x="252" y={y - 4} width="303" height="8" rx="2" fill="url(#traste)" />
        ))}
      </svg>

      {/* Imagen fija con srcset propio: no hace falta el optimizador de Next. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="pala-foto"
        src="/pala/clavijero2-820.webp"
        srcSet="/pala/clavijero2-500.webp 500w, /pala/clavijero2-820.webp 820w"
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

        {/* Las seis cuerdas, bien visibles: bronce las graves, acero las agudas */}
        <g className="pala-cuerdas">
          {notas.map((_, i) => (
            <path key={`s${i}`} d={camino(i)} className="pala-cuerda-sombra" strokeWidth={GROSOR[i] + 5} />
          ))}
          {notas.map((_, i) => (
            <path
              key={`c${i}`}
              d={camino(i)}
              className={`pala-cuerda ${i < 3 ? "entorchada" : "lisa"} ${afinadas.has(i) ? "afinada" : ""}`}
              strokeWidth={GROSOR[i]}
            />
          ))}
        </g>

        {notas.map((_, i) => {
          const activa = sonando === i;
          const elegida = seleccionada === i;
          if (!activa && !elegida) return null;
          const d = camino(i);
          return (
            <g key={i} className={`pala-luz ${activa ? "activa" : "elegida"}`}>
              <circle cx={POSTE[i].x} cy={POSTE[i].y} r="46" className="pala-luz-poste" filter="url(#brillo-pala)" />
              <path d={d} className="pala-luz-halo" strokeWidth={GROSOR[i] + 14} filter="url(#brillo-pala)" />
              <path d={d} className="pala-luz-cuerda" strokeWidth={GROSOR[i] + 1} />
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
