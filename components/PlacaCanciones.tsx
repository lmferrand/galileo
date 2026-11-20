"use client";

// El selector de canciones de la placa de metal de la grabadora (entre las teclas y los mandos):
// una ventana con luz por detrás, como el dial de una radio antigua, y dentro un tambor con los
// títulos que gira al arrastrarlo (o con la rueda del ratón y las flechas). La que queda entre las
// dos flechitas rojas es la elegida. Los tres botones redondos de debajo de la placa son «anterior»,
// «poner esta» (se enciende cuando la elegida no es la que suena) y «siguiente». Tocar la del centro
// también la pone. Sin canciones (la Mesa del afinador) la luz está apagada: «Sin cinta».
// Medidas en píxeles de la foto (public/mesa/grabadora.webp, 2000×787).

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import type { Cancion } from "@/lib/pistas/tipos";
import { agrupar, leerGrupos } from "@/lib/pistas/grupos";

export interface CancionesPlaca {
  lista: Cancion[];
  /** La que suena en la Mesa */
  actual: string;
  onElegir: (c: Cancion) => void;
}

/** La ventana, dentro de la placa (deja a la vista los cuatro tornillos de las esquinas) */
const VENTANA = { x: 849, y: 281, w: 302, h: 88 };
/** Los tres botones redondos de debajo de la placa */
const BOTONES = [929, 1000, 1070].map((x) => ({ x, y: 411 }));
const LADO_BOTON = 62;
/** El tambor: alto de cada título y cuánto gira de uno a otro */
const FILA = 34;
const RADIO = 52;
const PASO = (36 * Math.PI) / 180;
const CENTRO = VENTANA.h / 2;

export default function PlacaCanciones({ canciones }: { canciones?: CancionesPlaca }) {
  // En el orden del selector de pistas: por grupos (artistas, álbumes…) y dentro por título
  // (la lista llega igual en cada fotograma de la canción: solo se reordena cuando cambia)
  const fuente = canciones?.lista;
  const lista = useMemo(() => (fuente ? agrupar(fuente, leerGrupos()).flatMap((g) => g.canciones) : []), [fuente]);
  const indiceActual = canciones ? lista.findIndex((c) => c.id === canciones.actual) : -1;
  // Por dónde va el tambor (con decimales mientras gira)
  const [pos, setPos] = useState(Math.max(0, indiceActual));
  const anim = useRef(0);
  const arrastre = useRef<{ id: number; y0: number; pos0: number; movido: boolean } | null>(null);
  const ultimo = lista.length - 1;
  const elegida = lista[Math.round(pos)] as Cancion | undefined;
  const hay = lista.length > 0;
  const otra = !!elegida && elegida.id !== canciones?.actual;

  useEffect(() => () => cancelAnimationFrame(anim.current), []);

  const limitar = (v: number) => Math.max(0, Math.min(ultimo, v));
  /** Gira el tambor hasta una fila, con suavidad */
  const irA = (destino: number) => {
    const fin = limitar(Math.round(destino));
    cancelAnimationFrame(anim.current);
    const desde = pos;
    if (Math.round(desde) !== fin) {
      try {
        navigator.vibrate?.(4);
      } catch {
        /* sin vibración */
      }
    }
    const t0 = performance.now();
    const ms = Math.min(320, 140 + Math.abs(fin - desde) * 40);
    const paso = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      const e = 1 - (1 - k) ** 3;
      setPos(desde + (fin - desde) * e);
      if (k < 1) anim.current = requestAnimationFrame(paso);
    };
    anim.current = requestAnimationFrame(paso);
  };
  const poner = () => {
    if (elegida && canciones && otra) canciones.onElegir(elegida);
  };

  // Arrastrar el tambor: hacia arriba, las siguientes
  const alBajar = (e: PointerEvent<HTMLDivElement>) => {
    if (!hay) return;
    cancelAnimationFrame(anim.current);
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastre.current = { id: e.pointerId, y0: e.clientY, pos0: pos, movido: false };
  };
  const alMover = (e: PointerEvent<HTMLDivElement>) => {
    const a = arrastre.current;
    if (!a || a.id !== e.pointerId) return;
    // La ventana va escalada: se pasa a píxeles de la foto
    const escala = e.currentTarget.getBoundingClientRect().height / VENTANA.h || 1;
    const dy = (e.clientY - a.y0) / escala;
    if (Math.abs(dy) > 5) a.movido = true;
    if (a.movido) setPos(Math.max(-0.4, Math.min(ultimo + 0.4, a.pos0 - dy / (FILA * 0.9))));
  };
  const alSoltar = (e: PointerEvent<HTMLDivElement>) => {
    const a = arrastre.current;
    if (!a || a.id !== e.pointerId) return;
    arrastre.current = null;
    if (a.movido) return irA(pos);
    // Un toque: en el centro la pone; arriba o abajo, gira hasta esa
    const r = e.currentTarget.getBoundingClientRect();
    const y = ((e.clientY - r.top) / r.height) * VENTANA.h - CENTRO;
    if (Math.abs(y) < 15) poner();
    else irA(Math.round(pos) + Math.sign(y));
  };
  const rueda = useRef(0);
  const alRueda = (e: WheelEvent<HTMLDivElement>) => {
    if (!hay) return;
    rueda.current += e.deltaY;
    if (Math.abs(rueda.current) >= 40) {
      irA(Math.round(pos) + Math.sign(rueda.current));
      rueda.current = 0;
    }
  };
  const alTecla = (e: KeyboardEvent<HTMLDivElement>) => {
    const mover = { ArrowUp: -1, ArrowDown: 1, PageUp: -3, PageDown: 3, Home: -Infinity, End: Infinity }[e.key];
    if (mover !== undefined) {
      e.preventDefault();
      irA(Number.isFinite(mover) ? Math.round(pos) + mover : mover < 0 ? 0 : ultimo);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      poner();
    }
  };

  // Solo se pintan los títulos que caen en la ventana
  const filas: { c: Cancion; i: number; d: number }[] = [];
  for (let i = Math.max(0, Math.floor(pos) - 2); i <= Math.min(ultimo, Math.ceil(pos) + 2); i++) filas.push({ c: lista[i], i, d: i - pos });


  return (
    <>
      <div className={`gm-placa${hay ? " encendida" : ""}`} style={enCaja(VENTANA.x, VENTANA.y, VENTANA.w, VENTANA.h)}>
        <div
          className="gm-placa-tambor"
          role="listbox"
          aria-label={hay ? "Canciones: gira para elegir y toca la del centro para ponerla" : "Sin canciones"}
          aria-activedescendant={elegida ? `gm-placa-${Math.round(pos)}` : undefined}
          tabIndex={hay ? 0 : -1}
          onPointerDown={alBajar}
          onPointerMove={alMover}
          onPointerUp={alSoltar}
          onPointerCancel={alSoltar}
          onWheel={alRueda}
          onKeyDown={alTecla}
        >
          {hay ? (
            filas.map(({ c, i, d }) => {
              const ang = Math.max(-1.45, Math.min(1.45, d * PASO));
              const cos = Math.cos(ang);
              const { letra, sx } = medidaTitulo(c.nombre, c.id === canciones?.actual);
              return (
                <div
                  key={c.id}
                  id={`gm-placa-${i}`}
                  role="option"
                  aria-selected={i === Math.round(pos)}
                  className={`gm-placa-fila${c.id === canciones?.actual ? " suena" : ""}`}
                  style={
                    {
                      top: CENTRO - FILA / 2,
                      height: FILA,
                      transform: `translateY(${(RADIO * Math.sin(ang)).toFixed(2)}px) scaleY(${cos.toFixed(3)})`,
                      opacity: Math.max(0, cos * cos * 1.1 - 0.1).toFixed(3),
                      "--letra": `${letra}px`,
                      "--sx": sx,
                    } as CSSProperties
                  }
                >
                  <span>{c.nombre}</span>
                </div>
              );
            })
          ) : (
            <div className="gm-placa-vacia">{canciones ? "Sin canciones" : "Sin cinta"}</div>
          )}
        </div>
        {/* Las flechitas rojas del dial, el cristal y su reflejo */}
        <span className="gm-placa-aguja izq" aria-hidden="true" />
        <span className="gm-placa-aguja der" aria-hidden="true" />
        <span className="gm-placa-cristal" aria-hidden="true" />
      </div>
      <BotonPlaca n={0} etiqueta="Canción anterior" onClick={() => irA(Math.round(pos) - 1)} activo={hay && Math.round(pos) > 0} />
      <BotonPlaca n={1} etiqueta={elegida ? `Poner «${elegida.nombre}»` : "Poner la canción"} onClick={poner} activo={otra} clase={otra ? "lista" : ""} />
      <BotonPlaca n={2} etiqueta="Canción siguiente" onClick={() => irA(Math.round(pos) + 1)} activo={hay && Math.round(pos) < ultimo} />
    </>
  );
}

/**
 * Para que quepan los títulos largos: primero se estrechan las letras (como la rotulación condensada
 * de los diales antiguos, hasta el 78 %) y, si aún no caben, se hacen más pequeñas. Lo que siga sin
 * caber acaba en «…». El ancho se calcula a ojo: la Bodoni en negrita mide unos 0,55 em por letra.
 */
function medidaTitulo(nombre: string, conPiloto: boolean): { letra: number; sx: number } {
  const hueco = VENTANA.w - 52 - (conPiloto ? 18 : 0);
  const natural = nombre.length * 0.55 * 27;
  let sx = Math.min(1, hueco / natural);
  let letra = 27;
  if (sx < 0.78) {
    letra = Math.max(19, (27 * sx) / 0.78);
    sx = 0.78;
  }
  return { letra: Math.round(letra * 10) / 10, sx: Math.round(sx * 1000) / 1000 };
}

const enCaja = (x: number, y: number, w: number, h: number): CSSProperties => ({ left: x, top: y, width: w, height: h });

function BotonPlaca({ n, etiqueta, onClick, activo, clase = "" }: { n: number; etiqueta: string; onClick: () => void; activo: boolean; clase?: string }) {
  return (
    <button
      type="button"
      className={`gm-placa-boton ${clase}`}
      style={enCaja(BOTONES[n].x - LADO_BOTON / 2, BOTONES[n].y - LADO_BOTON / 2, LADO_BOTON, LADO_BOTON)}
      aria-label={etiqueta}
      disabled={!activo}
      onClick={onClick}
    />
  );
}
