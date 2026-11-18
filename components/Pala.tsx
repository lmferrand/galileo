"use client";

// El clavijero: la imagen de la pala del instrumento con todo lo interactivo
// encima. Las medidas de cada pala están en lib/palas.ts, en píxeles de su
// imagen, y aquí se pasan a porcentajes, así encajan a cualquier tamaño. Las
// cuerdas se dibujan encima de las de la imagen para que se vean bien en el
// móvil y siguen por un mástil dibujado hasta el borde de la pantalla. La nota
// solo aparece en la llave de la cuerda que suena.

import type { CSSProperties } from "react";
import { partesNota, type Notacion } from "@/lib/notas";
import type { GeometriaPala } from "@/lib/palas";

const FONDO_EXTRA = 1800; // lo que se dibuja de mástil por debajo de la imagen (se recorta con la pantalla)

/** Trastes por debajo de la imagen, cada uno un 5,6 % más cerca que el anterior. */
function trastes(g: GeometriaPala): number[] {
  const t: number[] = [];
  let y = g.mastil.cejuela;
  let paso = g.mastil.paso;
  while (y < g.imagen.alto + FONDO_EXTRA) {
    y += paso;
    if (y > g.imagen.alto) t.push(Math.round(y));
    paso *= 0.9439;
  }
  return t;
}

function camino(g: GeometriaPala, i: number) {
  const puntos = g.recorridos[i];
  const [ux] = puntos[puntos.length - 1];
  return `M${puntos.map(([x, y]) => `${x} ${y}`).join(" L")} L${ux} ${g.imagen.alto + FONDO_EXTRA}`;
}

interface Props {
  geometria: GeometriaPala;
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

export default function Pala({ geometria: g, notas, notacion, bemoles, seleccionada, sonando, afinadas, desactivada, onElegir }: Props) {
  const { ancho: ANCHO, alto: ALTO } = g.imagen;
  const m = g.mastil;
  const total = notas.length;
  const estilo = {
    aspectRatio: `${ANCHO} / ${ALTO}`,
    "--llave-ancho": `${g.llave.ancho}cqi`,
    "--llave-alto": `${g.llave.alto}cqi`,
    "--llave-letra": `${g.llave.letra}cqi`,
  } as CSSProperties;

  return (
    <div className={`pala ${g.metal} ${desactivada ? "es-desactivada" : ""}`} style={estilo}>
      {/* El mástil sigue debajo de la foto hasta el borde de la pantalla */}
      <svg className="pala-capa pala-mastil" viewBox={`0 0 ${ANCHO} ${ALTO}`} preserveAspectRatio="none" aria-hidden="true">
        <defs>
          <linearGradient id="madera-mastil" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={m.madera[0]} />
            <stop offset="50%" stopColor={m.madera[1]} />
            <stop offset="100%" stopColor={m.madera[2]} />
          </linearGradient>
          <linearGradient id="filete-mastil" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor={m.colorFilete[0]} />
            <stop offset="50%" stopColor={m.colorFilete[1]} />
            <stop offset="100%" stopColor={m.colorFilete[2]} />
          </linearGradient>
          <linearGradient id="traste" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#fbf8f1" />
            <stop offset="100%" stopColor="#8f897f" />
          </linearGradient>
        </defs>
        <rect x={m.x0} y={ALTO - 2} width={m.x1 - m.x0} height={FONDO_EXTRA} fill="url(#madera-mastil)" />
        <rect x={m.x0} y={ALTO - 2} width={m.filete} height={FONDO_EXTRA} fill="url(#filete-mastil)" />
        <rect x={m.x1 - m.filete} y={ALTO - 2} width={m.filete} height={FONDO_EXTRA} fill="url(#filete-mastil)" />
        {trastes(g).map((y) => (
          <rect key={y} x={m.x0 + m.filete} y={y - 4} width={m.x1 - m.x0 - 2 * m.filete} height="8" rx="2" fill="url(#traste)" />
        ))}
      </svg>

      {/* Imagen fija con srcset propio: no hace falta el optimizador de Next. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="pala-foto"
        src={g.imagen.src}
        srcSet={g.imagen.srcSet}
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

        {/* Las cuerdas, bien visibles: entorchadas las graves, lisas las agudas */}
        <g className="pala-cuerdas">
          {notas.map((_, i) => (
            <path key={`s${i}`} d={camino(g, i)} className="pala-cuerda-sombra" strokeWidth={g.grosor[i] + 5} />
          ))}
          {notas.map((_, i) => (
            <path
              key={`c${i}`}
              d={camino(g, i)}
              className={`pala-cuerda ${i < g.entorchadas ? "entorchada" : "lisa"} ${afinadas.has(i) ? "afinada" : ""}`}
              strokeWidth={g.grosor[i]}
            />
          ))}
        </g>

        {notas.map((_, i) => {
          const activa = sonando === i;
          const elegida = seleccionada === i;
          if (!activa && !elegida) return null;
          const d = camino(g, i);
          return (
            <g key={i} className={`pala-luz ${activa ? "activa" : "elegida"}`}>
              <circle cx={g.postes[i].x} cy={g.postes[i].y} r={g.radioPoste} className="pala-luz-poste" filter="url(#brillo-pala)" />
              <path d={d} className="pala-luz-halo" strokeWidth={g.grosor[i] + 14} filter="url(#brillo-pala)" />
              <path d={d} className="pala-luz-cuerda" strokeWidth={g.grosor[i] + 1} />
            </g>
          );
        })}
      </svg>

      {notas.map((midi, i) => {
        const { base, alteracion, octava } = partesNota(midi, notacion, bemoles);
        const { x, y, lado } = g.llaves[i];
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
            aria-label={`Cuerda ${total - i}: ${base}${alteracion}${octava}${afinadas.has(i) ? ", afinada" : ""}`}
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
