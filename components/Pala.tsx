"use client";

// El clavijero: la imagen de la pala (lacado negro, llaves doradas, nácar y
// «Clavija» en el lacado) con todo lo interactivo encima. Las coordenadas están
// en píxeles de la imagen recortada (815 × 1392) y se pasan a porcentajes, así
// encajan a cualquier tamaño. Las cuerdas se dibujan encima de las de la imagen
// para que se vean bien en el móvil y siguen por un mástil dibujado hasta el
// borde de la pantalla. La nota solo aparece en la llave de la cuerda que suena.

import { partesNota, type Notacion } from "@/lib/notas";

const ANCHO = 815;
const ALTO = 1392;
const FONDO = 3200; // hasta dónde se dibuja el mástil (se recorta con la pantalla)

// Cuerda 6.ª … 1.ª: las tres graves a la izquierda (de abajo arriba) y las tres agudas a la derecha.
const LLAVE = [
  { x: 68, y: 856, lado: "izq" },
  { x: 68, y: 636, lado: "izq" },
  { x: 68, y: 421, lado: "izq" },
  { x: 745, y: 416, lado: "der" },
  { x: 745, y: 631, lado: "der" },
  { x: 745, y: 851, lado: "der" },
] as const;
const POSTE = [
  { x: 255, y: 846 },
  { x: 258, y: 631 },
  { x: 250, y: 416 },
  { x: 555, y: 411 },
  { x: 550, y: 631 },
  { x: 555, y: 846 },
];
// Recorrido de cada cuerda en la imagen, medido fila a fila: de su poste a la cejuela.
const RECORRIDO: [number, number][][] = [
  [[281, 868], [280, 900], [279, 950], [278, 1100], [276, 1200], [275, 1290], [274, 1360]],
  [[286, 655], [288, 700], [291, 760], [293, 800], [299, 870], [301, 900], [303, 950], [306, 1000], [312, 1100], [318, 1200], [323, 1290], [324, 1360]],
  [[280, 445], [284, 470], [290, 520], [298, 600], [306, 660], [310, 700], [316, 760], [321, 800], [330, 870], [333, 900], [338, 950], [343, 1000], [355, 1100], [367, 1200], [372, 1250], [375, 1290], [377, 1360]],
  [[535, 440], [527, 470], [520, 520], [512, 600], [505, 660], [500, 700], [493, 760], [489, 800], [481, 870], [478, 900], [473, 950], [468, 1000], [456, 1100], [445, 1200], [439, 1250], [434, 1290], [431, 1320], [431, 1360]],
  [[527, 655], [525, 700], [521, 760], [520, 800], [515, 870], [513, 900], [510, 950], [507, 1000], [500, 1100], [492, 1200], [488, 1250], [485, 1290], [483, 1320], [483, 1360]],
  [[533, 868], [533, 950], [534, 1100], [535, 1200], [535, 1360]],
];
const GROSOR = [10, 9, 8, 6, 5, 4.5];
// Trastes a partir de la cejuela (≈ 1341), cada uno un 5,6 % más cerca que el anterior.
const TRASTES = (() => {
  const t: number[] = [];
  let y = 1341;
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
        <rect x="237" y={ALTO - 2} width="331" height={FONDO - ALTO} fill="url(#palisandro)" />
        <rect x="237" y={ALTO - 2} width="12" height={FONDO - ALTO} fill="url(#filete-oro)" />
        <rect x="556" y={ALTO - 2} width="12" height={FONDO - ALTO} fill="url(#filete-oro)" />
        {TRASTES.map((y) => (
          <rect key={y} x="249" y={y - 4} width="307" height="8" rx="2" fill="url(#traste)" />
        ))}
      </svg>

      {/* Imagen fija con srcset propio: no hace falta el optimizador de Next. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="pala-foto"
        src="/pala/clavijero3-815.webp"
        srcSet="/pala/clavijero3-500.webp 500w, /pala/clavijero3-815.webp 815w"
        sizes="(min-width: 900px) 420px, 300px"
        width={ANCHO}
        height={ALTO}
        alt=""
        draggable={false}
      />

      <svg className="pala-capa" viewBox={`0 0 ${ANCHO} ${ALTO}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <filter id="brillo-pala" x="-50%" y="-10%" width="200%" height="120%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>

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
        // La nota solo se enseña en la cuerda que suena o en la que has tocado en la pantalla.
        const clases = [
          "llave",
          lado,
          seleccionada === i ? "elegida" : "",
          sonando === i ? "sonando" : "",
          afinadas.has(i) ? "afinada" : "",
        ].join(" ");
        return (
          <button
            key={i}
            type="button"
            className={clases}
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
