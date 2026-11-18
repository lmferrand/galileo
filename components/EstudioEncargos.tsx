"use client";

// Lo que tienes en el estudio (el PC que separa con más calidad): en la cola, separándose
// o listo. Lo que está listo se trae solo a tu lista. Se pregunta cada 15 s mientras quede algo.

import { useCallback, useEffect, useRef, useState } from "react";
import { estadoEstudio, estudioEncendido, quitarDelEstudio, recogerDelEstudio, type EncargoEstudio, type EstadoEstudio } from "@/lib/estudio/cliente";
import type { Cancion } from "@/lib/pistas/tipos";

interface Props {
  /** Súbelo para preguntar ya (al mandar canciones nuevas). */
  version: number;
  onEstado?: (e: EstadoEstudio) => void;
  onRecibida: (c: Cancion) => void;
}

export default function EstudioEncargos({ version, onEstado, onRecibida }: Props) {
  const [estado, setEstado] = useState<EstadoEstudio | null>(null);
  const [recibiendo, setRecibiendo] = useState<{ id: string; f: number } | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const ocupado = useRef(false);
  // Si no tienes nada en el estudio, un fallo de conexión no se enseña
  const hayAlgo = useRef(false);
  const onEstadoRef = useRef(onEstado);
  const onRecibidaRef = useRef(onRecibida);
  useEffect(() => {
    onEstadoRef.current = onEstado;
    onRecibidaRef.current = onRecibida;
  }, [onEstado, onRecibida]);

  const preguntar = useCallback(async () => {
    if (ocupado.current) return;
    ocupado.current = true;
    try {
      let e = await estadoEstudio();
      hayAlgo.current = e.encargos.length > 0;
      setEstado(e);
      onEstadoRef.current?.(e);
      // Las que ya están separadas, a la lista (de una en una)
      for (const listo of e.encargos.filter((x) => x.estado === "listo")) {
        setRecibiendo({ id: listo.id, f: 0 });
        try {
          const c = await recogerDelEstudio(listo, (f) => setRecibiendo({ id: listo.id, f }));
          onRecibidaRef.current(c);
        } catch (err) {
          setFallo(`«${listo.nombre}»: ${(err as Error).message}`);
        }
      }
      if (e.encargos.some((x) => x.estado === "listo")) {
        e = await estadoEstudio();
        setEstado(e);
        onEstadoRef.current?.(e);
      }
      setFallo(null);
    } catch (err) {
      if (hayAlgo.current) setFallo((err as Error).message);
    } finally {
      setRecibiendo(null);
      ocupado.current = false;
    }
  }, []);

  useEffect(() => {
    void preguntar();
  }, [version, preguntar]);

  const quedan = (estado?.encargos ?? []).some((e) => e.estado !== "error");
  useEffect(() => {
    if (!quedan) return;
    const t = setInterval(() => void preguntar(), 15000);
    return () => clearInterval(t);
  }, [quedan, preguntar]);

  const encargos = estado?.encargos ?? [];
  if (!encargos.length && !fallo) return null;
  const encendido = estudioEncendido(estado);

  return (
    <section className="tarjeta estudio" aria-label="En el estudio" aria-live="polite">
      <div className="estudio-cabeza">
        <p className="estudio-titulo">En el estudio</p>
        <span className={`estudio-luz ${encendido ? "on" : ""}`}>{encendido ? "Encendido" : "Apagado"}</span>
      </div>
      {!encendido && encargos.some((e) => e.estado === "pendiente" || e.estado === "separando") && (
        <p className="pistas-letra-pequena">Ahora mismo está apagado: tus canciones se separarán en cuanto se encienda.</p>
      )}
      <ul className="estudio-lista">
        {encargos.map((e) => (
          <li key={e.id}>
            <div className="estudio-fila">
              <span className="estudio-nombre">{e.nombre}</span>
              <span className="estudio-estado">{texto(e, recibiendo)}</span>
            </div>
            {(e.estado === "separando" || recibiendo?.id === e.id) && (
              <div className="progreso" role="progressbar" aria-valuemin={0} aria-valuemax={100}>
                <span style={{ width: `${Math.max(3, (recibiendo?.id === e.id ? recibiendo.f : (e.progreso ?? 0)) * 100)}%` }} />
              </div>
            )}
            {e.estado === "error" && (
              <button
                type="button"
                className="boton-texto"
                onClick={async () => {
                  await quitarDelEstudio(e.id).catch(() => undefined);
                  void preguntar();
                }}
              >
                Quitar
              </button>
            )}
          </li>
        ))}
      </ul>
      {fallo && <p className="pistas-letra-pequena">{fallo}</p>}
    </section>
  );
}

function texto(e: EncargoEstudio, recibiendo: { id: string } | null): string {
  if (recibiendo?.id === e.id) return "Recibiendo…";
  switch (e.estado) {
    case "subiendo":
      return "Subiendo…";
    case "pendiente":
      return e.puesto && e.puesto > 1 ? `En la cola (${e.puesto}.ª)` : "La siguiente";
    case "separando":
      return `Separando… ${Math.round((e.progreso ?? 0) * 100)} %`;
    case "listo":
      return "Lista";
    case "error":
      return e.error || "No se ha podido separar.";
  }
}
