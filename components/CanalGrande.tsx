"use client";

// En el móvil tumbado: un canal de la mesa a toda pantalla. Sus 7 ruedas en fila y en grande
// (TRIM, LOW, HIGH, COMP, PAN, REV, DELAY, con su valor debajo), la tecla roja (silencio), SOLO,
// SELECT (sus efectos) y el fader tumbado, en horizontal. Las flechas pasan al canal de al lado.
// Mueve lo mismo que la mesa (ruedasDe de MesaFoto): es el mismo canal visto de cerca.

import type { CSSProperties } from "react";
import { accesible, useArrastre, type PropsMando } from "./MandosMesa";
import { ruedasDe, type CanalFoto } from "./MesaFoto";
import { amplitudDePos, MARCAS, POS_CERO, posDeAmplitud, posDeDb, verDb } from "@/lib/mesa/curva";

export const PLACAS = ["INPUT 1", "INPUT 2", "VOCALS", "DRUMS", "BASS", "GUITAR", "PIANO", "OTHER"];
const ETIQUETAS = ["TRIM", "LOW", "HIGH", "COMP", "PAN", "REV", "DELAY"];

/** 11 rayitas alrededor de la rueda, de −135° a +135° */
const MARCAS_RUEDA = Array.from({ length: 11 }, (_, k) => {
  const a = ((-135 + 27 * k) * Math.PI) / 180;
  const p = (r: number) => `${(50 + r * Math.sin(a)).toFixed(1)} ${(50 - r * Math.cos(a) * 0.92).toFixed(1)}`;
  return `M${p(40)}L${p(46)}`;
}).join("");

function RuedaGrande({ etiqueta, color, p }: { etiqueta: string; color: string; p: PropsMando }) {
  const manejo = useArrastre(p, () => 160);
  const frac = (p.valor - p.min) / (p.max - p.min);
  return (
    <div className="cg-mando" {...accesible(p)} {...manejo}>
      <span className="cg-etiqueta" aria-hidden="true">
        {etiqueta}
      </span>
      <span className="cg-rueda-caja" aria-hidden="true">
        <svg viewBox="0 0 100 100" className="cg-marcas">
          <path d={MARCAS_RUEDA} />
        </svg>
        <span className={`mf-rueda mf-${color}`} style={{ left: "50%", top: "44%", "--d": "var(--dg)", "--giro": `${-135 + 270 * frac}deg` } as CSSProperties}>
          <span className="mf-falda" />
          <span className="mf-tapa">
            <span className="mf-raya" />
          </span>
        </span>
      </span>
      <span className="cg-valor" aria-hidden="true">
        <small>{p.nombre.split(" de ")[0]}</small>
        {p.ver(p.valor)}
      </span>
    </div>
  );
}

function FaderTumbado({ nombre, valor, onCambio, medidor }: { nombre: string; valor: number; onCambio: (v: number) => void; medidor: string }) {
  const pos = posDeAmplitud(valor);
  const p: PropsMando = {
    nombre,
    valor: pos,
    min: 0,
    max: 1,
    paso: 0.005,
    porDefecto: POS_CERO,
    ver: () => verDb(valor),
    onCambio: (v) => onCambio(amplitudDePos(v)),
  };
  // Pegado al dedo: lo que mide la ranura
  const manejo = useArrastre(p, (el) => Math.max(80, el.clientWidth - 70), "x");
  return (
    <div className="cg-fader" {...accesible(p)} aria-valuetext={verDb(valor)} {...manejo} style={{ "--pos": pos } as CSSProperties}>
      <span className="cg-escala" aria-hidden="true">
        {MARCAS.map((m) => (
          <span key={m.texto} className={`cg-marca${m.db === 0 ? " cero" : ""}`} style={{ "--en": posDeDb(m.db) } as CSSProperties}>
            {m.texto}
          </span>
        ))}
      </span>
      <span className="cg-ranura" aria-hidden="true">
        <span className="cg-luz" data-medidor={medidor} />
      </span>
      <span className="cg-tapa" aria-hidden="true" />
      <span className="cg-db" aria-hidden="true">
        {verDb(valor)}
      </span>
    </div>
  );
}

interface Props {
  canal: CanalFoto;
  indice: number;
  anterior: (() => void) | null;
  siguiente: (() => void) | null;
  /** Solo en las entradas: encenderlas desde aquí (en la mesa lo hace su rótulo) */
  entradas: { encendidas: boolean; ocupadas: boolean; onPulsar: () => void } | null;
  leer: (donde: string, texto: string) => void;
}

export default function CanalGrande({ canal: k, indice, anterior, siguiente, entradas, leer }: Props) {
  const leerAqui = (texto: string) => leer(k.nombre, texto);
  return (
    <section className="cg" aria-label={`Mandos de ${k.titulo}`}>
      <header className="cg-cabeza">
        <button type="button" className="estudio-boton cg-flecha" onClick={anterior ?? undefined} disabled={!anterior} aria-label="Canal anterior">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
        <span className="cg-placa">{PLACAS[indice]}</span>
        <span className="cg-nombre">{k.nombre}</span>
        <button type="button" className="estudio-boton cg-flecha" onClick={siguiente ?? undefined} disabled={!siguiente} aria-label="Canal siguiente">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </header>

      <div className="cg-ruedas">
        {ruedasDe(k, leerAqui).map((r, i) => (
          <RuedaGrande key={i} etiqueta={ETIQUETAS[i]} color={r.color} p={r.p} />
        ))}
      </div>

      <div className="cg-abajo">
        <div className="cg-teclas">
          {entradas && (
            <button type="button" className={`cg-tecla cg-entradas${entradas.encendidas ? " on" : ""}`} aria-pressed={entradas.encendidas} disabled={entradas.ocupadas} onClick={entradas.onPulsar}>
              {entradas.encendidas ? "Entradas" : "Encender"}
            </button>
          )}
          <button
            type="button"
            className={`cg-tecla cg-roja${k.silencio ? " on" : ""}`}
            aria-pressed={k.silencio}
            aria-label={`Silenciar ${k.titulo}`}
            onClick={() => {
              k.onSilencio();
              leerAqui(k.silencio ? "Suena" : "En silencio");
            }}
          />
          <button
            type="button"
            className={`cg-tecla cg-ambar${k.solo ? " on" : ""}`}
            aria-pressed={k.solo}
            aria-label={`Solo ${k.titulo}`}
            onClick={() => {
              k.onSolo();
              leerAqui(k.solo ? "Sin solo" : "Solo");
            }}
          >
            SOLO
          </button>
          <button type="button" className={`cg-tecla cg-ambar${k.nFx > 0 ? " on" : ""}`} aria-label={`Efectos de ${k.titulo}: ${k.nFx} encendidos`} onClick={k.onEfectos}>
            SELECT
          </button>
        </div>
        <FaderTumbado
          nombre={`Volumen de ${k.titulo}`}
          valor={k.volumen}
          medidor={String(k.medidor)}
          onCambio={(v) => {
            k.onVolumen(v);
            leerAqui(`Volumen ${verDb(v)}`);
          }}
        />
      </div>
    </section>
  );
}
