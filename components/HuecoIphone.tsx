"use client";

import { useEffect } from "react";

/**
 * iPhone con Clavija abierta desde el icono: a veces la zona útil de la pantalla acaba
 * antes del borde de abajo y queda una franja. Se mide (pantalla menos zona útil) y se
 * deja en --hueco-abajo para que el fondo y el mástil lleguen hasta el borde. En el
 * navegador normal y en el ordenador es 0.
 */
export default function HuecoIphone() {
  useEffect(() => {
    const medir = () => {
      const comoApp =
        matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      const vertical = window.innerHeight >= window.innerWidth;
      const alto = vertical ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
      const hueco = comoApp ? Math.round(alto - window.innerHeight) : 0;
      const h = hueco > 0 && hueco < 140 ? hueco : 0;
      document.documentElement.style.setProperty("--hueco-abajo", `${h}px`);
      document.documentElement.classList.toggle("hueco", h > 0);
    };
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, []);
  return null;
}
