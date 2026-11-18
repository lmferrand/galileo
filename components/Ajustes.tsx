"use client";

import { useEffect, useState } from "react";
import type { Notacion } from "@/lib/notas";
import { guardarEntrada, leerEntrada, listarEntradas, pedirAudio, type Entrada } from "@/lib/entrada";

interface Props {
  la4: number;
  notacion: Notacion;
  onLa4: (hz: number) => void;
  onNotacion: (n: Notacion) => void;
  /** Al cambiar de entrada (para volver a abrir el micro si estaba escuchando). */
  onEntrada?: () => void;
}

export default function Ajustes({ la4, notacion, onLa4, onNotacion, onEntrada }: Props) {
  const [entradas, setEntradas] = useState<Entrada[] | null>(null);
  const [elegida, setElegida] = useState("");
  const [medidas, setMedidas] = useState("");

  // Medidas de la pantalla (para ajustar la app a cada aparato si algo no encaja abajo).
  useEffect(() => {
    const prueba = document.createElement("div");
    prueba.style.cssText = "position:fixed;visibility:hidden;padding-top:env(safe-area-inset-top);padding-bottom:env(safe-area-inset-bottom)";
    document.body.append(prueba);
    const estilo = getComputedStyle(prueba);
    const arriba = Math.round(parseFloat(estilo.paddingTop) || 0);
    const abajo = Math.round(parseFloat(estilo.paddingBottom) || 0);
    prueba.remove();
    const raiz = getComputedStyle(document.documentElement);
    const hueco = raiz.getPropertyValue("--hueco-abajo").trim() || "0px";
    const huecoFijo = raiz.getPropertyValue("--hueco-fijo").trim() || "0px";
    const comoApp = matchMedia("(display-mode: standalone)").matches;
    const visible = Math.round(window.visualViewport?.height ?? window.innerHeight);
    setMedidas(
      `Pantalla ${screen.width}×${screen.height}, zona útil ${window.innerWidth}×${window.innerHeight} (visible ${visible}), ${comoApp ? "modo app" : "navegador"}, hueco ${hueco} (botones ${huecoFijo}), márgenes ${arriba} arriba y ${abajo} abajo.`,
    );
  }, []);

  useEffect(() => {
    setElegida(leerEntrada());
    listarEntradas()
      .then(setEntradas)
      .catch(() => setEntradas([]));
  }, []);

  // Sin permiso del micro el navegador no da los nombres: se pide un momento y se suelta.
  const sinNombres = entradas !== null && entradas.length > 0 && entradas.every((e) => e.nombre.startsWith("Entrada "));
  const verNombres = async () => {
    try {
      const flujo = await navigator.mediaDevices.getUserMedia(pedirAudio());
      flujo.getTracks().forEach((p) => p.stop());
      setEntradas(await listarEntradas());
    } catch {
      /* sin permiso: se quedan los números */
    }
  };

  return (
    <div className="ajustes">
      <section>
        <h3>Entrada de sonido</h3>
        <p className="ajustes-ayuda">
          Con una interfaz de audio puedes enchufar la guitarra o el bajo: el afinador la oye limpia y el looper graba la señal directa.
          En el iPhone, al enchufarla suele pasar a usarse sola.
        </p>
        <select
          className="ajustes-entrada"
          value={elegida}
          onChange={(e) => {
            setElegida(e.target.value);
            guardarEntrada(e.target.value);
            onEntrada?.();
          }}
          aria-label="Entrada de sonido"
        >
          <option value="">La que elija el aparato</option>
          {(entradas ?? []).map((e) => (
            <option key={e.id} value={e.id}>
              {e.nombre}
            </option>
          ))}
        </select>
        {sinNombres && (
          <button type="button" className="boton-texto" onClick={verNombres}>
            Ver los nombres de las entradas
          </button>
        )}
      </section>

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
      {medidas && <p className="ajustes-medidas">Medidas de la pantalla: {medidas}</p>}
    </div>
  );
}
