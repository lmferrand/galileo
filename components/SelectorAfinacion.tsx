"use client";

import { useState, type ReactNode } from "react";
import { NOMBRE_GRUPO, ORDEN_GRUPOS, type Afinacion } from "@/lib/afinaciones";
import { partesNota, type Notacion } from "@/lib/notas";

export const ID_CROMATICO = "cromatico";

interface Props {
  /** Lo que va arriba del todo (el selector de instrumento). */
  cabecera?: ReactNode;
  afinaciones: Afinacion[];
  actualId: string;
  notacion: Notacion;
  onElegir: (id: string) => void;
  onCrear: () => void;
  onBorrar: (id: string) => void;
}

export function NotasEnFila({ notas, notacion, bemoles }: { notas: number[]; notacion: Notacion; bemoles?: boolean }) {
  return (
    <span className="notas-fila">
      {notas.map((m, i) => {
        const p = partesNota(m, notacion, bemoles);
        return (
          <span key={i} className="nota-chip">
            {p.base}
            {p.alteracion && <span className="nota-chip-alt">{p.alteracion}</span>}
          </span>
        );
      })}
    </span>
  );
}

export default function SelectorAfinacion({ cabecera, afinaciones, actualId, notacion, onElegir, onCrear, onBorrar }: Props) {
  const [borrando, setBorrando] = useState<string | null>(null);

  return (
    <div className="selector">
      {cabecera}
      {ORDEN_GRUPOS.map((grupo) => {
        const lista = afinaciones.filter((a) => a.grupo === grupo);
        if (!lista.length) return null;
        return (
          <section key={grupo} className="selector-grupo">
            <h3>{NOMBRE_GRUPO[grupo]}</h3>
            <ul>
              {lista.map((a) => (
                <li key={a.id} className={a.id === actualId ? "actual" : ""}>
                  <button type="button" className="selector-fila" onClick={() => onElegir(a.id)} aria-current={a.id === actualId}>
                    <span className="selector-textos">
                      <span className="selector-nombre">{a.nombre}</span>
                      {a.nota && <span className="selector-nota">{a.nota}</span>}
                      <NotasEnFila notas={a.notas} notacion={notacion} bemoles={a.bemoles} />
                    </span>
                    {a.id === actualId && (
                      <svg viewBox="0 0 16 16" className="selector-check" aria-hidden="true">
                        <path d="M3.5 8.5 L6.6 11.4 L12.5 4.8" />
                      </svg>
                    )}
                  </button>
                  {grupo === "mias" &&
                    (borrando === a.id ? (
                      <span className="selector-borrar-si">
                        <button type="button" className="boton-texto peligro" onClick={() => onBorrar(a.id)}>
                          Borrar
                        </button>
                        <button type="button" className="boton-texto" onClick={() => setBorrando(null)}>
                          No
                        </button>
                      </span>
                    ) : (
                      <button type="button" className="boton-texto suave" onClick={() => setBorrando(a.id)} aria-label={`Borrar ${a.nombre}`}>
                        Borrar
                      </button>
                    ))}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <section className="selector-grupo">
        <h3>Sin cuerdas fijas</h3>
        <ul>
          <li className={actualId === ID_CROMATICO ? "actual" : ""}>
            <button type="button" className="selector-fila" onClick={() => onElegir(ID_CROMATICO)} aria-current={actualId === ID_CROMATICO}>
              <span className="selector-textos">
                <span className="selector-nombre">Cromático</span>
                <span className="selector-nota">Reconoce cualquier nota, para afinar a tu manera</span>
              </span>
              {actualId === ID_CROMATICO && (
                <svg viewBox="0 0 16 16" className="selector-check" aria-hidden="true">
                  <path d="M3.5 8.5 L6.6 11.4 L12.5 4.8" />
                </svg>
              )}
            </button>
          </li>
        </ul>
      </section>

      <button type="button" className="boton-secundario ancho" onClick={onCrear}>
        Crear una afinación
      </button>
    </div>
  );
}
