"use client";

// El afinador rápido del modo escenario: entre canción y canción, sin salir del directo. La canción
// queda en pausa y no suena nada (ni notas de referencia): solo la aguja. Usa el instrumento, la
// afinación, el La y la notación que tengas puestos en el afinador. El micro lo abre Directo con el
// toque del botón (el iPhone solo lo deja así) y le pasa aquí lo que oye.

import { useState } from "react";
import type { EstadoMicro } from "@/lib/motor";
import { leerPreferencias } from "@/lib/preferencias";
import { instrumentoDe } from "@/lib/instrumentos";
import { afinacionesDe, estandarDe, familiaDe, numeroCuerda } from "@/lib/afinaciones";
import { midiDe, nombreNota, partesNota } from "@/lib/notas";
import { ID_CROMATICO } from "./SelectorAfinacion";

const BIEN_CENTS = 3;

interface Props {
  /** La frecuencia que se oye (estable), o null si no suena nada */
  frecuencia: number | null;
  estado: EstadoMicro;
  onCerrar: () => void;
}

export default function AfinadorRapido({ frecuencia, estado, onCerrar }: Props) {
  const [prefs] = useState(() => leerPreferencias());
  const instrumento = instrumentoDe(prefs.instrumento);
  const familia = instrumento.familia;
  const idAfinacion = familia === "bajo" ? prefs.afinacionBajoId : prefs.afinacionId;
  const cromatico = idAfinacion === ID_CROMATICO;
  const afinacion = [...prefs.propias.filter((a) => familiaDe(a) === familia), ...afinacionesDe(familia)].find((a) => a.id === idAfinacion) ?? estandarDe(familia);

  const midi = frecuencia ? midiDe(frecuencia, prefs.la4) : null;
  const nota = midi === null ? null : Math.round(midi);
  const cents = midi === null || nota === null ? 0 : (midi - nota) * 100;
  const bien = nota !== null && Math.abs(cents) <= BIEN_CENTS;
  const partes = nota === null ? null : partesNota(nota, prefs.notacion, afinacion.bemoles);
  const cuerda = cromatico || nota === null ? -1 : afinacion.notas.indexOf(nota);

  const aviso =
    estado === "pidiendo"
      ? "Abriendo el micro…"
      : estado === "denegado"
        ? "Sin permiso para el micro: dalo en los ajustes del navegador."
        : estado === "sin-soporte" || estado === "error"
          ? "No se puede abrir el micro en este aparato."
          : null;

  return (
    <div className="directo-panel" role="dialog" aria-modal="true" aria-label="Afinar" onClick={(e) => e.target === e.currentTarget && onCerrar()}>
      <div className="directo-panel-caja afinador-rapido">
        <h2>Afinar</h2>
        <p className="ar-sub">
          {instrumento.nombre}, {cromatico ? "cromático" : afinacion.nombre.toLowerCase()}. La canción está en pausa: no suena nada.
        </p>

        <div className={`ar-nota${bien ? " bien" : ""}${nota === null ? " nada" : ""}`} aria-live="polite">
          {partes ? (
            <>
              {partes.base}
              {partes.alteracion && <span className="ar-alt">{partes.alteracion}</span>}
              <sub>{partes.octava}</sub>
            </>
          ) : (
            "–"
          )}
        </div>

        <div className="ar-barra" aria-hidden="true">
          <span className="ar-zona" />
          <span className="ar-centro" />
          {nota !== null && <span className={`ar-aguja${bien ? " bien" : ""}`} style={{ left: `${50 + Math.max(-50, Math.min(50, cents))}%` }} />}
        </div>
        <p className={`ar-texto${bien ? " bien" : ""}`}>
          {aviso ??
            (nota === null
              ? "Toca una cuerda"
              : bien
                ? cuerda >= 0
                  ? `Cuerda ${numeroCuerda(cuerda, afinacion.notas.length)}, afinada`
                  : "Afinada"
                : `${cents < 0 ? "Sube" : "Baja"} ${Math.round(Math.abs(cents))} cents${cuerda >= 0 ? `, cuerda ${numeroCuerda(cuerda, afinacion.notas.length)}` : ""}`)}
        </p>

        {!cromatico && (
          <div className="ar-cuerdas" aria-label="Las cuerdas de la afinación">
            {afinacion.notas.map((n, i) => (
              <span key={i} className={cuerda === i ? (bien ? "on bien" : "on") : ""}>
                {nombreNota(n, prefs.notacion, afinacion.bemoles)}
              </span>
            ))}
          </div>
        )}

        <button type="button" className="boton-principal" onClick={onCerrar}>
          Listo
        </button>
      </div>
    </div>
  );
}
