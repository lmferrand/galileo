"use client";

import { useEffect } from "react";

/**
 * iPhone con Clavija abierta desde el icono (fallo de WebKit): la página cree que la
 * pantalla acaba antes del borde de abajo. Se miden dos cosas, porque no siempre fallan
 * igual:
 *  - --hueco-abajo: pantalla menos zona útil (innerHeight). Lo que ocupa la página
 *    (el afinador, el reproductor) se estira eso para llegar al borde.
 *  - --hueco-fijo: lo que le falta a lo que va fijo abajo (botones, hojas) para llegar
 *    al borde. Se mide con una marca fija en bottom: 0. Con la página ya estirada,
 *    el iPhone suele colocar lo fijo en el borde de verdad y entonces es 0.
 * En el navegador normal y en el ordenador, los dos son 0.
 */
export default function HuecoIphone() {
  useEffect(() => {
    const marca = document.createElement("div");
    marca.setAttribute("aria-hidden", "true");
    marca.style.cssText = "position:fixed;left:0;bottom:0;width:1px;height:1px;visibility:hidden;pointer-events:none;";
    document.body.appendChild(marca);
    const raiz = document.documentElement;

    const medir = () => {
      const comoApp =
        matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
      const vertical = window.innerHeight >= window.innerWidth;
      const alto = vertical ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
      const valido = (v: number) => (v > 0 && v < 140 ? Math.round(v) : 0);
      const hueco = comoApp ? valido(alto - window.innerHeight) : 0;
      raiz.style.setProperty("--hueco-abajo", `${hueco}px`);
      raiz.classList.toggle("hueco", hueco > 0);
      // Después de estirar la página, dónde cae de verdad lo fijo.
      const fijo = comoApp ? valido(alto - marca.getBoundingClientRect().bottom) : 0;
      raiz.style.setProperty("--hueco-fijo", `${fijo}px`);
    };

    let raf = 0;
    const medirYa = () => {
      cancelAnimationFrame(raf);
      medir();
      // Una vez más cuando el navegador haya colocado la página con el hueco ya puesto.
      raf = requestAnimationFrame(() => requestAnimationFrame(medir));
    };
    medirYa();
    const tarde = [setTimeout(medirYa, 400), setTimeout(medirYa, 1500)];
    window.addEventListener("resize", medirYa);
    window.visualViewport?.addEventListener("resize", medirYa);
    return () => {
      cancelAnimationFrame(raf);
      tarde.forEach(clearTimeout);
      window.removeEventListener("resize", medirYa);
      window.visualViewport?.removeEventListener("resize", medirYa);
      marca.remove();
    };
  }, []);
  return null;
}
