"use client";

// El metrónomo dentro de su hoja. El que suena vive en Afinador: si cierras la
// hoja, sigue sonando (y la barra de abajo lo marca).

import { useRef, type CSSProperties } from "react";
import { BPM_MAX, BPM_MIN, type Compas } from "@/lib/metronomo";

export const COMPASES: { valor: Compas; nombre: string }[] = [
  { valor: 2, nombre: "2/4" },
  { valor: 3, nombre: "3/4" },
  { valor: 4, nombre: "4/4" },
  { valor: 6, nombre: "6/8" },
];

interface Props {
  bpm: number;
  compas: Compas;
  sonando: boolean;
  /** Golpe que acaba de sonar (para encender su punto), o null. */
  tiempo: number | null;
  onBpm: (bpm: number) => void;
  onCompas: (c: Compas) => void;
  onAlternar: () => void;
}

export default function MetronomoPanel({ bpm, compas, sonando, tiempo, onBpm, onCompas, onAlternar }: Props) {
  const toques = useRef<number[]>([]);

  const fijar = (v: number) => onBpm(Math.min(BPM_MAX, Math.max(BPM_MIN, Math.round(v))));

  // «Toca al ritmo»: la media de los últimos toques (si pasan más de 2 s, se empieza de nuevo).
  const tocarAlRitmo = () => {
    const ahora = performance.now();
    const lista = toques.current.filter((t) => ahora - t < 2000);
    lista.push(ahora);
    toques.current = lista.slice(-5);
    if (toques.current.length >= 2) {
      const t = toques.current;
      const media = (t[t.length - 1] - t[0]) / (t.length - 1);
      fijar(60000 / media);
    }
  };

  return (
    <div className="metro">
      <div className="metro-tempo">
        <button type="button" className="boton-redondo" onClick={() => fijar(bpm - 1)} aria-label="Más lento" disabled={bpm <= BPM_MIN}>
          −
        </button>
        <output className="metro-bpm" aria-live="polite">
          {bpm}
          <span>pulsaciones por minuto</span>
        </output>
        <button type="button" className="boton-redondo" onClick={() => fijar(bpm + 1)} aria-label="Más rápido" disabled={bpm >= BPM_MAX}>
          +
        </button>
      </div>

      <input
        type="range"
        className="metro-barra"
        min={BPM_MIN}
        max={BPM_MAX}
        step={1}
        value={bpm}
        onChange={(e) => fijar(Number(e.target.value))}
        aria-label="Pulsaciones por minuto"
        style={{ "--hecho": `${((bpm - BPM_MIN) / (BPM_MAX - BPM_MIN)) * 100}%` } as CSSProperties}
      />

      <div className="metro-puntos" aria-hidden="true">
        {Array.from({ length: compas }, (_, i) => (
          <span
            key={i}
            className={`metro-punto ${i === 0 ? "uno" : ""} ${compas === 6 && i === 3 ? "medio" : ""} ${sonando && tiempo === i ? "suena" : ""}`}
          />
        ))}
      </div>

      <div className="segmentado metro-compas" role="group" aria-label="Compás">
        {COMPASES.map((c) => (
          <button key={c.valor} type="button" aria-pressed={compas === c.valor} onClick={() => onCompas(c.valor)}>
            {c.nombre}
          </button>
        ))}
      </div>

      <div className="metro-acciones">
        <button type="button" className="boton-secundario" onClick={tocarAlRitmo}>
          Toca al ritmo
        </button>
        <button type="button" className={`boton-principal ${sonando ? "parar" : ""}`} onClick={onAlternar}>
          {sonando ? "Parar" : "Empezar"}
        </button>
      </div>
      <p className="metro-ayuda">Sigue sonando aunque cierres esta hoja. «Toca al ritmo»: toca varias veces a la velocidad que quieras.</p>
    </div>
  );
}
