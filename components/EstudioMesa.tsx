"use client";

// Al pulsar «Mesa»: la sala de control del estudio (foto) mirando a los músicos por el cristal.
// Tocas la mesa de mezclas, la vista se acerca a ella y aparece la consola de verdad
// (ConsolaMesa). «Estudio» vuelve a alejarse; la ✕ cierra (la Mesa sigue sonando si está
// encendida). Igual que al elegir instrumento: la foto y la zona para tocar van en UNA capa que se
// acerca entera con una transformación CSS (fluida en el iPhone). Medidas en píxeles de la foto.

import { useEffect, useRef, useState } from "react";
import { useHorizontal } from "@/lib/horizontal";
import ConsolaMesa, { type PistasMesa } from "./ConsolaMesa";

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Foto {
  src: string;
  ancho: number;
  alto: number;
  /** La mesa de mezclas con la grabadora, con su madera */
  mesa: Rect;
}

// Dos fotos: la apaisada (PC, iPad tumbado, móvil tumbado) y la vertical (móviles de pie)
const HORIZONTAL: Foto = { src: "/mesa/estudio2-h.webp", ancho: 1536, alto: 1024, mesa: { x: 355, y: 404, w: 877, h: 596 } };
const VERTICAL: Foto = { src: "/mesa/estudio2-v.webp", ancho: 1024, alto: 1536, mesa: { x: 190, y: 714, w: 676, h: 514 } };

type Fase = "estudio" | "entrando" | "consola" | "volviendo";
const ACERCARSE_MS = 820;
const IRSE_MS = 220;

const sinMovimiento = () => typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;

export default function EstudioMesa({ onCerrar, pistas }: { onCerrar: () => void; /** Desde Pistas: las 6 pistas de la canción */ pistas?: PistasMesa }) {
  // Hasta saber si la pantalla es apaisada no se pinta ninguna foto (así no se descarga la que no toca)
  const horizontal = useHorizontal();
  const FOTO = horizontal ? HORIZONTAL : VERTICAL;
  const caja = useRef<HTMLDivElement>(null);
  const [tam, setTam] = useState<{ w: number; h: number } | null>(null);
  const [fase, setFase] = useState<Fase>("estudio");

  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    el.focus();
    const medir = () => setTam({ w: el.clientWidth, h: el.clientHeight });
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Escape: en la consola vuelve al estudio (paso a paso, como «‹»); en el estudio cierra la Mesa
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (fase === "consola") setFase("volviendo");
      else if (fase === "estudio") onCerrar();
    };
    document.addEventListener("keydown", tecla);
    return () => document.removeEventListener("keydown", tecla);
  }, [onCerrar, fase]);

  // Acercarse y, al llegar, la consola; volver: la consola se va y la vista se aleja
  useEffect(() => {
    if (fase !== "entrando" && fase !== "volviendo") return;
    const t = setTimeout(() => setFase(fase === "entrando" ? "consola" : "estudio"), sinMovimiento() ? 0 : fase === "entrando" ? ACERCARSE_MS : IRSE_MS);
    return () => clearTimeout(t);
  }, [fase]);

  const entrar = () => fase === "estudio" && setFase("entrando");
  const cerca = fase === "entrando" || fase === "consola";

  // La apaisada, lo más grande posible sin cortarla de alto (y al menos con la mesa de lado a lado).
  // La vertical llena la pantalla, siempre que la mesa quepa a lo ancho. Centradas en la mesa.
  let marco = { left: 0, top: 0, width: 0, height: 0 };
  let transformacion = "none";
  let borde = "";
  if (tam && horizontal !== null) {
    const m = FOTO.mesa;
    const e = horizontal
      ? Math.min(tam.h / FOTO.alto, Math.max(tam.w / FOTO.ancho, tam.w / (m.w * 1.08)))
      : Math.min(Math.max(tam.h / FOTO.alto, tam.w / FOTO.ancho), tam.w / (m.w * 1.04));
    const W = FOTO.ancho * e;
    const H = FOTO.alto * e;
    const left = W <= tam.w ? (tam.w - W) / 2 : Math.min(0, Math.max(tam.w - W, tam.w / 2 - (m.x + m.w / 2) * e));
    marco = { left, top: (tam.h - H) / 2, width: W, height: H };
    borde = W < tam.w - 1 ? "borde-h" : H < tam.h - 1 ? "borde-v" : "";
    if (cerca) {
      // La mesa llenando la pantalla, sin que asome el borde de la foto. En el móvil la mesa ya
      // ocupa el ancho: se acerca igualmente (×1,8) para que se note que entras.
      const z = Math.max(1.8, Math.min(tam.w / (m.w * e), tam.h / (m.h * e)) * 0.96);
      const px = marco.left + (m.x + m.w / 2) * e;
      const py = marco.top + (m.y + m.h / 2) * e;
      const encaja = (t: number, desde: number, largo: number, pantalla: number) =>
        largo * z <= pantalla ? pantalla / 2 - z * (desde + largo / 2) : Math.min(-z * desde, Math.max(pantalla - z * (desde + largo), t));
      // Lo fundido del borde (4 % a los lados o 6 % arriba y abajo) tampoco debe asomar
      const fh = borde === "borde-h" ? 0.04 * W : 0;
      const fv = borde === "borde-v" ? 0.06 * H : 0;
      const tx = encaja(tam.w / 2 - z * px, marco.left + fh, W - 2 * fh, tam.w);
      const ty = encaja(tam.h / 2 - z * py, marco.top + fv, H - 2 * fv, tam.h);
      transformacion = `translate3d(${tx}px, ${ty}px, 0) scale(${z})`;
    }
  }

  return (
    <div ref={caja} className={`estudio-mesa fase-${fase}${horizontal === false ? " foto-vertical" : ""}`} role="dialog" aria-modal="true" aria-label="Mesa" tabIndex={-1}>
      {tam && horizontal !== null && (
        <div className="estudio-escena" style={{ transform: transformacion }}>
          <div className="estudio-marco" style={marco}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={`estudio-img ${borde}`} src={FOTO.src} alt="" draggable={false} />
            <svg viewBox={`0 0 ${FOTO.ancho} ${FOTO.alto}`} className="estudio-toques">
              <defs>
                <radialGradient id="estudio-halo">
                  <stop offset="0%" stopColor="#ffe2ad" stopOpacity="0.3" />
                  <stop offset="100%" stopColor="#ffe2ad" stopOpacity="0" />
                </radialGradient>
              </defs>
              <ellipse
                className="estudio-halo"
                cx={FOTO.mesa.x + FOTO.mesa.w / 2}
                cy={FOTO.mesa.y + FOTO.mesa.h / 2}
                rx={FOTO.mesa.w * 0.62}
                ry={FOTO.mesa.h * 0.66}
                fill="url(#estudio-halo)"
              />
              <rect
                className="estudio-toque"
                x={FOTO.mesa.x}
                y={FOTO.mesa.y}
                width={FOTO.mesa.w}
                height={FOTO.mesa.h}
                rx={14}
                role="button"
                tabIndex={fase === "estudio" ? 0 : -1}
                aria-label="Entrar en la mesa de mezclas"
                onClick={entrar}
                onKeyDown={(ev) => {
                  if (ev.key === "Enter" || ev.key === " ") {
                    ev.preventDefault();
                    entrar();
                  }
                }}
              />
            </svg>
          </div>
        </div>
      )}

      <p className="estudio-pista" aria-hidden={fase !== "estudio"}>
        Toca la mesa de mezclas
      </p>

      {(fase === "consola" || fase === "volviendo") ? (
        // La barra va dentro de la consola: así la hoja de efectos la tapa
        <div className="estudio-consola">
          {/* Dentro de la consola no hay ✕: se sale hacia atrás (canal → mesa → las dos → estudio) */}
          <Arriba onEstudio={() => setFase("volviendo")} />
          <ConsolaMesa pistas={pistas} />
        </div>
      ) : (
        <Arriba onCerrar={onCerrar} />
      )}
    </div>
  );
}

function Arriba({ onCerrar, onEstudio }: { onCerrar?: () => void; onEstudio?: () => void }) {
  return (
    <div className="estudio-arriba">
      {onEstudio && (
        <button type="button" className="estudio-boton" onClick={onEstudio}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
          Estudio
        </button>
      )}
      {onCerrar && (
        <button type="button" className="estudio-boton estudio-cerrar" onClick={onCerrar} aria-label="Cerrar la Mesa">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      )}
    </div>
  );
}
