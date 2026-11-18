"use client";

// Grabarte tocando y escucharte. Se queda solo en el aparato (no se sube a
// ningún sitio) y se puede guardar o compartir. Hasta 5 minutos.

import { useEffect, useRef, useState } from "react";

const MAX_SEGUNDOS = 300;

type Estado =
  | { fase: "lista" }
  | { fase: "pidiendo" }
  | { fase: "grabando"; desde: number }
  | { fase: "hecha"; url: string; blob: Blob; segundos: number }
  | { fase: "error"; texto: string };

function tipoQueSirve(): string {
  const candidatos = ["audio/mp4", "audio/webm;codecs=opus", "audio/webm"];
  return candidatos.find((t) => typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(t)) ?? "";
}

const reloj = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;

export default function Grabadora() {
  const [estado, setEstado] = useState<Estado>({ fase: "lista" });
  const [ahora, setAhora] = useState(0);
  const grabadora = useRef<MediaRecorder | null>(null);
  const flujo = useRef<MediaStream | null>(null);
  const trozos = useRef<Blob[]>([]);

  const soltarMicro = () => {
    flujo.current?.getTracks().forEach((p) => p.stop());
    flujo.current = null;
  };

  // Al cerrar la hoja se para y se suelta el micro.
  useEffect(
    () => () => {
      if (grabadora.current?.state === "recording") grabadora.current.stop();
      soltarMicro();
    },
    [],
  );

  // Reloj mientras graba (y corte a los 5 minutos).
  const grabandoDesde = estado.fase === "grabando" ? estado.desde : null;
  useEffect(() => {
    if (grabandoDesde === null) return;
    const id = setInterval(() => {
      const s = (performance.now() - grabandoDesde) / 1000;
      setAhora(s);
      if (s >= MAX_SEGUNDOS) grabadora.current?.stop();
    }, 250);
    return () => clearInterval(id);
  }, [grabandoDesde]);

  // La grabación anterior se suelta al hacer otra o al cerrar.
  const urlHecha = estado.fase === "hecha" ? estado.url : null;
  useEffect(() => () => void (urlHecha && URL.revokeObjectURL(urlHecha)), [urlHecha]);

  const grabar = async () => {
    if (typeof MediaRecorder === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setEstado({ fase: "error", texto: "Este navegador no deja grabar. Prueba en Safari o en Chrome." });
      return;
    }
    setEstado({ fase: "pidiendo" });
    try {
      flujo.current = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false },
      });
    } catch {
      setEstado({ fase: "error", texto: "No hay permiso para el micrófono. En el iPhone: Ajustes, Safari, Micrófono." });
      return;
    }
    const tipo = tipoQueSirve();
    const g = new MediaRecorder(flujo.current, tipo ? { mimeType: tipo } : undefined);
    trozos.current = [];
    g.ondataavailable = (e) => {
      if (e.data.size) trozos.current.push(e.data);
    };
    g.onstop = () => {
      soltarMicro();
      const blob = new Blob(trozos.current, { type: g.mimeType || tipo || "audio/mp4" });
      const segundos = (performance.now() - inicio) / 1000;
      setEstado({ fase: "hecha", url: URL.createObjectURL(blob), blob, segundos });
    };
    grabadora.current = g;
    const inicio = performance.now();
    g.start(1000);
    setAhora(0);
    setEstado({ fase: "grabando", desde: inicio });
  };

  const parar = () => grabadora.current?.stop();

  const guardar = async () => {
    if (estado.fase !== "hecha") return;
    const ext = estado.blob.type.includes("webm") ? "webm" : "m4a";
    const fecha = new Date().toLocaleString("es-ES", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).replace(/[/:, ]+/g, "-");
    const archivo = new File([estado.blob], `Clavija ${fecha}.${ext}`, { type: estado.blob.type });
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    if (nav.canShare?.({ files: [archivo] })) {
      try {
        await navigator.share({ files: [archivo] });
        return;
      } catch {
        /* cancelado: no pasa nada */
        return;
      }
    }
    const a = document.createElement("a");
    a.href = estado.url;
    a.download = archivo.name;
    a.click();
  };

  return (
    <div className="grabar">
      {estado.fase === "hecha" ? (
        <>
          <audio className="grabar-audio" src={estado.url} controls preload="auto" />
          <p className="grabar-ayuda">Dura {reloj(estado.segundos)}. Se queda solo en este aparato hasta que cierres la hoja.</p>
          <div className="grabar-acciones">
            <button type="button" className="boton-secundario" onClick={grabar}>
              Grabar otra vez
            </button>
            <button type="button" className="boton-principal" onClick={guardar}>
              Guardar o compartir
            </button>
          </div>
        </>
      ) : (
        <>
          <button
            type="button"
            className={`grabar-boton ${estado.fase === "grabando" ? "grabando" : ""}`}
            onClick={estado.fase === "grabando" ? parar : grabar}
            disabled={estado.fase === "pidiendo"}
            aria-label={estado.fase === "grabando" ? "Parar la grabación" : "Empezar a grabar"}
          >
            <span className="grabar-punto" aria-hidden="true" />
          </button>
          <p className="grabar-reloj" aria-live="polite">
            {estado.fase === "grabando" ? reloj(ahora) : estado.fase === "pidiendo" ? "Un momento…" : "Toca para grabarte"}
          </p>
          <p className="grabar-ayuda">
            {estado.fase === "error"
              ? estado.texto
              : estado.fase === "grabando"
                ? "Toca otra vez para parar. Deja esta hoja abierta mientras grabas."
                : "Para escuchar cómo suenas tocando. Hasta 5 minutos."}
          </p>
        </>
      )}
    </div>
  );
}
