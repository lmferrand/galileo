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
 * En el navegador normal, en el ordenador y en Android, los dos son 0.
 *
 * ¡Ojo! Al estirar la página el iPhone cambia su zona útil. Si se volviera a medir con
 * cada cambio de tamaño, la medida se desharía, la página se encogería, volvería a
 * cambiar… y todo temblaría sin parar (pasó el 18-nov-2026). Por eso solo se mide al
 * abrir y al girar el móvil, y el hueco de cada orientación nunca baja.
 */
export default function HuecoIphone() {
  useEffect(() => {
    const marca = document.createElement("div");
    marca.setAttribute("aria-hidden", "true");
    marca.style.cssText = "position:fixed;left:0;bottom:0;width:1px;height:1px;visibility:hidden;pointer-events:none;";
    document.body.appendChild(marca);
    const raiz = document.documentElement;
    // Solo en el iPhone y el iPad. En Android la pantalla incluye la barra de arriba y la de los
    // botones del sistema: la resta daría un «hueco» falso y lo de abajo se saldría (19-nov-2026).
    const esApple = /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
    const comoApp =
      esApple &&
      (matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true);
    const huecoDe = { vertical: 0, horizontal: 0 };
    const valido = (v: number) => (v > 0 && v < 140 ? Math.round(v) : 0);
    // En el iPhone screen.width y screen.height no se cambian al girar: se mira la ventana.
    const orientacion = () => (window.innerHeight >= window.innerWidth ? "vertical" : "horizontal");

    const medir = () => {
      if (!comoApp) return;
      const o = orientacion();
      const alto = o === "vertical" ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
      // Solo puede crecer: una vez estirada la página, una medida menor es por el propio estirón.
      huecoDe[o] = Math.max(huecoDe[o], valido(alto - window.innerHeight));
      raiz.style.setProperty("--hueco-abajo", `${huecoDe[o]}px`);
      raiz.classList.toggle("hueco", huecoDe[o] > 0);
      // Dónde cae de verdad lo fijo, con la página ya estirada.
      const fijo = valido(alto - marca.getBoundingClientRect().bottom);
      raiz.style.setProperty("--hueco-fijo", `${fijo}px`);
    };

    medir();
    // Un par de veces más mientras el iPhone termina de colocar la página, y ya está.
    const tarde = [setTimeout(medir, 400), setTimeout(medir, 1500)];

    // Al girar el móvil (cambia el ancho), otra vez lo mismo para la nueva orientación.
    let ancho = window.innerWidth;
    const alCambiar = () => {
      if (window.innerWidth === ancho) return;
      ancho = window.innerWidth;
      medir();
      tarde.push(setTimeout(medir, 400));
    };
    window.addEventListener("resize", alCambiar);
    return () => {
      tarde.forEach(clearTimeout);
      window.removeEventListener("resize", alCambiar);
      marca.remove();
    };
  }, []);
  return null;
}
