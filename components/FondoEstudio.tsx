"use client";

// La foto del estudio detrás del afinador. Al inclinar el móvil se desplaza un
// poco (la parte de arriba más que la de abajo) mientras la pala se queda quieta
// delante: así parece que hay profundidad. En el iPhone hace falta permiso para
// leer la inclinación; se pide al tocar «Empezar» (ver pedirPermisoMovimiento).

import { useEffect, useRef, type CSSProperties } from "react";

const MAX_X = 22; // px que se mueve la foto de arriba hacia los lados
const MAX_Y = 14;
const GRADOS = 24; // inclinación que da el máximo

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
 */
export default function FondoEstudio({ foto, vertical, velo = true }: { foto: string; vertical?: boolean; velo?: boolean }) {
  const caja = useRef<HTMLDivElement>(null);

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

    const paso = () => {
      raf = 0;
      actual.x += (objetivo.x - actual.x) * 0.12;
      actual.y += (objetivo.y - actual.y) * 0.12;
      el.style.setProperty("--gx", `${(-actual.x * MAX_X).toFixed(1)}px`);
      el.style.setProperty("--gy", `${(-actual.y * MAX_Y).toFixed(1)}px`);
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
    };
  }, []);

  return (
    <div ref={caja} className={`fondo-estudio ${vertical ? "vertical" : ""}`} style={{ "--foto": `url("${foto}")` } as CSSProperties} aria-hidden="true">
      <div className="fondo-ambiente" />
      <div className="fondo-panorama" />
      {velo && <div className="fondo-velo" />}
    </div>
  );
}
