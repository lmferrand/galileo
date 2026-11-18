"use client";

// Barra de abajo del afinador: volver al estudio, el metrónomo y grabarte. Ocupa
// el borde de abajo de la pantalla (también el hueco que deja el iPhone en modo app).

interface Props {
  onEstudio: () => void;
  onMetronomo: () => void;
  onGrabar: () => void;
  /** El metrónomo suena: su icono late con cada golpe. */
  metronomoSonando: boolean;
  golpe: number;
}

export default function BarraAbajo({ onEstudio, onMetronomo, onGrabar, metronomoSonando, golpe }: Props) {
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
      <button type="button" onClick={onGrabar}>
        <IconoGrabar />
        <span>Grabar</span>
      </button>
    </nav>
  );
}

/** Una guitarra: volver al estudio a elegir instrumento. */
function IconoEstudio() {
  return (
    <svg viewBox="0 0 24 24" className="icono" aria-hidden="true">
      <path d="M15 4.5l4.5 4.5M17.6 6.4l-6.9 6.9" />
      <path d="M10.2 11.6a3.3 3.3 0 0 0-4.7.2c-1.1 1.2-.8 2.3-1.8 3.3-1 1-1.1 2.6 0 3.7 1.1 1.1 2.7 1 3.7 0 1-1 2.1-.7 3.3-1.8a3.3 3.3 0 0 0 .2-4.7" />
      <circle cx="8.6" cy="15.4" r="1.1" />
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

function IconoGrabar() {
  return (
    <svg viewBox="0 0 24 24" className="icono" aria-hidden="true">
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3.6" className="relleno" />
    </svg>
  );
}
