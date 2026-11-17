"use client";

import { useState } from "react";
import { partesNota, type Notacion } from "@/lib/notas";

interface Props {
  notasIniciales: number[];
  notacion: Notacion;
  onGuardar: (nombre: string, notas: number[], bemoles: boolean) => void;
  onProbar: (midi: number, indice: number) => void;
}

const MIN = 28; // Mi1
const MAX = 76; // Mi5

export default function EditorAfinacion({ notasIniciales, notacion, onGuardar, onProbar }: Props) {
  const [nombre, setNombre] = useState("");
  const [notas, setNotas] = useState<number[]>(notasIniciales);
  const [bemoles, setBemoles] = useState(false);

  const mover = (i: number, paso: number) =>
    setNotas((n) => n.map((m, j) => (j === i ? Math.max(MIN, Math.min(MAX, m + paso)) : m)));

  return (
    <form
      className="editor"
      onSubmit={(e) => {
        e.preventDefault();
        onGuardar(nombre.trim() || "Mi afinación", notas, bemoles);
      }}
    >
      <label className="campo">
        <span>Nombre</span>
        <input value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Mi afinación" maxLength={32} />
      </label>

      <p className="editor-ayuda">Sube o baja cada cuerda de medio tono en medio tono. Empieza desde la afinación que tenías puesta.</p>

      <ol className="editor-cuerdas">
        {notas.map((m, i) => {
          const p = partesNota(m, notacion, bemoles);
          return (
            <li key={i}>
              <span className="editor-num">{6 - i}.ª</span>
              <button type="button" className="boton-redondo" onClick={() => mover(i, -1)} aria-label={`Bajar la cuerda ${6 - i}`} disabled={m <= MIN}>
                −
              </button>
              <span className="editor-nota">
                {p.base}
                {p.alteracion && <span className="nota-alt">{p.alteracion}</span>}
                <sub>{p.octava}</sub>
              </span>
              <button type="button" className="boton-redondo" onClick={() => mover(i, 1)} aria-label={`Subir la cuerda ${6 - i}`} disabled={m >= MAX}>
                +
              </button>
              <button type="button" className="boton-texto" onClick={() => onProbar(m, i)}>
                Oír
              </button>
            </li>
          );
        })}
      </ol>

      <div className="segmentado" role="group" aria-label="Alteraciones">
        <button type="button" aria-pressed={!bemoles} onClick={() => setBemoles(false)}>
          Con sostenidos ♯
        </button>
        <button type="button" aria-pressed={bemoles} onClick={() => setBemoles(true)}>
          Con bemoles ♭
        </button>
      </div>

      <button type="submit" className="boton-principal ancho">
        Guardar la afinación
      </button>
    </form>
  );
}
