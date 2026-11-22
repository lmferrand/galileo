"use client";

// Barra de abajo del afinador: volver al estudio, la Mesa, el ampli de la guitarra (con la
// eléctrica y la acústica; el bajo no tiene), el metrónomo, el looper y grabarte. Ocupa el borde
// de abajo de la pantalla (también el hueco que deja el iPhone en modo app).

import { useEstadoMesa } from "@/lib/mesa/usarMesa";

interface Props {
  onEstudio: () => void;
  onMesa: () => void;
  /** Abre el ampli y la pedalera de la guitarra. Sin él (el bajo), el botón no sale. */
  onAmpli?: () => void;
  onMetronomo: () => void;
  onLooper: () => void;
  onGrabar: () => void;
  /** El looper está grabando o sonando. */
  looperActivo: boolean;
  /** El metrónomo suena: su icono late con cada golpe. */
  metronomoSonando: boolean;
  golpe: number;
}

export default function BarraAbajo({ onEstudio, onMesa, onAmpli, onMetronomo, onLooper, onGrabar, looperActivo, metronomoSonando, golpe }: Props) {
  const mesaEncendida = useEstadoMesa() === "encendida";
  return (
    <nav className={`barra-abajo${onAmpli ? " seis" : ""}`} aria-label="Herramientas">
      <button type="button" onClick={onEstudio} aria-label="Volver al estudio para elegir otro instrumento">
        <IconoEstudio />
        <span>Estudio</span>
      </button>
      <button type="button" onClick={onMesa} className={mesaEncendida ? "activo" : ""} aria-label={mesaEncendida ? "Mesa, encendida" : "Mesa"}>
        <IconoMesa />
        <span>Mesa</span>
      </button>
      {onAmpli && (
        <button type="button" onClick={onAmpli} aria-label="Amplificador y pedalera">
          <IconoAmpli />
          <span>Ampli</span>
        </button>
      )}
      <button type="button" onClick={onMetronomo} className={metronomoSonando ? "activo" : ""} aria-label={metronomoSonando ? "Metrónomo, sonando" : "Metrónomo"}>
        <span key={metronomoSonando ? golpe : -1} className={`barra-icono ${metronomoSonando ? "late" : ""}`}>
          <IconoMetronomo />
        </span>
        <span>Metrónomo</span>
      </button>
      <button type="button" onClick={onLooper} className={looperActivo ? "activo" : ""} aria-label={looperActivo ? "Looper, sonando" : "Looper"}>
        <span className={`barra-icono ${looperActivo ? "gira" : ""}`}>
          <IconoLooper />
        </span>
        <span>Looper</span>
      </button>
      <button type="button" onClick={onGrabar}>
        <IconoGrabar />
        <span>Grabar</span>
      </button>
    </nav>
  );
}

/** Un ampli de guitarra: la caja, sus mandos arriba y el altavoz. */
function IconoAmpli() {
  return (
    <svg className="icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="3.5" y="4.5" width="17" height="15" rx="2.2" />
      <path d="M3.5 9h17" />
      <path d="M7 6.8h.01M10 6.8h.01M13 6.8h.01" strokeWidth="2.2" />
      <circle cx="12" cy="14.2" r="3.1" />
    </svg>
  );
}

/** Tres faders de mesa de mezclas, cada uno a una altura. */
function IconoMesa() {
  return (
    <svg className="icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M6 4v16M12 4v16M18 4v16" opacity="0.55" />
      <rect x="3.6" y="12.5" width="4.8" height="3.4" rx="1" fill="currentColor" stroke="none" />
      <rect x="9.6" y="6.5" width="4.8" height="3.4" rx="1" fill="currentColor" stroke="none" />
      <rect x="15.6" y="10" width="4.8" height="3.4" rx="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

/** Un foco de escenario: el foco redondo, su cono de luz y el círculo de luz en el suelo. */
function IconoEstudio() {
  return (
    <svg viewBox="0 0 24 24" className="icono" aria-hidden="true">
      <path d="M12 1.6v1.2" />
      <circle cx="12" cy="5.4" r="2.6" />
      <path d="M9.7 7.2 4.4 19.2a7.8 1.9 0 0 0 15.2 0L14.3 7.2z" className="luz" />
      <path d="M9.7 7.2 4.4 19.2M14.3 7.2l5.3 12" className="haz" />
      <ellipse cx="12" cy="19.6" rx="7.8" ry="1.9" />
    </svg>
  );
}

function IconoMetronomo() {
  return (
    <svg viewBox="0 0 24 24" className="icono" aria-hidden="true">
      <path d="M9.2 3.5h5.6l3.7 16.5H5.5z" />
      <path d="M7 15h10M12 15l4.5-8" />
    </svg>
  );
}

/** Dos flechas en círculo: el bucle. */
function IconoLooper() {
  return (
    <svg viewBox="0 0 24 24" className="icono" aria-hidden="true">
      <path d="M19.5 12a7.5 7.5 0 0 1-12.8 5.3" />
      <path d="M4.5 12a7.5 7.5 0 0 1 12.8-5.3" />
      <path d="M17.6 3.4v3.4h-3.4M6.4 20.6v-3.4h3.4" />
    </svg>
  );
}

function IconoGrabar() {
  return (
    <svg viewBox="0 0 24 24" className="icono" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.6" className="relleno" />
    </svg>
  );
}
