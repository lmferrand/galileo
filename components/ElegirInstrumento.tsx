"use client";

// Al abrir la app: el estudio entero y «¿Qué vas a afinar?». Tocas un
// instrumento, la vista se acerca a él y se funde con el afinador, donde su
// clavijero sube a primer plano (lo hace Afinador). Las medidas van en píxeles
// de cada foto (vertical para el móvil, horizontal para PC e iPad tumbado). La foto
// se ve entera y sus bordes se funden con el oscuro de la sala (sin otra copia de
// la foto detrás, que al acercarse se veía duplicada). Sin etiquetas: se toca el
// instrumento.
//
// La foto y las zonas para tocar van en UNA capa que se acerca entera con una
// transformación CSS: la hace la tarjeta gráfica (fluida en el iPhone). Al
// acercarse, el encuadre no deja ver el borde de la foto.

import { useEffect, useRef, useState } from "react";
import type { InstrumentoId } from "@/lib/instrumentos";
import { precargarSonidos } from "@/lib/sonidos";
import { useHorizontal } from "@/lib/horizontal";

interface Opcion {
  id: InstrumentoId;
  nombre: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  /** Todavía sin pala. */
  pronto?: boolean;
}

/** Lo que se puede tocar pero aún no tiene afinador: sale «Próximamente». */
interface Proximo {
  id: string;
  nombre: string;
  cx: number;
  cy: number;
  rx: number;
  ry: number;
}

interface Foto {
  src: string;
  ancho: number;
  alto: number;
  zoom: number;
  opciones: Opcion[];
  proximos: Proximo[];
}

const VERTICAL: Foto = {
  src: "/estudio/pistas-1.webp",
  ancho: 941,
  alto: 1671,
  zoom: 2.4,
  opciones: [
    { id: "acustica", nombre: "Acústica", cx: 158, cy: 918, rx: 74, ry: 182 },
    { id: "bajo", nombre: "Bajo", cx: 728, cy: 903, rx: 50, ry: 164 },
    { id: "electrica", nombre: "Eléctrica", cx: 808, cy: 935, rx: 58, ry: 150 },
  ],
  proximos: [
    { id: "piano", nombre: "Piano", cx: 252, cy: 842, rx: 74, ry: 66 },
    { id: "microfono", nombre: "Micrófono", cx: 303, cy: 905, rx: 20, ry: 195 },
  ],
};

const HORIZONTAL: Foto = {
  src: "/estudio/completo-h1.webp",
  ancho: 1536,
  alto: 1024,
  zoom: 2.1,
  opciones: [
    { id: "acustica", nombre: "Acústica", cx: 215, cy: 650, rx: 98, ry: 272 },
    { id: "bajo", nombre: "Bajo", cx: 1243, cy: 615, rx: 64, ry: 240 },
    { id: "electrica", nombre: "Eléctrica", cx: 1378, cy: 660, rx: 86, ry: 235 },
  ],
  proximos: [
    { id: "piano", nombre: "Piano", cx: 430, cy: 520, rx: 115, ry: 80 },
    { id: "microfono", nombre: "Micrófono", cx: 474, cy: 600, rx: 26, ry: 320 },
  ],
};

interface Props {
  /** La que se ha tocado: se acerca a ella mientras la pantalla se va. */
  saliendo: InstrumentoId | null;
  /** Al volver desde el afinador: empieza cerca de ese instrumento y se aleja hasta el estudio entero. */
  volviendoDe?: InstrumentoId | null;
  onElegir: (id: InstrumentoId) => void;
}

export default function ElegirInstrumento({ saliendo, volviendoDe = null, onElegir }: Props) {
  // Los sonidos de cada instrumento, listos para cuando lo toques
  useEffect(() => precargarSonidos(), []);
  // Hasta saber si la pantalla es apaisada no se pinta ninguna foto (así no se descarga la que no toca).
  const horizontal = useHorizontal();
  const foto = horizontal ? HORIZONTAL : VERTICAL;
  const caja = useRef<HTMLDivElement>(null);
  const [tam, setTam] = useState<{ w: number; h: number } | null>(null);

  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const medir = () => setTam({ w: el.clientWidth, h: el.clientHeight });
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Volviendo: el primer fotograma ya está cerca del instrumento y en el siguiente se aleja (con la transición).
  const [acercada, setAcercada] = useState(volviendoDe !== null);
  useEffect(() => {
    if (!acercada) return;
    let segundo = 0;
    const primero = requestAnimationFrame(() => {
      segundo = requestAnimationFrame(() => setAcercada(false));
    });
    return () => {
      cancelAnimationFrame(primero);
      cancelAnimationFrame(segundo);
    };
  }, [acercada]);
  // «Próximamente» encima del piano o del micrófono al tocarlos (se va solo).
  const [aviso, setAviso] = useState<{ id: string; vez: number } | null>(null);
  useEffect(() => {
    if (!aviso) return;
    const t = setTimeout(() => setAviso(null), 1700);
    return () => clearTimeout(t);
  }, [aviso]);
  const avisar = (id: string) => setAviso((a) => ({ id, vez: (a?.vez ?? 0) + 1 }));
  const destino = saliendo ?? (acercada ? volviendoDe : null);
  const elegida = foto.opciones.find((o) => o.id === destino);

  // La foto entera dentro de la pantalla (como «contain») y, al elegir, el instrumento al centro y más cerca.
  const listo = horizontal !== null && tam !== null;
  let marco = { left: 0, top: 0, width: 0, height: 0 };
  let transformacion = "none";
  // Sobra pantalla arriba y abajo (móvil) o a los lados (ordenador): solo esos bordes se funden.
  const sobraArriba = listo && tam.w / tam.h < foto.ancho / foto.alto;
  if (listo) {
    const e = Math.min(tam.w / foto.ancho, tam.h / foto.alto);
    marco = { width: foto.ancho * e, height: foto.alto * e, left: (tam.w - foto.ancho * e) / 2, top: (tam.h - foto.alto * e) / 2 };
    if (elegida) {
      const z = foto.zoom;
      const px = marco.left + elegida.cx * e;
      const py = marco.top + elegida.cy * e;
      // El instrumento al centro, pero sin que asome el borde de la foto (que tape siempre la pantalla).
      const encaja = (t: number, desde: number, largo: number, pantalla: number) =>
        Math.min(-z * desde, Math.max(pantalla - z * (desde + largo), t));
      // Lo fundido del borde (6 % arriba y abajo o 4 % a los lados) tampoco debe asomar.
      const fh = sobraArriba ? 0 : 0.04 * marco.width;
      const fv = sobraArriba ? 0.06 * marco.height : 0;
      const tx = encaja(tam.w / 2 - z * px, marco.left + fh, marco.width - 2 * fh, tam.w);
      const ty = encaja(tam.h / 2 - z * py, marco.top + fv, marco.height - 2 * fv, tam.h);
      transformacion = `translate3d(${tx}px, ${ty}px, 0) scale(${z})`;
    }
  }

  return (
    <div
      ref={caja}
      className={`elegir ${saliendo ? "saliendo" : ""} ${volviendoDe ? "llegando" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="elegir-titulo"
    >
      {listo && (
        <div className="elegir-escena" style={{ transform: transformacion }}>
          <div className="elegir-marco" style={marco}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className={`elegir-img ${sobraArriba ? "borde-v" : "borde-h"}`} src={foto.src} alt="" draggable={false} />
            <svg viewBox={`0 0 ${foto.ancho} ${foto.alto}`} className="elegir-toques">
              <defs>
                <radialGradient id="elegir-halo">
                  <stop offset="0%" stopColor="#ffe2ad" stopOpacity="0.32" />
                  <stop offset="100%" stopColor="#ffe2ad" stopOpacity="0" />
                </radialGradient>
              </defs>
              {/* Primero lo que aún no se puede afinar: los instrumentos quedan encima si se tocan los bordes */}
              {foto.proximos.map((p) => (
                <ellipse
                  key={p.id}
                  cx={p.cx}
                  cy={p.cy}
                  rx={p.rx}
                  ry={p.ry}
                  className="elegir-toque elegir-proximo"
                  role="button"
                  tabIndex={0}
                  aria-label={`${p.nombre}: próximamente`}
                  onClick={() => !saliendo && avisar(p.id)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      avisar(p.id);
                    }
                  }}
                />
              ))}
              {foto.opciones.map((o) => (
                <g key={o.id} className={`elegir-opcion ${o.pronto ? "pronto" : ""}`}>
                  {!o.pronto && <ellipse cx={o.cx} cy={o.cy} rx={o.rx * 1.5} ry={o.ry * 1.15} fill="url(#elegir-halo)" className="elegir-halo" />}
                  <ellipse
                    cx={o.cx}
                    cy={o.cy}
                    rx={o.rx}
                    ry={o.ry}
                    className="elegir-toque"
                    role="button"
                    tabIndex={o.pronto ? -1 : 0}
                    aria-disabled={o.pronto || undefined}
                    aria-label={
                      o.pronto
                        ? `${o.nombre}: muy pronto`
                        : `Afinar ${o.id === "bajo" ? "el bajo" : o.id === "electrica" ? "la guitarra eléctrica" : "la guitarra acústica"}`
                    }
                    onClick={() => !o.pronto && !saliendo && onElegir(o.id)}
                    onKeyDown={(ev) => {
                      if ((ev.key === "Enter" || ev.key === " ") && !o.pronto && !saliendo) {
                        ev.preventDefault();
                        onElegir(o.id);
                      }
                    }}
                  />
                </g>
              ))}
            </svg>
          </div>
        </div>
      )}

      {listo && aviso && !saliendo && (() => {
        const p = foto.proximos.find((x) => x.id === aviso.id);
        if (!p) return null;
        const e = marco.width / foto.ancho;
        return (
          <div
            key={aviso.vez}
            className="elegir-proximamente"
            role="status"
            style={{ left: marco.left + p.cx * e, top: marco.top + (p.cy - p.ry) * e }}
          >
            Próximamente
          </div>
        );
      })()}

      <div className="elegir-texto">
        <h1 id="elegir-titulo">¿Qué vas a afinar?</h1>
        <p>Toca el instrumento.</p>
      </div>
    </div>
  );
}
