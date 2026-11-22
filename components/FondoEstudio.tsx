"use client";

// La foto del estudio detrás del afinador y de Pistas. Al inclinar el móvil se
// desplaza y la pala se mueve un poco al revés: así parece que hay profundidad.
// En el iPhone hace falta permiso para leer la inclinación; se pide en un toque
// (ver pedirPermisoMovimiento). En pantallas apaisadas (PC, iPad tumbado) usa la
// foto horizontal si la hay. Los desplazamientos van en --gx y --gy del propio fondo, y la pala
// se mueve con su transform (nunca en <html>: recalcularía toda la página en cada fotograma).

import { useEffect, useRef, useState, type CSSProperties } from "react";

const MAX_X = 30; // px que se mueve la foto hacia los lados
const MAX_Y = 20;
const GRADOS = 24; // inclinación que da el máximo
/** Lo que tarda la foto nueva en fundirse sobre la anterior (como su animación, en globals.css) */
const MS_FUNDIDO = 620;

interface Capa {
  foto: string;
  fotoH: string;
}
const fotosDe = (c: Capa) => ({ "--foto": `url("${c.foto}")`, "--foto-h": `url("${c.fotoH}")` }) as CSSProperties;

type ConPermiso = typeof DeviceOrientationEvent & { requestPermission?: () => Promise<"granted" | "denied"> };

/** Hay que llamarlo dentro de un toque (el iPhone solo pregunta así). No espera la respuesta. */
export function pedirPermisoMovimiento() {
  try {
    const DOE = (typeof window !== "undefined" ? window.DeviceOrientationEvent : undefined) as ConPermiso | undefined;
    if (DOE?.requestPermission) {
      DOE.requestPermission()
        .then((r) => {
          if (r === "granted") window.dispatchEvent(new Event("clavija:movimiento"));
        })
        .catch(() => undefined);
    }
  } catch {
    /* sin giroscopio: el fondo se queda quieto */
  }
}

/**
 * `vertical`: la foto ya es vertical y no hace falta enseñarla entera a lo ancho.
 * `velo`: oscurecerla para que se lea texto encima (en el afinador va sin velo, solo desenfocada).
 * `fotoHorizontal`: la que se usa en pantallas apaisadas.
 * Si la foto cambia (en el afinador, al cambiar de instrumento), la nueva se funde sobre la anterior:
 * es la misma pieza y sigue moviéndose igual con el móvil (antes se quitaba y se ponía otra, de golpe).
 */
export default function FondoEstudio({
  foto,
  fotoHorizontal,
  vertical,
  velo = true,
}: {
  foto: string;
  fotoHorizontal?: string;
  vertical?: boolean;
  velo?: boolean;
}) {
  const caja = useRef<HTMLDivElement>(null);
  // La foto puesta y, mientras la nueva se funde, la anterior debajo
  const fotoH = fotoHorizontal ?? foto;
  const [puesta, setPuesta] = useState<Capa>({ foto, fotoH });
  const [anterior, setAnterior] = useState<Capa | null>(null);
  if (puesta.foto !== foto || puesta.fotoH !== fotoH) {
    setAnterior(puesta);
    setPuesta({ foto, fotoH });
  }
  useEffect(() => {
    if (!anterior) return;
    const t = setTimeout(() => setAnterior(null), MS_FUNDIDO + 80);
    return () => clearTimeout(t);
  }, [anterior]);

  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const el = caja.current;
    if (!el) return;

    let base: { x: number; y: number } | null = null;
    let objetivo = { x: 0, y: 0 };
    const actual = { x: 0, y: 0 };
    let raf = 0;

    const alGirar = (e: DeviceOrientationEvent) => {
      if (e.beta === null || e.gamma === null) return;
      // Con el móvil tumbado los ejes cambian.
      const angulo = (screen.orientation?.angle ?? 0) % 360;
      let x = e.gamma;
      let y = e.beta;
      if (angulo === 90) [x, y] = [e.beta, -e.gamma];
      else if (angulo === 270 || angulo === -90) [x, y] = [-e.beta, e.gamma];
      // Cómo lo sujetas se va tomando como el centro poco a poco: solo cuenta lo que lo mueves.
      if (!base) base = { x, y };
      base.x += (x - base.x) * 0.004;
      base.y += (y - base.y) * 0.004;
      const lim = (v: number) => Math.max(-1, Math.min(1, v / GRADOS));
      objetivo = { x: lim(x - base.x), y: lim(y - base.y) };
      if (!raf) raf = requestAnimationFrame(paso);
    };

    // Lo que se escribe va SOLO en las capas que se mueven: en <html> obligaba a recalcular la
    // página entera en cada fotograma y en Android (giroscopio siempre activo) todo iba a tirones.
    // La pala de esta misma pantalla: las otras pestañas siguen en la página, ocultas.
    let escrito = "";
    const paso = () => {
      raf = 0;
      actual.x += (objetivo.x - actual.x) * 0.12;
      actual.y += (objetivo.y - actual.y) * 0.12;
      const gx = Math.round(-actual.x * MAX_X * 10) / 10;
      const gy = Math.round(-actual.y * MAX_Y * 10) / 10;
      const clave = `${gx} ${gy}`;
      if (clave !== escrito) {
        escrito = clave;
        el.style.setProperty("--gx", `${gx}px`);
        el.style.setProperty("--gy", `${gy}px`);
        // La pala, un poco al revés (profundidad), con su transform directo: nada más se recalcula.
        const marco = el.closest(".app.con-estudio")?.querySelector<HTMLElement>(".pala-marco");
        if (marco) marco.style.transform = `translate3d(${(gx * -0.22).toFixed(1)}px, ${(gy * -0.22).toFixed(1)}px, 0)`;
        // Lo que va pegado a la foto (el botón que hay sobre el ampli del fondo) se mueve con ella
        const pegado = el.closest(".app.con-estudio")?.querySelector<HTMLElement>("[data-sigue-fondo]");
        if (pegado) pegado.style.transform = `translate3d(${gx}px, ${gy}px, 0)`;
      }
      if (Math.abs(objetivo.x - actual.x) > 0.002 || Math.abs(objetivo.y - actual.y) > 0.002) raf = requestAnimationFrame(paso);
    };

    const escuchar = () => {
      window.removeEventListener("deviceorientation", alGirar);
      window.addEventListener("deviceorientation", alGirar);
    };
    // En Android y en un iPhone que ya dio permiso, empieza solo; si no, al llegar el permiso.
    escuchar();
    window.addEventListener("clavija:movimiento", escuchar);
    return () => {
      window.removeEventListener("deviceorientation", alGirar);
      window.removeEventListener("clavija:movimiento", escuchar);
      cancelAnimationFrame(raf);
      const marco = el.closest(".app.con-estudio")?.querySelector<HTMLElement>(".pala-marco");
      if (marco) marco.style.transform = "";
    };
  }, []);

  return (
    <div ref={caja} className={`fondo-estudio ${vertical ? "vertical" : ""}`} style={fotosDe(puesta)} aria-hidden="true">
      {/* (cada capa con su clave: la anterior sigue siendo la misma pieza y no parpadea) */}
      {(anterior ? [anterior, puesta] : [puesta]).map((c) => (
        <div key={c.foto} className={`fondo-ambiente${anterior && c === puesta ? " cambia" : ""}`} style={fotosDe(c)} />
      ))}
      <div className="fondo-panorama" />
      {velo && <div className="fondo-velo" />}
    </div>
  );
}
