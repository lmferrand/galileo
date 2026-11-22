"use client";

// El selector de canciones de la placa de metal de la grabadora (entre las teclas y los mandos):
// una ventana con luz por detrás, como el dial de una radio antigua, y dentro un tambor que gira al
// arrastrarlo (o con la rueda del ratón y las flechas). Lo que queda entre las dos flechitas rojas
// es lo elegido. Va por carpetas (lib/pistas/grupos: álbumes, proyectos, artistas…): primero se
// elige la carpeta y, dentro, la canción.
//  - Los tres botones redondos de debajo: «anterior», «abrir la carpeta / poner la canción» (se
//    enciende cuando hay algo que hacer) y «siguiente». Tocar la ventana hace lo mismo que el del centro.
//  - Las dos lentes de los lados (sobre los casquillos de latón de la foto): a la izquierda, volver a
//    las carpetas; a la derecha, organizar las carpetas (CarpetasMesa: crear, renombrar, ordenar, mover).
// Lo que es un toque o un arrastre se mide en píxeles de la pantalla: en el móvil la grabadora va
// pequeña y, medido en la foto, cualquier temblor del dedo era un arrastre y no se elegía nada.
// Sin canciones (mientras la Mesa las lee) la luz está apagada: «Sin cinta».
// Medidas en píxeles de la foto (public/mesa/grabadora.webp, 2000×787).

import { useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type WheelEvent } from "react";
import type { Cancion } from "@/lib/pistas/tipos";
import { agrupar, leerGrupos, tituloEn, type Grupo } from "@/lib/pistas/grupos";

export interface CancionesPlaca {
  lista: Cancion[];
  /** La que suena en la Mesa ("" si no hay) */
  actual: string;
  onElegir: (c: Cancion) => void;
  /** Han cambiado las carpetas (o de carpeta las canciones): hay que volver a leerlas */
  onCambiadas?: () => void;
}

interface Props {
  canciones?: CancionesPlaca;
  /** Abrir la hoja para organizar las carpetas */
  onOrganizar?: () => void;
  /** Enseñar en la pantalla de la grabadora lo que se va eligiendo (la ventana es pequeña) */
  alLeer?: (donde: string, texto: string) => void;
}

/** La ventana, dentro de la placa (deja a la vista los cuatro tornillos de las esquinas) */
const VENTANA = { x: 849, y: 281, w: 302, h: 88 };
/** Los tres botones redondos de debajo de la placa */
const BOTONES = [929, 1000, 1070].map((x) => ({ x, y: 411 }));
/** Los casquillos de latón de los lados: volver a las carpetas y organizarlas */
const LENTES = { volver: { x: 835, y: 412 }, organizar: { x: 1165, y: 412 } };
const LADO_BOTON = 62;
/** El tambor: alto de cada título y cuánto gira de uno a otro */
const FILA = 34;
const RADIO = 52;
const PASO = (36 * Math.PI) / 180;
const CENTRO = VENTANA.h / 2;
/** Lo que se puede mover el dedo (px de pantalla) y seguir siendo un toque */
const TOQUE_PX = 10;

/** Lo que enseña una fila del tambor: una carpeta o una canción */
interface Fila {
  clave: string;
  texto: string;
  carpeta?: Grupo;
  cancion?: Cancion;
}

const cuantas = (n: number) => (n === 1 ? "1 canción" : `${n} canciones`);

export default function PlacaCanciones({ canciones, onOrganizar, alLeer }: Props) {
  // (la lista llega igual en cada fotograma de la canción: solo se agrupa cuando cambia)
  const fuente = canciones?.lista;
  const actual = canciones?.actual ?? "";
  const grupos = useMemo(() => (fuente ? agrupar(fuente, leerGrupos()) : []), [fuente]);
  // Al empezar: dentro de la carpeta de la canción que suena, con ella en el centro
  const [inicio] = useState(() => {
    const g = grupos.find((x) => x.canciones.some((c) => c.id === actual));
    return { carpeta: g?.nombre ?? null, pos: g ? Math.max(0, g.canciones.findIndex((c) => c.id === actual)) : 0 };
  });
  // La carpeta abierta (null: se ven las carpetas)
  const [carpeta, setCarpeta] = useState<string | null>(inicio.carpeta);
  const abierta = carpeta === null ? null : (grupos.find((g) => g.nombre === carpeta) ?? null);
  const filasTodas = useMemo<Fila[]>(
    () =>
      abierta
        ? abierta.canciones.map((c) => ({ clave: c.id, texto: tituloEn(c, abierta.nombre), cancion: c }))
        : grupos.map((g) => ({ clave: `carpeta:${g.nombre}`, texto: g.nombre, carpeta: g })),
    [abierta, grupos],
  );
  // Por dónde va el tambor (con decimales mientras gira)
  const [posLibre, setPos] = useState(inicio.pos);
  // Si la canción se pone desde otro sitio (el disco de Galileo del escritorio), el tambor va a ella:
  // entra en su carpeta y la deja en el centro. (Puesta desde aquí ya estaba ahí: no se mueve nada.)
  const [mostrada, setMostrada] = useState(actual);
  if (actual !== mostrada) {
    const g = actual ? grupos.find((x) => x.canciones.some((c) => c.id === actual)) : undefined;
    // (si aún no está en la lista —se acaba de bajar—, se espera a que llegue)
    if (!actual || g) setMostrada(actual);
    if (g) {
      setCarpeta(g.nombre);
      setPos(g.canciones.findIndex((c) => c.id === actual));
    }
  }
  const anim = useRef(0);
  const arrastre = useRef<{ id: number; y0: number; pos0: number; movido: boolean } | null>(null);
  const ultimo = filasTodas.length - 1;
  // (si la lista se ha acortado —se movieron canciones—, el tambor no se queda en el aire)
  const pos = Math.min(posLibre, Math.max(0, ultimo) + 0.4);
  const sel = Math.max(0, Math.min(ultimo, Math.round(pos)));
  const elegida = filasTodas[sel] as Fila | undefined;
  const encendida = !!canciones && grupos.length > 0;
  const hay = filasTodas.length > 0;
  const otra = !!elegida?.cancion && elegida.cancion.id !== actual;
  const sePuede = !!elegida?.carpeta || otra;

  useEffect(() => () => cancelAnimationFrame(anim.current), []);

  // La pantalla de la grabadora dice lo que queda en el centro (solo al girar, no al abrir la Mesa)
  const dicho = useRef(-1);
  const decir = (i: number) => {
    const f = filasTodas[i];
    if (!f || !alLeer || dicho.current === i) return;
    dicho.current = i;
    if (f.carpeta) alLeer("Carpeta", `${f.texto} · ${cuantas(f.carpeta.canciones.length)}`);
    else if (f.cancion) alLeer("Canción", f.cancion.nombre);
  };

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
      decir(fin);
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

  const entrar = (g: Grupo) => {
    cancelAnimationFrame(anim.current);
    dicho.current = -1;
    setCarpeta(g.nombre);
    setPos(Math.max(0, g.canciones.findIndex((c) => c.id === actual)));
    alLeer?.("Carpeta", `${g.nombre} · ${g.canciones.length ? cuantas(g.canciones.length) : "vacía"}`);
  };
  const volver = () => {
    if (!abierta && carpeta === null) return;
    cancelAnimationFrame(anim.current);
    dicho.current = -1;
    setPos(Math.max(0, grupos.findIndex((g) => g.nombre === carpeta)));
    setCarpeta(null);
    alLeer?.("Carpetas", "elige una y ábrela");
  };
  // Un destello en la ventana al poner una canción o abrir una carpeta (se nota que lo ha cogido)
  const [destello, setDestello] = useState(0);
  /** Lo del centro: abrir la carpeta o poner la canción */
  const poner = () => {
    if (!elegida || !canciones) return;
    if (elegida.carpeta) {
      setDestello((d) => d + 1);
      return entrar(elegida.carpeta);
    }
    if (!otra || !elegida.cancion) return;
    setDestello((d) => d + 1);
    canciones.onElegir(elegida.cancion);
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
    // En píxeles de la pantalla: un toque puede temblar un poco sin ser un arrastre
    const dy = e.clientY - a.y0;
    if (Math.abs(dy) > TOQUE_PX) a.movido = true;
    if (!a.movido) return;
    // Una fila por cada FILA de la foto, pero nunca menos de 18 px de dedo
    const escala = e.currentTarget.getBoundingClientRect().height / VENTANA.h || 1;
    const porFila = Math.max(18, FILA * 0.9 * escala);
    const nueva = Math.max(-0.4, Math.min(ultimo + 0.4, a.pos0 - dy / porFila));
    setPos(nueva);
    decir(limitar(Math.round(nueva)));
  };
  const alSoltar = (e: PointerEvent<HTMLDivElement>) => {
    const a = arrastre.current;
    if (!a || a.id !== e.pointerId) return;
    arrastre.current = null;
    if (a.movido) return irA(pos);
    // Un toque: lo del centro
    poner();
  };
  const rueda = useRef(0);
  const alRueda = (e: WheelEvent<HTMLDivElement>) => {
    if (!hay) return;
    rueda.current += e.deltaY;
    if (Math.abs(rueda.current) >= 40) {
      irA(sel + Math.sign(rueda.current));
      rueda.current = 0;
    }
  };
  const alTecla = (e: KeyboardEvent<HTMLDivElement>) => {
    const mover = { ArrowUp: -1, ArrowDown: 1, PageUp: -3, PageDown: 3, Home: -Infinity, End: Infinity }[e.key];
    if (mover !== undefined) {
      e.preventDefault();
      irA(Number.isFinite(mover) ? sel + mover : mover < 0 ? 0 : ultimo);
    } else if (e.key === "Enter" || e.key === " " || e.key === "ArrowRight") {
      e.preventDefault();
      poner();
    } else if ((e.key === "ArrowLeft" || e.key === "Backspace") && carpeta !== null) {
      e.preventDefault();
      volver();
    }
  };

  // Solo se pintan las filas que caen en la ventana
  const filas: { f: Fila; i: number; d: number }[] = [];
  for (let i = Math.max(0, Math.floor(pos) - 2); i <= Math.min(ultimo, Math.ceil(pos) + 2); i++) filas.push({ f: filasTodas[i], i, d: i - pos });

  return (
    <>
      <div className={`gm-placa${encendida ? " encendida" : ""}`} style={enCaja(VENTANA.x, VENTANA.y, VENTANA.w, VENTANA.h)}>
        {destello > 0 && <span key={destello} className="gm-placa-destello" aria-hidden="true" />}
        <div
          className="gm-placa-tambor"
          role="listbox"
          aria-label={
            !encendida
              ? "Sin canciones"
              : abierta
                ? `Canciones de «${abierta.nombre}»: gira para elegir y toca para poner la del centro`
                : "Carpetas: gira para elegir y toca para abrir la del centro"
          }
          aria-activedescendant={elegida ? `gm-placa-${sel}` : undefined}
          tabIndex={hay ? 0 : -1}
          onPointerDown={alBajar}
          onPointerMove={alMover}
          onPointerUp={alSoltar}
          onPointerCancel={alSoltar}
          onWheel={alRueda}
          onKeyDown={alTecla}
        >
          {hay ? (
            filas.map(({ f, i, d }) => {
              const ang = Math.max(-1.45, Math.min(1.45, d * PASO));
              const cos = Math.cos(ang);
              const suena = !!f.cancion && f.cancion.id === actual;
              // La carpeta lleva su dibujo delante y cuántas canciones tiene detrás
              const { letra, sx } = medidaTitulo(f.texto, suena ? 18 : f.carpeta ? 34 + 13 * String(f.carpeta.canciones.length).length : 0);
              return (
                <div
                  key={f.clave}
                  id={`gm-placa-${i}`}
                  role="option"
                  aria-selected={i === sel}
                  aria-label={f.carpeta ? `Carpeta ${f.texto}, ${cuantas(f.carpeta.canciones.length)}` : undefined}
                  className={`gm-placa-fila${suena ? " suena" : ""}`}
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
                  <span>
                    {f.carpeta && (
                      <svg className="gm-placa-ico" viewBox="0 0 24 24" aria-hidden="true">
                        <path d="M2.5 5.5h7l2.2 2.6h9.8v11.4h-19z" />
                      </svg>
                    )}
                    {f.texto}
                    {f.carpeta && <small>{f.carpeta.canciones.length}</small>}
                  </span>
                </div>
              );
            })
          ) : (
            <div className="gm-placa-vacia">{!canciones ? "Sin cinta" : abierta ? "Carpeta vacía" : "Sin canciones"}</div>
          )}
        </div>
        {/* Las flechitas rojas del dial, el cristal y su reflejo */}
        <span className="gm-placa-aguja izq" aria-hidden="true" />
        <span className="gm-placa-aguja der" aria-hidden="true" />
        <span className="gm-placa-cristal" aria-hidden="true" />
      </div>

      <BotonPlaca n={0} etiqueta={abierta ? "Canción anterior" : "Carpeta anterior"} onClick={() => irA(sel - 1)} activo={hay && sel > 0} />
      <BotonPlaca
        n={1}
        etiqueta={elegida?.carpeta ? `Abrir la carpeta «${elegida.texto}»` : elegida?.cancion ? `Poner «${elegida.cancion.nombre}»` : "Poner la canción"}
        onClick={poner}
        activo={sePuede}
        clase={sePuede ? "lista" : ""}
      />
      <BotonPlaca n={2} etiqueta={abierta ? "Canción siguiente" : "Carpeta siguiente"} onClick={() => irA(sel + 1)} activo={hay && sel < ultimo} />

      {/* Las lentes de los lados: volver a las carpetas y organizarlas */}
      <button
        type="button"
        className={`gm-placa-lente${carpeta !== null && encendida ? " on" : ""}`}
        style={enCaja(LENTES.volver.x - LADO_BOTON / 2, LENTES.volver.y - LADO_BOTON / 2, LADO_BOTON, LADO_BOTON)}
        aria-label="Volver a las carpetas"
        disabled={carpeta === null || !encendida}
        onClick={volver}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M14.5 5.5 8 12l6.5 6.5" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
      <button
        type="button"
        className={`gm-placa-lente${canciones && onOrganizar ? " on" : ""}`}
        style={enCaja(LENTES.organizar.x - LADO_BOTON / 2, LENTES.organizar.y - LADO_BOTON / 2, LADO_BOTON, LADO_BOTON)}
        aria-label="Organizar las carpetas: crear, cambiar el nombre, ordenar y mover canciones"
        disabled={!canciones || !onOrganizar}
        onClick={onOrganizar}
      >
        {/* Una rueda dentada */}
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="12" cy="12" r="8.2" fill="none" stroke="currentColor" strokeWidth="3.6" strokeDasharray="3.22 3.22" />
          <circle cx="12" cy="12" r="5.4" fill="none" stroke="currentColor" strokeWidth="3.2" />
        </svg>
      </button>
    </>
  );
}

/**
 * Para que quepan los títulos largos: primero se estrechan las letras (como la rotulación condensada
 * de los diales antiguos, hasta el 78 %) y, si aún no caben, se hacen más pequeñas. Lo que siga sin
 * caber acaba en «…». El ancho se calcula a ojo: la Bodoni en negrita mide unos 0,55 em por letra.
 * `ocupado`: lo que ya ocupan el piloto de la que suena o el dibujo y el número de la carpeta (px).
 */
function medidaTitulo(nombre: string, ocupado: number): { letra: number; sx: number } {
  const hueco = VENTANA.w - 52 - ocupado;
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
