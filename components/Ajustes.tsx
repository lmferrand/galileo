"use client";

import type { Notacion } from "@/lib/notas";

interface Props {
  la4: number;
  notacion: Notacion;
  onLa4: (hz: number) => void;
  onNotacion: (n: Notacion) => void;
}

export default function Ajustes({ la4, notacion, onLa4, onNotacion }: Props) {
  return (
    <div className="ajustes">
      <section>
        <h3>Nota de referencia</h3>
        <p className="ajustes-ayuda">El La central suele estar a 440 Hz. Cámbialo solo si tocas con un piano o una grabación afinados de otra forma.</p>
        <div className="la4">
          <button type="button" className="boton-redondo" onClick={() => onLa4(Math.max(415, la4 - 1))} aria-label="Bajar un hercio">
            −
          </button>
          <output className="la4-valor" aria-live="polite">
            La = {la4} <span>Hz</span>
          </output>
          <button type="button" className="boton-redondo" onClick={() => onLa4(Math.min(466, la4 + 1))} aria-label="Subir un hercio">
            +
          </button>
        </div>
        {la4 !== 440 && (
          <button type="button" className="boton-texto" onClick={() => onLa4(440)}>
            Volver a 440 Hz
          </button>
        )}
      </section>

      <section>
        <h3>Nombre de las notas</h3>
        <div className="segmentado" role="group" aria-label="Nombre de las notas">
          <button type="button" aria-pressed={notacion === "latina"} onClick={() => onNotacion("latina")}>
            Do Re Mi
          </button>
          <button type="button" aria-pressed={notacion === "letras"} onClick={() => onNotacion("letras")}>
            C D E
          </button>
        </div>
      </section>

      <section>
        <h3>Tenerla a mano</h3>
        <p className="ajustes-ayuda">
          En el iPhone, abre esta página en Safari, toca el botón de compartir y elige «Añadir a pantalla de inicio». Así se abre como una app y funciona sin internet.
        </p>
      </section>
    </div>
  );
}
