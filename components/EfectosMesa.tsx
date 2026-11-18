"use client";

// Los efectos de un canal de la Mesa: los sonidos de partida y, en el orden en que pasa el
// sonido, cada efecto con su interruptor y sus mandos. Se abre desde la consola (ConsolaMesa).

import type { CSSProperties } from "react";
import { SONIDOS, type AjustesCanal, type Efecto } from "@/lib/mesa/ajustes";

interface Mando {
  k: string;
  nombre: string;
  min: number;
  max: number;
  paso: number;
  ver: (v: number) => string;
}

export const pct = (v: number) => `${Math.round(v * 100)} %`;
export const dB = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v)} dB`;

// En el orden en que pasa el sonido
export const EFECTOS: { id: Efecto; nombre: string; mandos: Mando[] }[] = [
  { id: "puerta", nombre: "Puerta de ruido", mandos: [{ k: "umbral", nombre: "Umbral", min: -90, max: -20, paso: 1, ver: dB }] },
  { id: "compresor", nombre: "Compresor", mandos: [{ k: "cantidad", nombre: "Cantidad", min: 0, max: 1, paso: 0.01, ver: pct }] },
  {
    id: "distorsion",
    nombre: "Distorsión",
    mandos: [
      { k: "drive", nombre: "Saturación", min: 0, max: 1, paso: 0.01, ver: pct },
      { k: "tono", nombre: "Tono", min: 0, max: 1, paso: 0.01, ver: pct },
      { k: "nivel", nombre: "Nivel", min: 0, max: 1, paso: 0.01, ver: pct },
    ],
  },
  {
    id: "ecualizador",
    nombre: "Ecualizador",
    mandos: [
      { k: "graves", nombre: "Graves", min: -12, max: 12, paso: 1, ver: dB },
      { k: "medios", nombre: "Medios", min: -12, max: 12, paso: 1, ver: dB },
      { k: "agudos", nombre: "Agudos", min: -12, max: 12, paso: 1, ver: dB },
    ],
  },
  {
    id: "chorus",
    nombre: "Chorus",
    mandos: [
      { k: "velocidad", nombre: "Velocidad", min: 0, max: 1, paso: 0.01, ver: pct },
      { k: "profundidad", nombre: "Profundidad", min: 0, max: 1, paso: 0.01, ver: pct },
      { k: "mezcla", nombre: "Mezcla", min: 0, max: 1, paso: 0.01, ver: pct },
    ],
  },
  {
    id: "delay",
    nombre: "Delay (eco)",
    mandos: [
      { k: "tiempo", nombre: "Tiempo", min: 60, max: 1200, paso: 10, ver: (v) => `${Math.round(v)} ms` },
      { k: "repeticiones", nombre: "Repeticiones", min: 0, max: 0.85, paso: 0.01, ver: pct },
      { k: "mezcla", nombre: "Mezcla", min: 0, max: 1, paso: 0.01, ver: pct },
    ],
  },
  {
    id: "reverb",
    nombre: "Reverb",
    mandos: [
      { k: "tamano", nombre: "Sala", min: 0, max: 1, paso: 0.01, ver: pct },
      { k: "mezcla", nombre: "Mezcla", min: 0, max: 1, paso: 0.01, ver: pct },
    ],
  },
];

/** Cuántos efectos tiene encendidos un canal. */
export const efectosActivos = (c: AjustesCanal) => EFECTOS.filter((e) => c[e.id].activo).length;

function Deslizador({ nombre, valor, min, max, paso, ver, onCambio }: { nombre: string; valor: number; min: number; max: number; paso: number; ver: (v: number) => string; onCambio: (v: number) => void }) {
  return (
    <label className="mesa-mando">
      <span className="mesa-mando-nombre">{nombre}</span>
      <input
        type="range"
        className="metro-barra"
        min={min}
        max={max}
        step={paso}
        value={valor}
        onChange={(e) => onCambio(Number(e.target.value))}
        style={{ "--hecho": `${((valor - min) / (max - min)) * 100}%` } as CSSProperties}
      />
      <output className="mesa-mando-valor">{ver(valor)}</output>
    </label>
  );
}

export default function EfectosMesa({ canal: c, onCambio }: { canal: AjustesCanal; onCambio: (f: (c: AjustesCanal) => AjustesCanal) => void }) {
  return (
    <div className="mesa-fx">
      <div className="mesa-sonidos" aria-label="Sonidos">
        {SONIDOS.map((s) => (
          <button key={s.nombre} type="button" onClick={() => onCambio((x) => ({ ...x, ...structuredClone(s.efectos) }))}>
            {s.nombre}
          </button>
        ))}
      </div>

      <ul className="mesa-efectos">
        {EFECTOS.map((e) => {
          const valores = c[e.id] as unknown as Record<string, number> & { activo: boolean };
          return (
            <li key={e.id} className={valores.activo ? "activo" : ""}>
              <button
                type="button"
                className={`interruptor${valores.activo ? " on" : ""}`}
                role="switch"
                aria-checked={valores.activo}
                onClick={() => onCambio((x) => ({ ...x, [e.id]: { ...x[e.id], activo: !x[e.id].activo } }))}
              >
                <span className="interruptor-pista" aria-hidden="true">
                  <span className="interruptor-bola" />
                </span>
                <span>{e.nombre}</span>
              </button>
              {valores.activo &&
                e.mandos.map((m) => (
                  <Deslizador
                    key={m.k}
                    nombre={m.nombre}
                    valor={valores[m.k]}
                    min={m.min}
                    max={m.max}
                    paso={m.paso}
                    ver={m.ver}
                    onCambio={(v) => onCambio((x) => ({ ...x, [e.id]: { ...x[e.id], [m.k]: v } }))}
                  />
                ))}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
