"use client";

// El metrónomo de la Mesa, en su hoja (se abre con su tecla en la pantalla de la grabadora).
//  - Con canción: va con el ritmo de la canción (el click del reproductor, sacado de su batería; la
//    Mesa lo busca sola al abrirse). Se puede oír mientras suena.
//  - Sin canción: el tempo y el compás que pongas (MetronomoPanel, el mismo del afinador).
// Y la cuenta de 3 segundos antes de grabar, que se puede quitar.

import { useEffect, useState } from "react";
import MetronomoPanel from "./MetronomoPanel";
import type { Compas } from "@/lib/metronomo";
import { SEGUNDOS_CUENTA } from "@/lib/mesa/cuenta";
import type { ClickCancion } from "@/lib/pistas/ajustesCancion";

/** El metrónomo con el ritmo de la canción que suena en la Mesa (el click del reproductor) */
export interface MetronomoCancion {
  pulso: ClickCancion | null;
  buscando: boolean;
  /** Se buscó y no se encontró (la batería no se oye clara) */
  sinPulso: boolean;
  oir: boolean;
  onOir: (v: boolean) => void;
  onBuscar: () => void;
  /** Toca la canción con una cuenta de unos `segundos` en su ritmo; devuelve lo que dura */
  tocarConCuenta: (segundos: number) => Promise<number>;
}

interface Props {
  cancion: MetronomoCancion | null;
  // Sin canción
  bpm: number;
  compas: Compas;
  sonando: boolean;
  /** Avisar en cada golpe del metrónomo (o dejar de avisar con null) */
  alGolpe: (aviso: ((tiempo: number) => void) | null) => void;
  onBpm: (bpm: number) => void;
  onCompas: (c: Compas) => void;
  onAlternar: () => void;
  // Siempre
  cuenta: boolean;
  onCuenta: (si: boolean) => void;
  onCerrar: () => void;
}

export default function MetronomoMesa({ cancion, bpm, compas, sonando, alGolpe, onBpm, onCompas, onAlternar, cuenta, onCuenta, onCerrar }: Props) {
  // El punto que se enciende en cada golpe (solo con la hoja abierta: así no se repinta la Mesa)
  const [tiempo, setTiempo] = useState<number | null>(null);
  useEffect(() => {
    if (cancion) return;
    alGolpe(setTiempo);
    return () => alGolpe(null);
  }, [alGolpe, cancion, sonando]);

  const pulso = cancion?.pulso ?? null;
  return (
    <div className="hoja-fondo" onClick={onCerrar}>
      <div className="hoja" role="dialog" aria-modal="true" aria-label="Metrónomo" onClick={(e) => e.stopPropagation()}>
        <div className="hoja-asa" aria-hidden="true" />
        <header className="hoja-cabecera">
          <h2>Metrónomo</h2>
          <button type="button" className="boton-texto" onClick={onCerrar}>
            Listo
          </button>
        </header>
        <div className="hoja-cuerpo mm-hoja">
          {cancion ? (
            <section className="mm-cancion" aria-live="polite">
              {pulso ? (
                <p className="mm-estado">
                  <strong className="mm-bpm">{Math.round(pulso.bpm)}</strong>
                  <span>
                    golpes por minuto, compás de {pulso.compas}. <br />
                    Va con el ritmo de la canción, aunque el batería acelere o frene.
                  </span>
                </p>
              ) : cancion.sinPulso ? (
                <>
                  <p className="mm-estado">No encuentro el ritmo de esta canción: la batería no se oye clara.</p>
                  <button type="button" className="boton-secundario" onClick={cancion.onBuscar}>
                    Buscar otra vez
                  </button>
                </>
              ) : (
                <p className="mm-estado">Buscando el ritmo de la canción…</p>
              )}
              <button
                type="button"
                className={`interruptor-mini mm-interruptor ${cancion.oir && pulso ? "on" : ""}`}
                role="switch"
                aria-checked={cancion.oir && !!pulso}
                disabled={!pulso}
                onClick={() => cancion.onOir(!cancion.oir)}
              >
                <span className="interruptor-pista" aria-hidden="true">
                  <span className="interruptor-bola" />
                </span>
                <span>Oír el click con la canción</span>
              </button>
            </section>
          ) : (
            <MetronomoPanel bpm={bpm} compas={compas} sonando={sonando} tiempo={sonando ? tiempo : null} onBpm={onBpm} onCompas={onCompas} onAlternar={onAlternar} />
          )}

          <button type="button" className={`interruptor-mini mm-interruptor ${cuenta ? "on" : ""}`} role="switch" aria-checked={cuenta} onClick={() => onCuenta(!cuenta)}>
            <span className="interruptor-pista" aria-hidden="true">
              <span className="interruptor-bola" />
            </span>
            <span>Cuenta de {SEGUNDOS_CUENTA} segundos antes de grabar</span>
          </button>
          <p className="toma-ayuda">
            {cancion
              ? pulso
                ? `Al pulsar REC suenan unos ${SEGUNDOS_CUENTA} segundos de click al ritmo de la canción y la canción entra a tiempo. Lo que tocas se graba desde ahí.`
                : `Al pulsar REC suenan unos ${SEGUNDOS_CUENTA} segundos de golpes a ${bpm} por minuto y empieza la canción.`
              : `Al pulsar REC suenan unos ${SEGUNDOS_CUENTA} segundos de golpes a este tempo y empieza a grabar. Si el metrónomo está sonando, sigue mientras grabas.`}
          </p>
        </div>
      </div>
    </div>
  );
}
