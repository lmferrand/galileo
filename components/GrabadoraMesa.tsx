"use client";

// La grabadora de bobinas de lo alto de la Mesa (la foto public/mesa/grabadora.webp, 2000×787):
// las bobinas giran mientras suena la canción, el contador enseña por dónde va (minutos, segundos
// y fotogramas), las teclas mandan sobre el reproductor de Pistas (atrás y adelante 10 s, parar,
// tocar y pausa), la rueda naranja de la izquierda es la velocidad y la de la derecha mueve la
// canción. Abajo, 10 VU: los 8 canales de la mesa y la salida (L y R); sus agujas las mueve
// ConsolaMesa sin pasar por React (data-vu). De la foto se borraron las agujas pintadas y se alargó
// por debajo de los VU: ahí va la pantalla de la canción (la onda, para elegir un trozo y repetirlo)
// y los avisos (el mando que se mueve, las entradas). REC graba lo que tocas (ConsolaMesa). En la placa
// de metal del centro, el selector de canciones (PlacaCanciones).

import { useState, type CSSProperties, type ReactNode } from "react";
import { accesible, useArrastre, type PropsMando } from "./MandosMesa";
import TransporteMesa, { type Transporte } from "./TransporteMesa";
import PlacaCanciones, { type CancionesPlaca } from "./PlacaCanciones";
import { Posicion, usePosicion } from "@/lib/pistas/posicion";

export const ANCHO_CINTA = 2000;
export const ALTO_CINTA = 787;
/** Lo útil de la grabadora a lo ancho, sin los costados de madera: lo que la vista del móvil ajusta a la pantalla (ConsolaMesa) */
export const ZONA_CINTA = { x: 108, w: 1808 };
/** La franja que se añadió debajo de los VU, con la pantalla de la canción */
const PANTALLA: [number, number, number, number] = [128, 644, 1744, 100];

const BOBINAS = [
  { cx: 405.8, cy: 236.2, rx: 253, ry: 232, src: "/mesa/bobina-0.webp", lado: 510 },
  { cx: 1586.1, cy: 237.9, rx: 251.5, ry: 230, src: "/mesa/bobina-1.webp", lado: 507 },
];
/** La ventana del contador (los dígitos rojos se dibujan aquí) */
const CONTADOR = { x: 836, y: 54, w: 330, h: 70 };
type Caja = [number, number, number, number];
const TECLAS: Record<"atras" | "parar" | "tocar" | "pausa" | "grabar" | "adelante", Caja> = {
  atras: [708, 181, 85, 69],
  parar: [809, 181, 85, 69],
  tocar: [909, 181, 84, 69],
  pausa: [1008, 181, 85, 69],
  grabar: [1107, 181, 85, 69],
  adelante: [1206, 181, 85, 69],
};
/** El selector de canciones entero (la ventana, sus tres botones y las dos lentes): lo que se toca para acercarse */
const ZONA_PLACA: Caja = [790, 262, 420, 190];
/**
 * Lo que se ve con la vista acercada al selector (ConsolaMesa): las teclas y, debajo, el selector.
 * Por arriba corta bajo el rótulo del contador y por abajo sobre los VU; a los lados sobra sitio
 * para que el botón «?» de la esquina no pise la última tecla en los móviles pequeños.
 */
export const ZONA_SELECTOR = { x: 660, y: 166, w: 680, h: 322 };
/** Una posición que no se mueve: lo que ven el contador, el cabezal y la rueda con la grabadora fuera de la vista */
const PARADA = new Posicion();
const RUEDA_VELOCIDAD = { x: 735.8, y: 89.2, d: 60 };
const RUEDA_BUSCAR = { x: 1260.8, y: 88.6, d: 60 };

/** Los VU: cara (para recortar la aguja) y eje. 0–7 los canales de la mesa, 8 y 9 la salida L y R. */
export const VUS: { cara: Caja; eje: [number, number] }[] = [
  { cara: [128, 498, 159, 88], eje: [209, 598] },
  { cara: [313, 503, 155, 83], eje: [392, 598] },
  { cara: [493, 501, 151, 85], eje: [570, 598] },
  { cara: [669, 502, 150, 84], eje: [745.5, 598] },
  { cara: [844, 502, 150, 84], eje: [920.5, 598] },
  { cara: [1019, 502, 150, 84], eje: [1095.5, 598] },
  { cara: [1195, 503, 150, 83], eje: [1271.5, 598] },
  { cara: [1369, 502, 149, 84], eje: [1445, 598] },
  { cara: [1544, 502, 151, 84], eje: [1621, 598] },
  { cara: [1719, 500, 153, 86], eje: [1797, 598] },
];
/** Dónde está cada marca de la escala del VU (grados desde la vertical) */
const ESCALA_VU: [number, number][] = [
  [-22, -46],
  [-20, -40.2],
  [-10, -26.4],
  [-5, -13.3],
  [-3, 0.2],
  [-1, 12.3],
  [0, 17.8],
  [1, 28.7],
  [3, 42.8],
  [4, 47],
];
export const VU_REPOSO = ESCALA_VU[0][1];
/**
 * El ángulo de la aguja para un pico (0–1). 0 VU = −3 dBFS: lo rojo (de 0 a +3) es que está a
 * punto de saturar; arriba del todo, satura.
 */
export function anguloVu(pico: number): number {
  const vu = 20 * Math.log10(Math.max(pico, 1e-5)) + 3;
  if (vu <= ESCALA_VU[0][0]) return ESCALA_VU[0][1];
  for (let i = 1; i < ESCALA_VU.length; i++) {
    const [v1, a1] = ESCALA_VU[i];
    if (vu <= v1) {
      const [v0, a0] = ESCALA_VU[i - 1];
      return a0 + ((vu - v0) / (v1 - v0)) * (a1 - a0);
    }
  }
  return ESCALA_VU[ESCALA_VU.length - 1][1];
}

// ---------- El contador: dígitos de siete segmentos ----------
const SEGMENTOS: Record<string, [number, number, number, number]> = {
  // [x1, y1, x2, y2]: horizontales (y1 = y2) o verticales (x1 = x2), en una celda de 24×44
  a: [3, 2, 21, 2],
  g: [3, 22, 21, 22],
  d: [3, 42, 21, 42],
  f: [2, 3, 2, 21],
  b: [22, 3, 22, 21],
  e: [2, 23, 2, 41],
  c: [22, 23, 22, 41],
};
const DIGITOS = ["abcdef", "bc", "abged", "abgcd", "fgbc", "afgcd", "afgedc", "abc", "abcdefg", "abcdfg"];
const G = 4.6; // grosor
function segmento([x1, y1, x2, y2]: [number, number, number, number]) {
  const h = G / 2;
  return y1 === y2
    ? `${x1},${y1} ${x1 + h},${y1 - h} ${x2 - h},${y1 - h} ${x2},${y1} ${x2 - h},${y1 + h} ${x1 + h},${y1 + h}`
    : `${x1},${y1} ${x1 + h},${y1 + h} ${x1 + h},${y2 - h} ${x1},${y2} ${x1 - h},${y2 - h} ${x1 - h},${y1 + h}`;
}
const POLIGONOS = Object.fromEntries(Object.entries(SEGMENTOS).map(([k, s]) => [k, segmento(s)]));
/** x de cada dígito dentro del contador (MM:SS:FF) y de los dos puntos */
const X_DIGITOS = [32, 70, 120, 158, 208, 246];
const X_PUNTOS = [104, 192];

/** Se repinta él solo mientras la canción avanza (lib/pistas/posicion) */
function Contador({ posicion }: { posicion: Posicion | null }) {
  const s = Math.max(0, usePosicion(posicion));
  const mm = Math.min(99, Math.floor(s / 60));
  const ss = Math.floor(s % 60);
  const ff = Math.floor((s % 1) * 30);
  const texto = `${String(mm).padStart(2, "0")}${String(ss).padStart(2, "0")}${String(ff).padStart(2, "0")}`;
  return (
    <svg className="gm-contador" viewBox={`0 0 ${CONTADOR.w} ${CONTADOR.h}`} style={enCaja([CONTADOR.x, CONTADOR.y, CONTADOR.w, CONTADOR.h])} aria-hidden="true">
      <g transform="translate(0 12) skewX(-7)">
        {X_DIGITOS.map((x, i) => {
          const encendidos = DIGITOS[Number(texto[i])];
          return (
            <g key={i} transform={`translate(${x} 0) scale(1.05)`}>
              {Object.entries(POLIGONOS).map(([k, p]) => (
                <polygon key={k} points={p} className={encendidos.includes(k) ? "gm-seg on" : "gm-seg"} />
              ))}
            </g>
          );
        })}
        {X_PUNTOS.map((x) => (
          <g key={x} className="gm-seg on">
            <rect x={x} y={13} width={4.5} height={4.5} rx={1} />
            <rect x={x - 2} y={30} width={4.5} height={4.5} rx={1} />
          </g>
        ))}
      </g>
    </svg>
  );
}

function RuedaNaranja({ r, p, giro }: { r: typeof RUEDA_VELOCIDAD; p: PropsMando; giro?: number }) {
  const manejo = useArrastre(p, () => (giro === undefined ? 150 : 600));
  const caja = r.d + 28;
  const frac = (p.valor - p.min) / (p.max - p.min);
  const grados = giro ?? -135 + 270 * frac;
  return (
    <div className="mf-mando gm-rueda" style={{ left: r.x - caja / 2, top: r.y - caja / 2, width: caja, height: caja }} {...accesible(p)} {...manejo}>
      <span className="mf-rueda mf-oro" style={{ left: caja / 2, top: caja / 2, "--d": `${r.d}px`, "--giro": `${grados}deg` } as CSSProperties} aria-hidden="true">
        <span className="mf-tapa">
          <span className="mf-raya" />
        </span>
      </span>
    </div>
  );
}

const enCaja = ([x, y, w, h]: Caja): CSSProperties => ({ left: x, top: y, width: w, height: h });

/** La rueda de mover la canción: gira con ella (se repinta ella sola, lib/pistas/posicion) */
function RuedaBuscar({ t, sin }: { t: Transporte | null; sin: boolean }) {
  const segundo = usePosicion(t?.posicion ?? null);
  return (
    <RuedaNaranja
      r={RUEDA_BUSCAR}
      giro={segundo * 6}
      p={{
        nombre: "Mover la canción",
        valor: Math.round(segundo * 2) / 2,
        min: 0,
        max: Math.max(1, t?.duracion ?? 1),
        paso: 0.5,
        porDefecto: 0,
        ver: (v) => `${Math.floor(v / 60)}:${String(Math.floor(v % 60)).padStart(2, "0")}`,
        onCambio: (v) => t?.onIr(v),
        desactivado: sin,
      }}
    />
  );
}

interface Props {
  escala: number;
  /** El reproductor de la canción; sin él (la Mesa sin canción) la grabadora está parada */
  t: Transporte | null;
  /** Lo que enseña la pantalla en lugar de la ayuda (el mando que se mueve, las entradas…) */
  aviso: string | null;
  /** REC: grabar lo que tocas (y pararlo) */
  rec: { grabando: boolean; ocupado: boolean; onPulsar: () => void };
  /** Sin canción, mientras se graba, el contador cuenta lo grabado */
  contador: Posicion | null;
  /** Hay una toma: abrirla (escuchar, guardar, borrar) */
  toma: (() => void) | null;
  /** Las canciones para el selector de la placa (sin ellas, mientras se leen: «Sin cinta») */
  canciones?: CancionesPlaca;
  /** La lente de la rueda dentada de la placa: organizar las carpetas */
  onOrganizar?: () => void;
  /** Lo que se va eligiendo en la placa se enseña en la pantalla */
  alLeer?: (donde: string, texto: string) => void;
  /** La tecla del metrónomo de la Mesa: su tempo, si suena y abrir su hoja */
  metronomo?: { texto: string; on: boolean; onAbrir: () => void };
  /** La tecla «Bucle» abre su hoja */
  onBucle?: () => void;
  /** Con la grabadora entera en el móvil: tocar el selector de canciones acerca la vista a él */
  alAcercarPlaca?: () => void;
  /**
   * La grabadora no está a la vista (móvil, con la mesa de cerca): las bobinas, el contador, el
   * cabezal y la rueda dejan de moverse. Mantenerlos vivos sin verse le costaba al móvil buena parte
   * de cada fotograma.
   */
  quieta?: boolean;
}

export default function GrabadoraMesa({ escala, t: tVivo, aviso, rec, contador, toma, canciones, metronomo, onOrganizar, alLeer, onBucle, alAcercarPlaca, quieta = false }: Props) {
  // (quieta: todo lo que sigue a la canción mira una posición que no cambia)
  const t = quieta && tVivo ? { ...tVivo, posicion: PARADA } : tVivo;
  // Al ir atrás o adelante, las bobinas corren un momento
  const [corriendo, setCorriendo] = useState<"atras" | "adelante" | null>(null);
  const [fin, setFin] = useState<ReturnType<typeof setTimeout> | null>(null);
  const correr = (hacia: "atras" | "adelante") => {
    if (fin) clearTimeout(fin);
    setCorriendo(hacia);
    setFin(setTimeout(() => setCorriendo(null), 650));
  };
  const sin = !t || t.cargando;
  const D = Math.max(1, t?.duracion ?? 1);
  // ¿Ha avanzado ya la canción? (solo cambia al empezar o al volver al principio)
  const empezada = usePosicion(t?.posicion ?? null, (s) => s > 0.05);
  const teclaToma: ReactNode = toma ? (
    <button type="button" className="tecla pc-tecla gm-tecla-toma" onClick={toma} aria-label="Tu toma: escucharla, guardarla o borrarla">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="6" width="18" height="12" rx="2" />
        <circle cx="8.5" cy="12" r="2" />
        <circle cx="15.5" cy="12" r="2" />
        <path d="M8.5 14h7" />
      </svg>
    </button>
  ) : null;
  // El metrónomo: un metrónomo de pirámide con su tempo debajo, junto a las teclas de la pantalla
  const teclaMetro: ReactNode = metronomo ? (
    <button
      type="button"
      className={`tecla pc-tecla gm-tecla-metro${metronomo.on ? " on" : ""}`}
      onClick={metronomo.onAbrir}
      aria-label={`Metrónomo, ${metronomo.texto} por minuto${metronomo.on ? ", sonando" : ""}`}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M8.6 2.8h6.8l3.8 18.4H4.8z" />
        <path d="M6.2 16.4h11.6" />
        <path d="M12 16.4 16.2 5.6" />
      </svg>
      <span className="gm-metro-bpm">{metronomo.texto}</span>
    </button>
  ) : null;
  const parada = !!t && !t.tocando && empezada;
  const clase = `gm${t?.tocando ? " tocando" : ""}${corriendo ? ` corre-${corriendo}` : ""}${quieta ? " quieta" : ""}`;
  const vuelta = `${2.6 / Math.max(0.5, t?.velocidad ?? 1)}s`;

  // Tocar vale también mientras la canción carga: se queda apuntado y suena en cuanto esté lista
  const espera = !!t?.cargando && !!t.esperaTocar;
  const tecla = (k: keyof typeof TECLAS, etiqueta: string, on: boolean, accion: () => void) => (
    <button
      type="button"
      className={`gm-tecla gm-${k}${on ? " on" : ""}${k === "tocar" && espera ? " espera" : ""}`}
      style={enCaja(TECLAS[k])}
      aria-label={etiqueta}
      aria-pressed={k === "tocar" || k === "pausa" ? on : undefined}
      disabled={k === "tocar" ? !t : sin}
      onClick={accion}
    />
  );

  return (
    <div className="gm-caja" style={{ width: ANCHO_CINTA * escala, height: ALTO_CINTA * escala }}>
      <div className={clase} style={{ width: ANCHO_CINTA, height: ALTO_CINTA, transform: `scale(${escala})`, "--vuelta": vuelta } as CSSProperties}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="mf-foto" src="/mesa/grabadora.webp" alt="" width={ANCHO_CINTA} height={ALTO_CINTA} draggable={false} />
        {BOBINAS.map((b) => (
          <span
            key={b.src}
            className="gm-bobina"
            style={{ left: b.cx - b.lado / 2, top: b.cy - b.lado / 2, width: b.lado, height: b.lado, transform: `scaleY(${b.ry / b.rx})` }}
            aria-hidden="true"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={b.src} alt="" width={b.lado} height={b.lado} draggable={false} />
          </span>
        ))}
        <Contador posicion={quieta ? PARADA : (contador ?? t?.posicion ?? null)} />

        {tecla("atras", "Atrás 10 segundos", false, () => {
          if (!t) return;
          t.onIr(Math.max(0, t.posicion.leer() - 10));
          correr("atras");
        })}
        {tecla("parar", "Parar y volver al principio", false, () => {
          if (!t) return;
          if (t.tocando) t.onAlternar();
          t.onIr(t.repetir && t.desde !== null ? t.desde : 0);
          correr("atras");
        })}
        {tecla("tocar", t?.cargando ? (espera ? "Cargando: sonará en cuanto esté lista (toca para quitarlo)" : "Tocar en cuanto cargue") : "Tocar", !!t?.tocando, () => {
          if (t && !t.tocando) t.onAlternar();
        })}
        {tecla("pausa", "Pausa", parada, () => {
          if (t?.tocando) t.onAlternar();
        })}
        {/* REC: graba lo que tocas (parpadea en rojo mientras graba) */}
        <button
          type="button"
          className={`gm-tecla gm-grabar${rec.grabando ? " on" : ""}`}
          style={enCaja(TECLAS.grabar)}
          aria-label={rec.grabando ? "Parar de grabar" : "Grabar lo que tocas"}
          aria-pressed={rec.grabando}
          disabled={rec.ocupado}
          onClick={rec.onPulsar}
        />
        {tecla("adelante", "Adelante 10 segundos", false, () => {
          if (!t) return;
          t.onIr(Math.min(D, t.posicion.leer() + 10));
          correr("adelante");
        })}

        <RuedaNaranja
          r={RUEDA_VELOCIDAD}
          p={{
            nombre: "Velocidad de la canción (sin cambiar el tono)",
            valor: t?.velocidad ?? 1,
            min: t?.velocidadMin ?? 0.5,
            max: t?.velocidadMax ?? 1,
            paso: 0.05,
            porDefecto: 1,
            ver: (v) => `${Math.round(v * 100)} %`,
            onCambio: (v) => t?.onVelocidad(v),
            desactivado: sin,
          }}
        />
        <RuedaBuscar t={t} sin={sin} />

        <PlacaCanciones canciones={canciones} onOrganizar={onOrganizar} alLeer={alLeer} />
        {alAcercarPlaca && (
          <button type="button" className="gm-placa-acercar" style={enCaja(ZONA_PLACA)} aria-label="Acercar el selector de canciones" onClick={alAcercarPlaca} />
        )}

        {/* Debajo de los VU, la pantalla de la canción (o solo los avisos, sin canción) */}
        <div className="gm-pantalla" style={enCaja(PANTALLA)}>
          {t ? (
            <TransporteMesa
              t={t}
              conCinta
              aviso={aviso}
              onBucle={onBucle}
              extra={
                <>
                  {teclaMetro}
                  {teclaToma}
                </>
              }
            />
          ) : (
            <div className="gm-sin-cancion">
              {teclaMetro}
              {teclaToma}
              <div className="pc-pantalla gm-solo-aviso" role="status">
                <span>{aviso}</span>
              </div>
            </div>
          )}
        </div>

        {/* Las agujas de los VU (las mueve ConsolaMesa) */}
        <svg className="mf-dibujo" viewBox={`0 0 ${ANCHO_CINTA} ${ALTO_CINTA}`} aria-hidden="true">
          <defs>
            {VUS.map((v, i) => (
              <clipPath key={i} id={`gm-vu-${i}`}>
                <rect x={v.cara[0]} y={v.cara[1]} width={v.cara[2]} height={v.eje[1] - 13 - v.cara[1]} />
              </clipPath>
            ))}
          </defs>
          {VUS.map((v, i) => (
            <g key={i} clipPath={`url(#gm-vu-${i})`}>
              <g data-vu={i} transform={`rotate(${VU_REPOSO} ${v.eje[0]} ${v.eje[1]})`}>
                <line x1={v.eje[0] + 1.6} y1={v.eje[1] - 14} x2={v.eje[0] + 1.6} y2={v.eje[1] - 84} className="gm-aguja-sombra" />
                <line x1={v.eje[0]} y1={v.eje[1] - 14} x2={v.eje[0]} y2={v.eje[1] - 86} className="gm-aguja" />
              </g>
            </g>
          ))}
        </svg>
      </div>
    </div>
  );
}
