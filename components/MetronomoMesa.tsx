"use client";

// El metrónomo de la Mesa, en su hoja (se abre con su tecla en la pantalla de la grabadora).
//  - Con canción: va con el ritmo y el compás de la canción (el click del reproductor: los golpes y
//    el compás salen de su batería y el 1, con ayuda del bajo; la Mesa lo busca sola al abrirse). Se
//    puede oír mientras suena, y corregir si no acierta: otro compás, mover el 1, el doble o la mitad.
//  - Sin canción: el tempo y el compás que pongas (MetronomoPanel, el mismo del afinador).
// Y la cuenta de 3 segundos antes de grabar, que se puede quitar.

import { useEffect, useState } from "react";
import MetronomoPanel, { COMPASES } from "./MetronomoPanel";
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
  /** Corregir lo que se detectó: otro compás, el 1 un golpe más allá, el doble o la mitad de golpes */
  onCompas: (c: Compas) => void;
  onMoverUno: () => void;
  onDoble: () => void;
  onMitad: () => void;
  puedeDoble: boolean;
  puedeMitad: boolean;
  /** Toca la canción con una cuenta de unos `segundos` en su ritmo; devuelve lo que dura */
  tocarConCuenta: (segundos: number) => Promise<number>;
}

interface Props {
  cancion: MetronomoCancion | null;
  /** Por dónde va la canción (segundos) y si suena: para encender el punto del golpe que toca */
  segundo?: number;
  tocando?: boolean;
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

/** «4/4», «6/8»…: el compás como se escribe */
const nombreCompas = (c: number) => COMPASES.find((x) => x.valor === c)?.nombre ?? `${c}/4`;

/** En qué golpe del compás (0 = el 1) va la canción en ese segundo, o null si aún no ha llegado al primero. */
function golpeDelCompas(pulso: ClickCancion, segundo: number): number | null {
  const g = pulso.golpes;
  if (!g.length || segundo < g[0]) return null;
  let a = 0;
  let b = g.length - 1;
  while (a < b) {
    const m = (a + b + 1) >> 1;
    if (g[m] <= segundo) a = m;
    else b = m - 1;
  }
  return (((a - pulso.uno) % pulso.compas) + pulso.compas) % pulso.compas;
}

export default function MetronomoMesa({ cancion, segundo = 0, tocando = false, bpm, compas, sonando, alGolpe, onBpm, onCompas, onAlternar, cuenta, onCuenta, onCerrar }: Props) {
  // El punto que se enciende en cada golpe (solo con la hoja abierta: así no se repinta la Mesa)
  const [tiempo, setTiempo] = useState<number | null>(null);
  useEffect(() => {
    if (cancion) return;
    alGolpe(setTiempo);
    return () => alGolpe(null);
  }, [alGolpe, cancion, sonando]);

  const pulso = cancion?.pulso ?? null;
  const suena = pulso && tocando ? golpeDelCompas(pulso, segundo) : null;
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
                <>
                  <p className="mm-estado">
                    <strong className="mm-bpm">{Math.round(pulso.bpm)}</strong>
                    <span>
                      golpes por minuto, compás de {nombreCompas(pulso.compas)}. <br />
                      Va con el ritmo de la canción, aunque el batería acelere o frene.
                    </span>
                  </p>
                  <div className="metro-puntos mm-puntos" aria-hidden="true">
                    {Array.from({ length: pulso.compas }, (_, i) => (
                      <span key={i} className={`metro-punto ${i === 0 ? "uno" : ""} ${suena === i ? "suena" : ""}`} />
                    ))}
                  </div>
                  <div className="segmentado metro-compas mm-compas" role="group" aria-label="Compás de la canción">
                    {COMPASES.map((c) => (
                      <button key={c.valor} type="button" aria-pressed={pulso.compas === c.valor} onClick={() => cancion.onCompas(c.valor)}>
                        {c.nombre}
                      </button>
                    ))}
                  </div>
                  <div className="mm-retoques">
                    <button type="button" className="boton-secundario" onClick={cancion.onMoverUno}>
                      Mover el 1
                    </button>
                    <button type="button" className="boton-secundario" onClick={cancion.onBuscar} disabled={cancion.buscando}>
                      {cancion.buscando ? "Buscando…" : "Buscar otra vez"}
                    </button>
                    <button type="button" className="boton-secundario" onClick={cancion.onMitad} disabled={!cancion.puedeMitad} aria-label="La mitad de golpes">
                      La mitad
                    </button>
                    <button type="button" className="boton-secundario" onClick={cancion.onDoble} disabled={!cancion.puedeDoble} aria-label="El doble de golpes">
                      El doble
                    </button>
                  </div>
                  <p className="toma-ayuda mm-ayuda">
                    El compás y el 1 salen de la batería y del bajo. Si el golpe fuerte no cae donde empieza el compás, enciende el click, pon la canción y pulsa «Mover el 1» hasta que cuadre. Esta canción lo recuerda.
                  </p>
                </>
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
