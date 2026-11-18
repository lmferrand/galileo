"use client";

// Portada al abrir la app (unos 3 s): el logo aparece sobre la madera oscura y,
// debajo, el dial del icono: la aguja oscila y se queda en el centro, en verde,
// afinada. Luego se funde y deja ver el estudio para elegir instrumento.
// Tocar la pantalla la salta. Todo el movimiento va en CSS (globals.css, «Portada»).

import { useState } from "react";
import { preload } from "react-dom";

const MARCAS = Array.from({ length: 9 }, (_, i) => -60 + i * 15);

export default function Portada({ onFin }: { onFin: () => void }) {
  const [saltada, setSaltada] = useState(false);
  preload("/logo-the-clavija-grande.webp", { as: "image", fetchPriority: "high" });

  return (
    <div
      className={`portada ${saltada ? "saltada" : ""}`}
      role="img"
      aria-label="The Clavija"
      onClick={() => setSaltada(true)}
      onAnimationEnd={(e) => {
        // Se acaba al terminar su propio fundido (no el de lo de dentro)
        if (e.target === e.currentTarget && e.animationName.startsWith("portada-se-va")) onFin();
      }}
    >
      <div className="portada-luz" aria-hidden="true" />
      {/* eslint-disable-next-line @next/next/no-img-element -- imagen fija, precargada */}
      <img className="portada-logo" src="/logo-the-clavija-grande.webp" alt="" width={760} height={446} draggable={false} />
      <svg className="portada-dial" viewBox="0 0 240 124" aria-hidden="true">
        <path className="portada-arco" d="M 40.3 66 A 92 92 0 0 1 199.7 66" />
        {MARCAS.map((g) => {
          const a = (g * Math.PI) / 180;
          const largo = g === 0 ? 0 : g % 30 === 0 ? 12 : 8;
          if (!largo) return null;
          const x1 = 120 + 92 * Math.sin(a);
          const y1 = 112 - 92 * Math.cos(a);
          const x2 = 120 + (92 - largo) * Math.sin(a);
          const y2 = 112 - (92 - largo) * Math.cos(a);
          return <line key={g} className="portada-marca" x1={x1.toFixed(1)} y1={y1.toFixed(1)} x2={x2.toFixed(1)} y2={y2.toFixed(1)} />;
        })}
        <text className="portada-signo" x="40" y="96">
          ♭
        </text>
        <text className="portada-signo" x="186" y="96">
          ♯
        </text>
        <g className="portada-aguja">
          <line x1="120" y1="112" x2="120" y2="34" />
          <circle cx="120" cy="112" r="4.5" />
        </g>
        <path className="portada-muesca" d="M111 6 L129 6 L120 20 Z" />
      </svg>
    </div>
  );
}
