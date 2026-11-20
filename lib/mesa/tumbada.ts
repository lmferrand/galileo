// En el móvil la Mesa se usa tumbada. Al entrar, se le pide al aparato que tumbe la pantalla
// (Screen Orientation API) en vez de esperar a que la gire quien la usa:
//  - En Android, la app instalada puede quedarse clavada de pie aunque el móvil tenga el giro
//    automático puesto: el icono se instaló cuando la app pedía ir siempre de pie, y Android tarda
//    días en enterarse de que ya no (visto en un Motorola el 20-nov-2026: «al girar la pantalla la
//    mesa no se ve»). Pedirlo desde la propia Mesa pasa por encima de eso, y también vale con el
//    giro automático quitado.
//  - En una pestaña del navegador solo se deja en pantalla completa: para eso está el botón «Girar
//    la pantalla» del aviso (hace falta un toque).
//  - En el iPhone no existe: se gira a mano.
// Al salir de la Mesa la pantalla vuelve a como estaba.

import { useCallback, useEffect, useRef, useState } from "react";

type Orientacion = ScreenOrientation & { lock?: (o: "landscape") => Promise<void>; unlock?: () => void };

const orientacion = (): Orientacion | null => (typeof screen !== "undefined" && screen.orientation ? (screen.orientation as Orientacion) : null);

/** Un móvil (táctil y estrecho): en una tableta o un ordenador la Mesa cabe de pie */
const esMovil = () => typeof matchMedia !== "undefined" && matchMedia("(pointer: coarse)").matches && Math.min(screen.width, screen.height) <= 600;

/** ¿Este aparato deja tumbar la pantalla desde la app? (para enseñar el botón) */
export const puedeTumbarse = (): boolean => !!orientacion()?.lock && esMovil();

/**
 * Mientras el componente está en pantalla, la pantalla va tumbada (si el aparato deja).
 * `girar`: pedirlo otra vez desde un toque (en el navegador, entrando en pantalla completa);
 * `fallo`: se ha pedido con el botón y no se ha podido.
 */
export function usePantallaTumbada(): { girar: () => Promise<void>; fallo: boolean } {
  const tumbada = useRef(false);
  const completa = useRef(false);
  const [fallo, setFallo] = useState(false);

  useEffect(() => {
    const o = orientacion();
    if (!o?.lock || !esMovil()) return;
    o.lock("landscape").then(
      () => {
        tumbada.current = true;
      },
      () => undefined, // en una pestaña del navegador no deja sin pantalla completa: queda el botón
    );
    return () => {
      if (tumbada.current) {
        try {
          o.unlock?.();
        } catch {
          /* ya suelta */
        }
        tumbada.current = false;
      }
      if (completa.current && document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
      completa.current = false;
    };
  }, []);

  const girar = useCallback(async () => {
    const o = orientacion();
    if (!o?.lock) return setFallo(true);
    try {
      await o.lock("landscape");
      tumbada.current = true;
      setFallo(false);
    } catch {
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen({ navigationUI: "hide" });
          completa.current = true;
        }
        await o.lock("landscape");
        tumbada.current = true;
        setFallo(false);
      } catch {
        setFallo(true);
      }
    }
  }, []);

  return { girar, fallo };
}
