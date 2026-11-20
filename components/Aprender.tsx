"use client";

// «Aprender»: el curso de guitarra. El mapa con las unidades y sus lecciones (estrellas, las que
// están por abrir con candado y la siguiente en latón) y, al tocar una, la lección.

import { useCallback, useLayoutEffect, useState } from "react";
import Link from "next/link";
import Navegacion from "./Navegacion";
import FondoEstudio from "./FondoEstudio";
import Leccion from "./Leccion";
import { CURSO, TODAS } from "@/lib/aprender/curso";
import { abierta, laSiguiente, leerProgreso, type Progreso } from "@/lib/aprender/progreso";
import { leerPreferencias, PREFERENCIAS_INICIALES } from "@/lib/preferencias";
import { useHidratado } from "@/lib/hidratado";
import { usePestanaVisible } from "@/lib/pestana";
import Estrella from "./Estrella";

export default function Aprender() {
  const hidratado = useHidratado();
  const [progresoGuardado, setProgreso] = useState<Progreso | null>(null);
  const [leccionId, setLeccionId] = useState<string | null>(null);
  // Lo del aparato (progreso y preferencias) solo tras hidratar: el servidor no lo conoce
  const progreso = progresoGuardado ?? (hidratado ? leerProgreso() : {});
  const prefs = hidratado ? leerPreferencias() : PREFERENCIAS_INICIALES;
  const siguiente = laSiguiente(progreso);
  const recargar = useCallback(() => setProgreso(leerProgreso()), []);
  usePestanaVisible("aprender");
  // Al ocultarse (cambias de pestaña; ver next.config.ts) se sale de la lección, como antes: su
  // micro ya se ha cerrado y al volver se ve el mapa del curso.
  useLayoutEffect(
    () => () => {
      setLeccionId(null);
      setProgreso(null);
    },
    [],
  );

  const leccion = leccionId ? TODAS.find((l) => l.id === leccionId) : null;
  if (leccion) {
    return (
      <Leccion
        leccion={leccion}
        notacion={prefs.notacion}
        la4={prefs.la4}
        onSalir={() => {
          recargar();
          setLeccionId(null);
        }}
        onCambiar={setLeccionId}
        onTerminada={recargar}
      />
    );
  }

  let numero = 0;
  return (
    <main className="app app-aprender">
      <FondoEstudio foto="/estudio/pistas-3.webp" fotoHorizontal="/estudio/completo-h3.webp" vertical />
      <header className="cabecera">
        <Navegacion actual="aprender" />
      </header>

      <section className="aprender-intro">
        <h1>Aprender</h1>
        <p>
          Guitarra en afinación estándar. <Link href="/">Afínala antes</Link>.
        </p>
      </section>

      {CURSO.map((u) => (
        <section key={u.id} className="unidad" aria-label={u.titulo}>
          <h2>{u.titulo}</h2>
          <ul>
            {u.lecciones.map((l) => {
              numero++;
              const estrellas = progreso[l.id] ?? 0;
              const libre = abierta(l.id, progreso);
              const esLaSiguiente = l.id === siguiente;
              return (
                <li key={l.id}>
                  <button
                    type="button"
                    className={`leccion-boton${esLaSiguiente ? " siguiente" : ""}${libre ? "" : " cerrada"}`}
                    onClick={() => libre && setLeccionId(l.id)}
                    disabled={!libre}
                    aria-label={`${numero}. ${l.titulo}${libre ? (estrellas ? `, ${estrellas} de 3 estrellas` : "") : ", cerrada"}`}
                  >
                    <span className="leccion-num" aria-hidden="true">
                      {libre ? (
                        numero
                      ) : (
                        <svg viewBox="0 0 24 24">
                          <rect x="5.5" y="10.5" width="13" height="9" rx="2" />
                          <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
                        </svg>
                      )}
                    </span>
                    <span className="leccion-boton-titulo">{l.titulo}</span>
                    <span className="leccion-boton-estrellas" aria-hidden="true">
                      {[1, 2, 3].map((k) => (
                        <span key={k} className={k <= estrellas ? "llena" : ""}>
                          <Estrella />
                        </span>
                      ))}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </main>
  );
}
