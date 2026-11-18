"use client";

// El reproductor de la canción dentro de la Mesa (solo desde Pistas): atrás y adelante 10 s,
// tocar o parar, y la barra de la canción. Un toque en la barra va a ese punto; arrastrar elige
// un trozo, que se pone a repetir (sus bordes se pueden mover). La tecla «Bucle» lo enciende y lo
// apaga. Todo manda sobre el reproductor de Pistas (es el mismo).

import { useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { formatoTiempo } from "@/lib/pistas/tipos";

export interface Transporte {
  tocando: boolean;
  cargando: boolean;
  segundo: number;
  duracion: number;
  desde: number | null;
  hasta: number | null;
  repetir: boolean;
  onAlternar: () => void;
  onIr: (s: number) => void;
  /** Elegir el trozo (o quitarlo con null, null) */
  onTrozo: (desde: number | null, hasta: number | null) => void;
  onRepetir: (r: boolean) => void;
}

/** Lo más corto que puede ser un trozo, en segundos */
const TROZO_MINIMO = 1;
/** Lo que hay que arrastrar para que no sea un toque */
const ARRASTRE_PX = 8;

type Arrastre = { modo: "nuevo" | "desde" | "hasta"; x0: number; s0: number; movido: boolean };

export default function TransporteMesa({ t }: { t: Transporte }) {
  const barra = useRef<HTMLDivElement>(null);
  const arrastre = useRef<Arrastre | null>(null);
  // Mientras se arrastra, el trozo que se va eligiendo (aún sin mandar)
  const [provisional, setProvisional] = useState<{ desde: number; hasta: number } | null>(null);
  const D = Math.max(1, t.duracion);
  const trozo = provisional ?? (t.desde !== null && t.hasta !== null && t.hasta - t.desde >= TROZO_MINIMO ? { desde: t.desde, hasta: t.hasta } : null);
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
    arrastre.current = { modo, x0: e.clientX, s0: aSegundo(e.clientX), movido: false };
  };
  const mover = (e: PointerEvent<HTMLElement>) => {
    const a = arrastre.current;
    if (!a) return;
    if (!a.movido && Math.abs(e.clientX - a.x0) < ARRASTRE_PX) return;
    a.movido = true;
    const s = aSegundo(e.clientX);
    if (a.modo === "nuevo") setProvisional({ desde: Math.min(a.s0, s), hasta: Math.max(a.s0, s) });
    else if (trozo) {
      if (a.modo === "desde") setProvisional({ desde: Math.min(s, trozo.hasta - TROZO_MINIMO), hasta: trozo.hasta });
      else setProvisional({ desde: trozo.desde, hasta: Math.max(s, trozo.desde + TROZO_MINIMO) });
    }
  };
  const soltar = () => {
    const a = arrastre.current;
    arrastre.current = null;
    if (!a) return;
    if (!a.movido) {
      // Un toque: ir a ese punto
      if (a.modo === "nuevo") t.onIr(a.s0);
    } else if (provisional && provisional.hasta - provisional.desde >= TROZO_MINIMO) {
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
    const pasos: Record<string, number> = { ArrowRight: 5, ArrowUp: 5, ArrowLeft: -5, ArrowDown: -5, PageUp: 30, PageDown: -30 };
    if (e.key in pasos) t.onIr(Math.min(D, Math.max(0, t.segundo + pasos[e.key])));
    else if (e.key === "Home") t.onIr(0);
    else return;
    e.preventDefault();
  };
  const teclaBorde = (cual: "desde" | "hasta", e: KeyboardEvent<HTMLSpanElement>) => {
    if (!trozo) return;
    const d = e.key === "ArrowRight" || e.key === "ArrowUp" ? 0.5 : e.key === "ArrowLeft" || e.key === "ArrowDown" ? -0.5 : 0;
    if (!d) return;
    e.preventDefault();
    e.stopPropagation();
    if (cual === "desde") t.onTrozo(redondo(Math.max(0, Math.min(trozo.hasta - TROZO_MINIMO, trozo.desde + d))), trozo.hasta);
    else t.onTrozo(trozo.desde, redondo(Math.min(D, Math.max(trozo.desde + TROZO_MINIMO, trozo.hasta + d))));
  };

  return (
    <section className="transporte-mesa" aria-label="Reproductor de la canción">
      <div className="tm-tiempos" aria-hidden="true">
        <span>{formatoTiempo(t.segundo)}</span>
        {trozo && (
          <span className={`tm-trozo-texto${t.repetir ? " on" : ""}`}>
            {formatoTiempo(trozo.desde)} – {formatoTiempo(trozo.hasta)}
          </span>
        )}
        <span>{formatoTiempo(t.duracion)}</span>
      </div>

      <div
        ref={barra}
        className={`tm-barra${t.cargando ? " cargando" : ""}`}
        role="slider"
        tabIndex={0}
        aria-label="Posición en la canción (arrastra para elegir un trozo)"
        aria-valuemin={0}
        aria-valuemax={Math.round(D)}
        aria-valuenow={Math.round(t.segundo)}
        aria-valuetext={`${formatoTiempo(t.segundo)} de ${formatoTiempo(t.duracion)}`}
        onPointerDown={(e) => empezar("nuevo", e)}
        onPointerMove={mover}
        onPointerUp={soltar}
        onPointerCancel={cancelar}
        onKeyDown={teclaBarra}
      >
        <span className="tm-carril" aria-hidden="true">
          <span className="tm-hecho" style={{ width: pct(t.segundo) }} />
        </span>
        {trozo && (
          <span className={`tm-trozo${t.repetir ? " on" : ""}`} style={{ left: pct(trozo.desde), width: `calc(${pct(trozo.hasta)} - ${pct(trozo.desde)})` }}>
            <span
              className="tm-borde tm-borde-desde"
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
              className="tm-borde tm-borde-hasta"
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
        <span className="tm-cabezal" style={{ left: pct(t.segundo) }} aria-hidden="true" />
      </div>

      <div className="tm-mandos">
        <button type="button" className="tm-salto" onClick={() => t.onIr(Math.max(0, t.segundo - 10))} disabled={t.cargando} aria-label="Atrás 10 segundos">
          <IconoSalto atras />
        </button>
        <button type="button" className="tm-tocar" onClick={t.onAlternar} disabled={t.cargando} aria-label={t.tocando ? "Pausa" : "Tocar"}>
          {t.tocando ? (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <rect x="6.5" y="5.5" width="4" height="13" rx="1" />
              <rect x="13.5" y="5.5" width="4" height="13" rx="1" />
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5.5v13l10.5-6.5z" />
            </svg>
          )}
        </button>
        <button type="button" className="tm-salto" onClick={() => t.onIr(Math.min(D, t.segundo + 10))} disabled={t.cargando} aria-label="Adelante 10 segundos">
          <IconoSalto />
        </button>

        <div className="tm-bucle">
          {trozo ? (
            <>
              <div className="tecla-con-nombre">
                <button type="button" className={`tecla${t.repetir ? " on" : ""}`} aria-pressed={t.repetir} aria-label="Repetir el trozo" onClick={() => t.onRepetir(!t.repetir)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M17 4l3 3-3 3M20 7H8a4 4 0 0 0-4 4M7 20l-3-3 3-3M4 17h12a4 4 0 0 0 4-4" />
                  </svg>
                </button>
                <span className="mando-nombre" aria-hidden="true">
                  Bucle
                </span>
              </div>
              <button type="button" className="tm-quitar" onClick={() => t.onTrozo(null, null)} aria-label="Quitar el trozo">
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 6l12 12M18 6 6 18" />
                </svg>
              </button>
            </>
          ) : (
            <p className="tm-ayuda">Arrastra en la barra para elegir un trozo</p>
          )}
        </div>
      </div>
    </section>
  );
}

function IconoSalto({ atras }: { atras?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" style={atras ? { transform: "scaleX(-1)" } : undefined}>
      <path d="M19 12a7 7 0 1 1-2.05-4.95" />
      <path d="M19 4.5v3.5h-3.5" />
      <text x="12" y="15.2" textAnchor="middle" className="tm-salto-texto" style={atras ? { transform: "scaleX(-1)", transformOrigin: "12px 12px" } : undefined}>
        10
      </text>
    </svg>
  );
}
