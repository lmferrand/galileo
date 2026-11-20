"use client";

// La hoja «Bucle» de la Mesa (se abre con su tecla en la pantalla de la grabadora): repetir el trozo
// elegido, elegirlo por compases, moverlo, la velocidad y el entrenador de velocidad.
// El trozo también se puede elegir arrastrando sobre la onda de la pantalla.

import PracticaBucle from "./PracticaBucle";
import type { Transporte } from "./TransporteMesa";
import { formatoTiempo } from "@/lib/pistas/tipos";

export default function BucleMesa({ t, onCerrar }: { t: Transporte; onCerrar: () => void }) {
  const trozo = t.desde !== null && t.hasta !== null && t.hasta > t.desde ? { desde: t.desde, hasta: t.hasta } : null;
  const repitiendo = t.repetir && !!trozo;
  const velocidad = (v: number) => t.onVelocidad(Math.round(v * 100) / 100);
  return (
    <div className="hoja-fondo" onClick={onCerrar}>
      <div className="hoja" role="dialog" aria-modal="true" aria-label="Bucle" onClick={(e) => e.stopPropagation()}>
        <div className="hoja-asa" aria-hidden="true" />
        <header className="hoja-cabecera">
          <h2>Bucle</h2>
          <button type="button" className="boton-texto" onClick={onCerrar}>
            Listo
          </button>
        </header>
        <div className="hoja-cuerpo bucle-hoja">
          <button type="button" className={`interruptor-mini mm-interruptor ${repitiendo ? "on" : ""}`} role="switch" aria-checked={repitiendo} disabled={!trozo} onClick={() => t.onRepetir(!t.repetir)}>
            <span className="interruptor-pista" aria-hidden="true">
              <span className="interruptor-bola" />
            </span>
            <span>{trozo ? `Repetir de ${formatoTiempo(trozo.desde)} a ${formatoTiempo(trozo.hasta)}` : "Repetir un trozo"}</span>
          </button>
          {!trozo && <p className="toma-ayuda">Elige el trozo arrastrando sobre la onda de la pantalla, o por compases aquí abajo.</p>}

          {t.practica && <PracticaBucle p={t.practica} hayTrozo={!!trozo} repitiendo={repitiendo} velocidad={t.velocidad} />}

          <div className="bucle-velocidad">
            <span className="pb-titulo">Velocidad</span>
            <button type="button" className="boton-redondo" onClick={() => velocidad(t.velocidad - 0.05)} disabled={t.velocidad <= t.velocidadMin} aria-label="Más lento">
              −
            </button>
            <output aria-live="polite">{Math.round(t.velocidad * 100)} %</output>
            <button type="button" className="boton-redondo" onClick={() => velocidad(t.velocidad + 0.05)} disabled={t.velocidad >= t.velocidadMax} aria-label="Más rápido">
              +
            </button>
            {t.velocidad !== 1 && (
              <button type="button" className="boton-texto" onClick={() => velocidad(1)}>
                Normal
              </button>
            )}
          </div>

          {trozo && (
            <button type="button" className="boton-texto peligro bucle-quitar" onClick={() => t.onTrozo(null, null)}>
              Quitar el trozo
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
