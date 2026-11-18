"use client";

// Los mandos de la consola, como los de una mesa de verdad: la perilla (ruedecita) y el fader.
// Los dos se mueven arrastrando arriba y abajo desde donde se toquen (nunca saltan a otro valor),
// vuelven a su valor de serie con dos toques y se manejan con las flechas del teclado.

import { useRef, type CSSProperties, type KeyboardEvent, type PointerEvent } from "react";
import { amplitudDePos, MARCAS, POS_CERO, posDeAmplitud, posDeDb, verDb } from "@/lib/mesa/curva";

export interface PropsMando {
  nombre: string;
  valor: number;
  min: number;
  max: number;
  paso: number;
  /** Al que vuelve con dos toques */
  porDefecto: number;
  ver: (v: number) => string;
  onCambio: (v: number) => void;
  desactivado?: boolean;
}

const DOS_TOQUES_MS = 320;

function useArrastre(p: PropsMando, recorrido: (el: HTMLElement) => number) {
  const inicio = useRef<{ y: number; v: number; alto: number; movido: boolean } | null>(null);
  // Cuándo acabó el último toque sin arrastrar (dos seguidos = valor de serie)
  const ultimoToque = useRef(0);
  const rango = p.max - p.min;

  const ajustar = (v: number) => {
    const dentro = Math.min(p.max, Math.max(p.min, v));
    return Number((Math.round((dentro - p.min) / p.paso) * p.paso + p.min).toFixed(4));
  };
  const poner = (v: number) => {
    const a = ajustar(v);
    if (a !== p.valor) p.onCambio(a);
  };

  return {
    onPointerDown(e: PointerEvent<HTMLElement>) {
      if (p.desactivado) return;
      e.preventDefault();
      e.currentTarget.focus({ preventScroll: true });
      e.currentTarget.setPointerCapture(e.pointerId);
      inicio.current = { y: e.clientY, v: p.valor, alto: recorrido(e.currentTarget), movido: false };
    },
    onPointerMove(e: PointerEvent<HTMLElement>) {
      const i = inicio.current;
      if (!i) return;
      if (!i.movido && Math.abs(i.y - e.clientY) < 4) return;
      i.movido = true;
      // Con mayúsculas, cuatro veces más fino
      const fino = e.shiftKey ? 0.25 : 1;
      poner(i.v + ((i.y - e.clientY) / i.alto) * rango * fino);
    },
    onPointerUp() {
      const i = inicio.current;
      inicio.current = null;
      if (!i) return;
      const ahora = performance.now();
      if (i.movido) ultimoToque.current = 0;
      else if (ahora - ultimoToque.current < DOS_TOQUES_MS) {
        ultimoToque.current = 0;
        p.onCambio(p.porDefecto);
      } else ultimoToque.current = ahora;
    },
    onPointerCancel() {
      inicio.current = null;
    },
    onKeyDown(e: KeyboardEvent<HTMLElement>) {
      if (p.desactivado) return;
      const pasos: Record<string, number> = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 };
      if (e.key in pasos) poner(p.valor + pasos[e.key] * p.paso);
      else if (e.key === "Home") poner(p.min);
      else if (e.key === "End") poner(p.max);
      else return;
      e.preventDefault();
    },
  };
}

const accesible = (p: PropsMando) => ({
  role: "slider" as const,
  tabIndex: p.desactivado ? -1 : 0,
  "aria-label": p.nombre,
  "aria-valuemin": p.min,
  "aria-valuemax": p.max,
  "aria-valuenow": p.valor,
  "aria-valuetext": p.ver(p.valor),
  "aria-disabled": p.desactivado || undefined,
});

/** Ruedecita de colores (la de la foto): de −135° a +135°. */
export function Perilla(p: PropsMando & { color: "rojo" | "azul" | "amarillo" | "crema"; etiqueta?: string }) {
  // 150 px de arrastre recorren la rueda entera
  const manejo = useArrastre(p, () => 150);
  const frac = (p.valor - p.min) / (p.max - p.min);
  return (
    <div className="mando">
      <div className={`perilla perilla-${p.color}`} {...accesible(p)} {...manejo}>
        <span className="perilla-tapa" style={{ "--giro": `${-135 + 270 * frac}deg` } as CSSProperties} />
      </div>
      <span className="mando-nombre" aria-hidden="true">
        {p.etiqueta ?? p.nombre}
      </span>
    </div>
  );
}

/**
 * Fader vertical con escala en decibelios (lib/mesa/curva): el 0 dB a tres cuartos del recorrido
 * y +10 dB arriba. `valor` es el multiplicador (1 = 0 dB). Dos toques: vuelve a 0 dB.
 */
export function Fader({ nombre, valor, onCambio, desactivado, rojo }: { nombre: string; valor: number; onCambio: (v: number) => void; desactivado?: boolean; rojo?: boolean }) {
  const pos = posDeAmplitud(valor);
  const enPosicion: PropsMando = {
    nombre,
    valor: pos,
    min: 0,
    max: 1,
    paso: 0.005,
    porDefecto: POS_CERO,
    ver: () => verDb(valor),
    onCambio: (p) => onCambio(amplitudDePos(p)),
    desactivado,
  };
  // El recorrido es lo que mide la ranura (menos la tapa): así el fader va pegado al dedo
  const manejo = useArrastre(enPosicion, (el) => Math.max(60, el.clientHeight - 34));
  return (
    <div
      className={`fader${rojo ? " fader-rojo" : ""}`}
      role="slider"
      tabIndex={desactivado ? -1 : 0}
      aria-label={nombre}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pos * 100)}
      aria-valuetext={verDb(valor)}
      aria-disabled={desactivado || undefined}
      {...manejo}
      style={{ "--pos": pos } as CSSProperties}
    >
      <span className="fader-ranura" aria-hidden="true" />
      <span className="fader-escala" aria-hidden="true">
        {MARCAS.map((m) => (
          <span key={m.texto} className={`fader-marca${m.db === 0 ? " cero" : ""}`} style={{ "--en": posDeDb(m.db) } as CSSProperties}>
            {m.texto}
          </span>
        ))}
      </span>
      <span className="fader-tapa" aria-hidden="true" />
    </div>
  );
}
