"use client";

// El reproductor de la canción en lo alto de la Mesa (solo desde Pistas): una pantalla con la onda
// de la canción y, debajo, las teclas (atrás y adelante 10 s, tocar o parar, bucle). Un toque en la
// pantalla va a ese punto; arrastrar elige un trozo, que se pone a repetir (sus bordes se pueden
// mover). Todo manda sobre el reproductor de Pistas (es el mismo).

import {
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent,
  type ReactNode,
} from "react";
import { formatoTiempo } from "@/lib/pistas/tipos";
import { usePosicion, type Posicion } from "@/lib/pistas/posicion";
import type { Practica } from "./PracticaBucle";

export interface Transporte {
  tocando: boolean;
  cargando: boolean;
  /** La canción no se ha podido abrir: por qué */
  error?: string | null;
  /** Se ha pulsado tocar mientras cargaba: sonará en cuanto esté lista */
  esperaTocar?: boolean;
  /** Por dónde va la canción: fuera de React, para no repintar la Mesa entera en cada cambio */
  posicion: Posicion;
  duracion: number;
  /** La onda de la canción (0–1 por trozo), para dibujarla en la pantalla */
  onda: Float32Array | null;
  desde: number | null;
  hasta: number | null;
  repetir: boolean;
  onAlternar: () => void;
  onIr: (s: number) => void;
  /** Elegir el trozo (o quitarlo con null, null) */
  onTrozo: (desde: number | null, hasta: number | null) => void;
  onRepetir: (r: boolean) => void;
  /** Más lenta sin cambiar el tono (la rueda naranja de la grabadora) */
  velocidad: number;
  velocidadMin: number;
  velocidadMax: number;
  onVelocidad: (v: number) => void;
  /** El bucle por compases y el entrenador de velocidad (components/PracticaBucle) */
  practica?: Practica;
}

/** Lo más corto que puede ser un trozo, en segundos */
const TROZO_MINIMO = 1;
/** Lo que hay que arrastrar para que no sea un toque */
const ARRASTRE_PX = 8;

type Arrastre = {
  modo: "nuevo" | "desde" | "hasta";
  x0: number;
  s0: number;
  movido: boolean;
};

/**
 * Dentro de la grabadora (`conCinta`): las teclas de tocar y saltar son las suyas, aquí solo el
 * bucle, y la pantalla es roja como su contador. `aviso` (el mando que se mueve, las entradas…)
 * se enseña en lugar de la ayuda.
 */
// Las piezas que siguen a la canción: se repintan ellas solas (lib/pistas/posicion)
/** Por dónde va, en texto (cambia una vez por segundo) */
function Ahora({ posicion }: { posicion: Posicion }) {
  return usePosicion(posicion, formatoTiempo);
}
/** La parte ya sonada de la onda (el recorte que la pinta encendida) */
function Hecho({ posicion, duracion, ancho }: { posicion: Posicion; duracion: number; ancho: number }) {
  const s = usePosicion(posicion);
  return <rect x="0" y="-1" width={Math.min(1, Math.max(0, s / duracion)) * ancho} height="2" />;
}
/** El cabezal: la raya que marca por dónde va */
function Cabezal({ posicion, duracion }: { posicion: Posicion; duracion: number }) {
  const s = usePosicion(posicion);
  return <span className="pc-cabezal" style={{ left: `${(Math.min(Math.max(s, 0), duracion) / duracion) * 100}%` }} aria-hidden="true" />;
}

export default function TransporteMesa({
  t,
  conCinta,
  aviso,
  extra,
  onBucle,
}: {
  t: Transporte;
  conCinta?: boolean;
  aviso?: string | null;
  /** Otra tecla al final (la de la toma de REC) */
  extra?: ReactNode;
  /** La tecla «Bucle» abre su hoja (repetir, compases, entrenador) en lugar de solo repetir o no */
  onBucle?: () => void;
}) {
  const barra = useRef<HTMLDivElement>(null);
  const arrastre = useRef<Arrastre | null>(null);
  // Mientras se arrastra, el trozo que se va eligiendo (aún sin mandar)
  const [provisional, setProvisional] = useState<{
    desde: number;
    hasta: number;
  } | null>(null);
  const D = Math.max(1, t.duracion);
  // Para quien usa lector de pantalla: el segundo entero (esta pantalla se repinta una vez por segundo)
  const segundoEntero = usePosicion(t.posicion, Math.round);
  const trozo =
    provisional ??
    (t.desde !== null && t.hasta !== null && t.hasta - t.desde >= TROZO_MINIMO
      ? { desde: t.desde, hasta: t.hasta }
      : null);
  const pct = (s: number) => `${(Math.min(Math.max(s, 0), D) / D) * 100}%`;

  const aSegundo = (x: number) => {
    const r = barra.current?.getBoundingClientRect();
    if (!r || r.width === 0) return 0;
    return Math.min(1, Math.max(0, (x - r.left) / r.width)) * D;
  };
  const redondo = (s: number) => Math.round(s * 10) / 10;

  const empezar = (modo: Arrastre["modo"], e: PointerEvent<HTMLElement>) => {
    if (t.cargando) return;
    e.stopPropagation();
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastre.current = {
      modo,
      x0: e.clientX,
      s0: aSegundo(e.clientX),
      movido: false,
    };
  };
  const mover = (e: PointerEvent<HTMLElement>) => {
    const a = arrastre.current;
    if (!a) return;
    if (!a.movido && Math.abs(e.clientX - a.x0) < ARRASTRE_PX) return;
    a.movido = true;
    const s = aSegundo(e.clientX);
    if (a.modo === "nuevo")
      setProvisional({ desde: Math.min(a.s0, s), hasta: Math.max(a.s0, s) });
    else if (trozo) {
      if (a.modo === "desde")
        setProvisional({
          desde: Math.min(s, trozo.hasta - TROZO_MINIMO),
          hasta: trozo.hasta,
        });
      else
        setProvisional({
          desde: trozo.desde,
          hasta: Math.max(s, trozo.desde + TROZO_MINIMO),
        });
    }
  };
  const soltar = () => {
    const a = arrastre.current;
    arrastre.current = null;
    if (!a) return;
    if (!a.movido) {
      // Un toque: ir a ese punto
      if (a.modo === "nuevo") t.onIr(a.s0);
    } else if (
      provisional &&
      provisional.hasta - provisional.desde >= TROZO_MINIMO
    ) {
      t.onTrozo(redondo(provisional.desde), redondo(provisional.hasta));
      t.onRepetir(true);
    }
    setProvisional(null);
  };
  const cancelar = () => {
    arrastre.current = null;
    setProvisional(null);
  };

  // Teclado: la barra mueve la canción y los bordes mueven el trozo
  const teclaBarra = (e: KeyboardEvent<HTMLDivElement>) => {
    const pasos: Record<string, number> = {
      ArrowRight: 5,
      ArrowUp: 5,
      ArrowLeft: -5,
      ArrowDown: -5,
      PageUp: 30,
      PageDown: -30,
    };
    if (e.key in pasos)
      t.onIr(Math.min(D, Math.max(0, t.posicion.leer() + pasos[e.key])));
    else if (e.key === "Home") t.onIr(0);
    else return;
    e.preventDefault();
  };
  const teclaBorde = (
    cual: "desde" | "hasta",
    e: KeyboardEvent<HTMLSpanElement>,
  ) => {
    if (!trozo) return;
    const d =
      e.key === "ArrowRight" || e.key === "ArrowUp"
        ? 0.5
        : e.key === "ArrowLeft" || e.key === "ArrowDown"
          ? -0.5
          : 0;
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    if (cual === "desde")
      t.onTrozo(
        redondo(
          Math.max(0, Math.min(trozo.hasta - TROZO_MINIMO, trozo.desde + d)),
        ),
        trozo.hasta,
      );
    else
      t.onTrozo(
        trozo.desde,
        redondo(
          Math.min(D, Math.max(trozo.desde + TROZO_MINIMO, trozo.hasta + d)),
        ),
      );
  };

  const onda = t.onda;
  const N = onda?.length ?? 0;
  // La onda como una silueta rellena (arriba y abajo iguales); su escala la pone el SVG
  const silueta = useMemo(() => {
    if (!onda || onda.length === 0) return "";
    let arriba = "M0,0";
    let abajo = "";
    for (let k = 0; k < onda.length; k++) {
      const h = Math.max(0.04, onda[k]).toFixed(3);
      arriba += ` L${k + 0.5},-${h}`;
      abajo = ` L${k + 0.5},${h}` + abajo;
    }
    return `${arriba} L${onda.length},0${abajo} Z`;
  }, [onda]);

  return (
    <section
      className={`pantalla-cancion${conCinta ? " en-cinta" : ""}`}
      aria-label="Reproductor de la canción"
    >
      <div
        ref={barra}
        className={`pc-pantalla${t.cargando ? " cargando" : ""}`}
        role="slider"
        tabIndex={0}
        aria-label="Posición en la canción (arrastra para elegir un trozo)"
        aria-valuemin={0}
        aria-valuemax={Math.round(D)}
        aria-valuenow={segundoEntero}
        aria-valuetext={`${formatoTiempo(segundoEntero)} de ${formatoTiempo(t.duracion)}`}
        onPointerDown={(e) => empezar("nuevo", e)}
        onPointerMove={mover}
        onPointerUp={soltar}
        onPointerCancel={cancelar}
        onKeyDown={teclaBarra}
      >
        <div className="pc-tiempos" aria-hidden="true">
          <span>
            <Ahora posicion={t.posicion} />
          </span>
          {aviso ? (
            <span className="pc-ayuda pc-aviso">{aviso}</span>
          ) : trozo ? (
            <span className={`pc-trozo-texto${t.repetir ? " on" : ""}`}>
              {formatoTiempo(trozo.desde)} – {formatoTiempo(trozo.hasta)}
            </span>
          ) : (
            <span className="pc-ayuda">Arrastra para elegir un trozo</span>
          )}
          <span>{formatoTiempo(t.duracion)}</span>
        </div>
        <div className="pc-onda">
          {N > 0 ? (
            <svg
              viewBox={`0 -1 ${N} 2`}
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <defs>
                <clipPath id="pc-hecho">
                  <Hecho posicion={t.posicion} duracion={D} ancho={N} />
                </clipPath>
              </defs>
              <path d={silueta} className="pc-onda-fondo" />
              <path
                d={silueta}
                className="pc-onda-hecha"
                clipPath="url(#pc-hecho)"
              />
            </svg>
          ) : (
            <span className="pc-sin-onda" aria-hidden="true" />
          )}
          {trozo && (
            <span
              className={`pc-trozo${t.repetir ? " on" : ""}`}
              style={{
                left: pct(trozo.desde),
                width: `calc(${pct(trozo.hasta)} - ${pct(trozo.desde)})`,
              }}
            >
              <span
                className="pc-borde pc-borde-desde"
                role="slider"
                tabIndex={0}
                aria-label="Principio del trozo"
                aria-valuemin={0}
                aria-valuemax={Math.round(D)}
                aria-valuenow={Math.round(trozo.desde)}
                aria-valuetext={formatoTiempo(trozo.desde)}
                onPointerDown={(e) => empezar("desde", e)}
                onPointerMove={mover}
                onPointerUp={soltar}
                onPointerCancel={cancelar}
                onKeyDown={(e) => teclaBorde("desde", e)}
              />
              <span
                className="pc-borde pc-borde-hasta"
                role="slider"
                tabIndex={0}
                aria-label="Final del trozo"
                aria-valuemin={0}
                aria-valuemax={Math.round(D)}
                aria-valuenow={Math.round(trozo.hasta)}
                aria-valuetext={formatoTiempo(trozo.hasta)}
                onPointerDown={(e) => empezar("hasta", e)}
                onPointerMove={mover}
                onPointerUp={soltar}
                onPointerCancel={cancelar}
                onKeyDown={(e) => teclaBorde("hasta", e)}
              />
            </span>
          )}
          <Cabezal posicion={t.posicion} duracion={D} />
        </div>
      </div>

      {/* Las teclas, como las de la mesa */}
      <div className="pc-teclas">
        {!conCinta && (
          <>
            <div className="tecla-con-nombre">
              <button
                type="button"
                className="tecla pc-tecla"
                onClick={() => t.onIr(Math.max(0, t.posicion.leer() - 10))}
                disabled={t.cargando}
                aria-label="Atrás 10 segundos"
              >
                <IconoSalto atras />
              </button>
              <span className="mando-nombre" aria-hidden="true">
                −10 s
              </span>
            </div>
            <div className="tecla-con-nombre">
              <button
                type="button"
                className={`tecla pc-tecla pc-tocar${t.tocando ? " on" : ""}${t.esperaTocar ? " espera" : ""}`}
                onClick={t.onAlternar}
                aria-label={t.tocando ? "Pausa" : "Tocar"}
              >
                {t.tocando ? (
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="relleno"
                  >
                    <rect x="6.5" y="5.5" width="4" height="13" rx="1" />
                    <rect x="13.5" y="5.5" width="4" height="13" rx="1" />
                  </svg>
                ) : (
                  <svg
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                    className="relleno"
                  >
                    <path d="M8 5.5v13l10.5-6.5z" />
                  </svg>
                )}
              </button>
              <span className="mando-nombre" aria-hidden="true">
                {t.tocando ? "Pausa" : "Tocar"}
              </span>
            </div>
            <div className="tecla-con-nombre">
              <button
                type="button"
                className="tecla pc-tecla"
                onClick={() => t.onIr(Math.min(D, t.posicion.leer() + 10))}
                disabled={t.cargando}
                aria-label="Adelante 10 segundos"
              >
                <IconoSalto />
              </button>
              <span className="mando-nombre" aria-hidden="true">
                +10 s
              </span>
            </div>
          </>
        )}
        <div className="tecla-con-nombre pc-bucle">
          <button
            type="button"
            className={`tecla pc-tecla${t.repetir && trozo ? " on" : ""}`}
            aria-pressed={t.repetir && !!trozo}
            aria-label={onBucle ? "Bucle: repetir un trozo, por compases, y entrenador de velocidad" : "Repetir el trozo"}
            disabled={!onBucle && !trozo}
            onClick={onBucle ?? (() => t.onRepetir(!t.repetir))}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M17 4l3 3-3 3M20 7H8a4 4 0 0 0-4 4M7 20l-3-3 3-3M4 17h12a4 4 0 0 0 4-4" />
            </svg>
          </button>
          <span className="mando-nombre" aria-hidden="true">
            Bucle
          </span>
        </div>
        {trozo && (
          <div className="tecla-con-nombre">
            <button
              type="button"
              className="tecla pc-tecla"
              onClick={() => t.onTrozo(null, null)}
              aria-label="Quitar el trozo"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6l12 12M18 6 6 18" />
              </svg>
            </button>
            <span className="mando-nombre" aria-hidden="true">
              Quitar
            </span>
          </div>
        )}
        {extra}
      </div>
    </section>
  );
}

function IconoSalto({ atras }: { atras?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden="true"
      style={atras ? { transform: "scaleX(-1)" } : undefined}
    >
      <path d="M19 12a7 7 0 1 1-2.05-4.95" />
      <path d="M19 4.5v3.5h-3.5" />
      <text
        x="12"
        y="15.2"
        textAnchor="middle"
        className="pc-salto-texto"
        style={
          atras
            ? { transform: "scaleX(-1)", transformOrigin: "12px 12px" }
            : undefined
        }
      >
        10
      </text>
    </svg>
  );
}
