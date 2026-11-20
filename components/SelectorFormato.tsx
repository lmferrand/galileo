"use client";

// Elegir en qué formato salen los archivos que exportas: MP3 o WAV (lib/pistas/formato).

import { ponerFormato, useFormato } from "@/lib/pistas/formato";

export default function SelectorFormato() {
  const formato = useFormato();
  return (
    <div className="formato">
      <span className="formato-titulo">Archivo</span>
      <div className="segmentado formato-opciones" role="group" aria-label="Formato del archivo">
        <button type="button" aria-pressed={formato === "mp3"} onClick={() => ponerFormato("mp3")}>
          MP3
        </button>
        <button type="button" aria-pressed={formato === "wav"} onClick={() => ponerFormato("wav")}>
          WAV
        </button>
      </div>
      <span className="formato-nota">{formato === "mp3" ? "Pesa unas 9 veces menos: para mandarlo." : "Sin comprimir: ocupa mucho más."}</span>
    </div>
  );
}
