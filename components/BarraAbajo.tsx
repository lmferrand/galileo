"use client";

// Barra de abajo del afinador: volver al estudio, el metrónomo y grabarte. Ocupa
// el borde de abajo de la pantalla (también el hueco que deja el iPhone en modo app).

interface Props {
  onEstudio: () => void;
  onMetronomo: () => void;
  onLooper: () => void;
  onGrabar: () => void;
  /** El looper está grabando o sonando. */
  looperActivo: boolean;
  /** El metrónomo suena: su icono late con cada golpe. */
  metronomoSonando: boolean;
  golpe: number;
}

export default function BarraAbajo({ onEstudio, onMetronomo, onLooper, onGrabar, looperActivo, metronomoSonando, golpe }: Props) {
  return (
    <nav className="barra-abajo" aria-label="Herramientas">
      <button type="button" onClick={onEstudio} aria-label="Volver al estudio para elegir otro instrumento">
        <IconoEstudio />
        <span>Estudio</span>
      </button>
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
