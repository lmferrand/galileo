"use client";

// El looper dentro de su hoja. El que suena vive en Afinador: si cierras la hoja,
// el bucle sigue sonando (y la barra de abajo lo marca).

import { useEffect, useRef, useState } from "react";
import { guardarAjusteRetraso, type EstadoLooper, type Looper, type ModoLooper } from "@/lib/looper";
import { crearWav } from "@/lib/pistas/wav";
import { guardarArchivo } from "@/lib/pistas/exportar";

const MODOS: { valor: ModoLooper; nombre: string }[] = [
  { valor: "libre", nombre: "Libre" },
  { valor: 1, nombre: "1 compás" },
  { valor: 2, nombre: "2" },
  { valor: 4, nombre: "4" },
];

interface Props {
  looper: Looper;
  estado: EstadoLooper;
  modo: ModoLooper;
  onModo: (m: ModoLooper) => void;
  bpm: number;
  compas: number;
}

export default function LooperPanel({ looper, estado, modo, onModo, bpm, compas }: Props) {
  const [escuchar, setEscuchar] = useState(false);
  const [ajuste, setAjuste] = useState(looper.ajusteMs);
  const [guardado, setGuardado] = useState<string | null>(null);
  const aro = useRef<SVGCircleElement>(null);
  const { fase, capas, largo } = estado;
  const enBucle = fase === "sonando" || fase === "capa";

  // El aro avanza con la vuelta.
  useEffect(() => {
    if (!enBucle) {
      aro.current?.style.setProperty("--avance", "0");
      return;
    }
    let raf = 0;
    const paso = () => {
      aro.current?.style.setProperty("--avance", looper.posicion.toFixed(4));
      raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, [enBucle, looper]);

  const principal = async () => {
    setGuardado(null);
    if (fase === "apagado") {
      if (!(await looper.preparar())) return;
      looper.grabar(modo, bpm, compas);
    } else if (fase === "listo") looper.grabar(modo, bpm, compas);
    else if (fase === "grabando" && modo === "libre") looper.cerrarVuelta();
    else if (fase === "sonando") looper.empezarCapa();
    else if (fase === "capa") looper.cerrarCapa();
    else if (fase === "parado") looper.seguir();
  };

  const textoPrincipal =
    fase === "apagado" || fase === "listo"
      ? "Grabar"
      : fase === "cuenta"
        ? "Cuenta…"
        : fase === "grabando"
          ? modo === "libre"
            ? "Cerrar la vuelta"
            : "Grabando…"
          : fase === "sonando"
            ? "Añadir capa"
            : fase === "capa"
              ? "Cerrar la capa"
              : "Seguir";
  const ocupado = fase === "cuenta" || (fase === "grabando" && modo !== "libre");

  const guardar = async () => {
    const m = looper.mezcla();
    if (!m) return;
    const est = new Int16Array(m.muestras.length * 2);
    for (let i = 0; i < m.muestras.length; i++) {
      const v = Math.round(m.muestras[i] * 32767);
      est[2 * i] = v;
      est[2 * i + 1] = v;
    }
    const r = await guardarArchivo(crearWav(est, m.frecuencia), `Bucle de Clavija (${capas} ${capas === 1 ? "capa" : "capas"}).wav`);
    setGuardado(r === "cancelado" ? null : r === "compartido" ? "Guardado." : "Descargado.");
  };

  return (
    <div className="looper">
      <div className="segmentado looper-modo" role="group" aria-label="Duración de la vuelta">
        {MODOS.map((m) => (
          <button
            key={m.valor}
            type="button"
            aria-pressed={modo === m.valor}
            onClick={() => onModo(m.valor)}
            disabled={fase !== "apagado" && fase !== "listo"}
          >
            {m.nombre}
          </button>
        ))}
      </div>
      <p className="looper-ayuda">
        {modo === "libre"
          ? "Toca para empezar a grabar y otra vez al acabar la vuelta: se repite sola."
          : `Un compás de cuenta y graba ${modo} ${modo === 1 ? "compás" : "compases"} a ${bpm} pulsaciones (${compas === 6 ? "6/8" : `${compas}/4`}); cámbialo en el Metrónomo.`}
      </p>

      <button
        type="button"
        className={`looper-boton fase-${fase}`}
        onClick={principal}
        disabled={ocupado}
      >
        <svg viewBox="0 0 120 120" aria-hidden="true">
          <circle cx="60" cy="60" r="54" className="looper-pista" />
          <circle ref={aro} cx="60" cy="60" r="54" className="looper-aro" pathLength={1} />
        </svg>
        <span>{textoPrincipal}</span>
      </button>

      <p className="looper-estado" aria-live="polite">
        {estado.error ??
          (capas
            ? `${capas} ${capas === 1 ? "capa" : "capas"}, vuelta de ${largo.toLocaleString("es-ES", { maximumFractionDigits: 1 })} s`
            : fase === "sonando" || fase === "capa"
              ? "Montando el bucle…"
              : fase === "grabando"
              ? "Grabando la primera vuelta"
              : fase === "cuenta"
                ? "Cuenta: 1, 2, 3…"
                : "Sin bucle todavía")}
      </p>

      <div className="looper-acciones">
        <button type="button" className="boton-secundario" onClick={() => looper.deshacer()} disabled={!capas || fase === "capa"}>
          Deshacer capa
        </button>
        {fase === "parado" ? (
          <button type="button" className="boton-secundario" onClick={() => looper.seguir()}>
            Seguir
          </button>
        ) : (
          <button type="button" className="boton-secundario" onClick={() => looper.parar()} disabled={!enBucle}>
            Parar
          </button>
        )}
        <button type="button" className="boton-secundario" onClick={() => looper.borrar()} disabled={!capas && fase !== "grabando" && fase !== "cuenta"}>
          Borrar
        </button>
        <button type="button" className="boton-secundario" onClick={guardar} disabled={!capas}>
          Guardar
        </button>
      </div>
      {guardado && <p className="looper-ayuda">{guardado}</p>}

      <label className="looper-opcion">
        <input
          type="checkbox"
          checked={escuchar}
          onChange={(e) => {
            setEscuchar(e.target.checked);
            looper.escucharEntrada(e.target.checked);
          }}
        />
        <span>Oírme por los auriculares (si la interfaz no lo hace sola)</span>
      </label>

      <label className="looper-retraso">
        <span>
          Ajuste del retraso de las capas: {ajuste > 0 ? "+" : ""}
          {ajuste} ms
        </span>
        <input
          type="range"
          min={-80}
          max={200}
          step={5}
          value={ajuste}
          onChange={(e) => {
            const v = Number(e.target.value);
            setAjuste(v);
            looper.fijarAjuste(v);
            guardarAjusteRetraso(v);
          }}
        />
      </label>
      <p className="looper-ayuda">
        Para añadir capas, usa auriculares con cable o una interfaz: con el altavoz, el micro vuelve a grabar el bucle. Los auriculares
        Bluetooth van con retraso y las capas no cuadran. Si tus capas entran tarde, sube el ajuste; si entran pronto, bájalo.
      </p>
    </div>
  );
}
