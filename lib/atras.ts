"use client";

// El «atrás» del aparato (el botón o el gesto de Android, la flecha del navegador) dentro de una
// pantalla que tiene pasos por dentro: la Mesa. Sin esto, «atrás» sacaba de la pestaña entera o
// cerraba la app, cuando lo que se espera es volver un paso (del canal a la mesa, de la mesa a las
// dos, de la consola al estudio…).
// Cada paso abierto se apunta aquí (usePasoAtras) y por cada uno se añade una entrada al historial
// del navegador, con la misma dirección. Al pulsar «atrás» se va esa entrada y se llama al paso de
// más arriba, que se cierra como si se hubiera tocado su botón. Si el paso se cierra desde la app,
// la entrada que sobra se quita sola.
// Next deja usar el historial así (node_modules/next/dist/docs: «Native History API»).

import { useEffect, useRef } from "react";

interface Paso {
  /** Cuanto más alto, más adentro: «atrás» cierra primero el más alto */
  nivel: number;
  volver: () => void;
}

const pasos: Paso[] = [];
/** Las entradas nuestras que hay en el historial por encima de la de la página */
let enHistorial = 0;
/** Los «popstate» que hemos provocado nosotros al quitar entradas que sobraban */
let propios = 0;
let pendiente = false;
let oyendo = false;

const marcaDe = (estado: unknown): number => {
  const n = (estado as { galileoPaso?: unknown } | null)?.galileoPaso;
  return typeof n === "number" ? n : 0;
};

/** Deja en el historial tantas entradas como pasos hay abiertos */
function cuadrar() {
  pendiente = false;
  const quiero = pasos.length;
  if (quiero > enHistorial) {
    while (enHistorial < quiero) {
      enHistorial++;
      window.history.pushState({ galileoPaso: enHistorial }, "");
    }
  } else if (quiero < enHistorial) {
    const sobran = enHistorial - quiero;
    // Solo si seguimos encima de nuestras entradas: si la app ha ido a otra pantalla, no se toca nada
    const encima = marcaDe(window.history.state) === enHistorial;
    enHistorial = quiero;
    if (encima) {
      propios++;
      window.history.go(-sobran);
    } else enHistorial = 0;
  }
}

function pedirCuadre() {
  if (pendiente) return;
  pendiente = true;
  queueMicrotask(cuadrar);
}

function alRetroceder(e: PopStateEvent) {
  if (propios > 0) {
    propios--;
    return;
  }
  const destino = marcaDe(e.state);
  if (destino < enHistorial) {
    // «Atrás»: se han ido tantas entradas como pasos hay que cerrar, del más de dentro hacia fuera
    const cuantos = enHistorial - destino;
    enHistorial = destino;
    [...pasos]
      .sort((a, b) => b.nivel - a.nivel)
      .slice(0, cuantos)
      .forEach((p) => p.volver());
  } else if (destino > enHistorial) {
    // «Adelante» hacia un paso que ya se cerró: no se puede rehacer, se vuelve a donde se estaba
    propios++;
    window.history.go(enHistorial - destino);
  }
}

/**
 * Mientras `activo`, «atrás» llama a `volver` en vez de salir de la pantalla. `nivel`: el orden entre
 * los pasos abiertos a la vez (se cierra primero el de número más alto).
 */
export function usePasoAtras(activo: boolean, nivel: number, volver: () => void) {
  const ultimo = useRef(volver);
  useEffect(() => {
    ultimo.current = volver;
  });
  useEffect(() => {
    if (!activo) return;
    const paso: Paso = { nivel, volver: () => ultimo.current() };
    pasos.push(paso);
    if (!oyendo) {
      oyendo = true;
      window.addEventListener("popstate", alRetroceder);
    }
    pedirCuadre();
    return () => {
      const i = pasos.indexOf(paso);
      if (i >= 0) pasos.splice(i, 1);
      pedirCuadre();
    };
  }, [activo, nivel]);
}
