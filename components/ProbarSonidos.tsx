"use client";

// Escuchar todos los sonidos de cada instrumento para elegir cuál suena en la app.

import { useState } from "react";
import type { InstrumentoId } from "@/lib/instrumentos";
import { ELEGIDOS, VARIANTES, sonarInstrumento } from "@/lib/sonidos";

const ORDEN: InstrumentoId[] = ["acustica", "electrica", "bajo"];
const NOMBRES: Record<InstrumentoId, string> = { acustica: "Guitarra acústica", electrica: "Guitarra eléctrica", bajo: "Bajo" };

export default function ProbarSonidos() {
  const [sonando, setSonando] = useState<string | null>(null);

  const tocar = (instrumento: InstrumentoId, variante: string) => {
    sonarInstrumento(instrumento, variante);
    setSonando(variante);
    setTimeout(() => setSonando((s) => (s === variante ? null : s)), 1600);
  };

  return (
    <main className="sonidos">
      <h1>Sonidos al elegir instrumento</h1>
      <p className="sonidos-ayuda">
        Toca cada uno para oírlo. Dime el número que prefieres de cada instrumento y será el que suene al elegirlo. Si el móvil está
        en silencio, no se oirá.
      </p>
      {ORDEN.map((id) => (
        <section key={id} className="sonidos-grupo">
          <h2>{NOMBRES[id]}</h2>
          <ol>
            {VARIANTES[id].map((v, i) => (
              <li key={v.id}>
                <button type="button" className={`sonidos-boton ${sonando === v.id ? "sonando" : ""}`} onClick={() => tocar(id, v.id)}>
                  <span className="sonidos-numero">{i + 1}</span>
                  <span className="sonidos-texto">
                    <span className="sonidos-nombre">
                      {v.nombre}
                      {ELEGIDOS[id] === v.id && <span className="sonidos-ahora"> (el de ahora)</span>}
                    </span>
                    <span className="sonidos-detalle">{v.detalle}</span>
                  </span>
                  <svg viewBox="0 0 24 24" className="sonidos-play" aria-hidden="true">
                    <path d="M8 5.5v13l10.5-6.5z" />
                  </svg>
                </button>
              </li>
            ))}
          </ol>
        </section>
      ))}
    </main>
  );
}
