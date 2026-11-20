"use client";

// Para practicar un pasaje: el bucle por compases («2 compases desde aquí», un compás antes o
// después) y el entrenador de velocidad (empiezas lento y la velocidad sube sola un 5 % cada tantas
// vueltas, hasta la de la canción). Los compases salen del ritmo de la canción (lib/pistas/compases).
// Se usa en la pantalla de Pistas («Para practicar») y en la hoja «Bucle» de la Mesa.

/** Lo que hace falta de la reproducción (lo da components/Reproduccion) */
export interface Practica {
  /** Se sabe el ritmo de la canción: se pueden usar los compases */
  conCompases: boolean;
  /** Se está buscando */
  buscando: boolean;
  /** Se buscó y no se encontró (la batería no se oye clara) */
  sinRitmo: boolean;
  /** Buscar el ritmo de la canción ahora (sin encender el click) */
  onBuscar: () => void;
  /** Cuántos compases mide el trozo que se repite, si cae en compases */
  compasesDelBucle: number | null;
  /** Repetir `n` compases desde el compás donde está la canción */
  onCompases: (n: number) => void;
  /** El bucle, tantos compases más allá (−1: uno antes) */
  onMover: (pasos: number) => void;
  /** El entrenador: la velocidad sube un 5 % cada `cada` vueltas del bucle */
  entrenar: boolean;
  cada: number;
  /** Vueltas dadas a la velocidad de ahora */
  vuelta: number;
  onEntrenar: (si: boolean) => void;
  onCada: (n: number) => void;
}

const COMPASES = [1, 2, 4, 8];
const VUELTAS = [1, 2, 4];

interface Props {
  p: Practica;
  /** Hay un trozo elegido (para poder moverlo) */
  hayTrozo: boolean;
  /** El trozo se está repitiendo */
  repitiendo: boolean;
  /** La velocidad de ahora (1 = la de la canción) */
  velocidad: number;
}

export default function PracticaBucle({ p, hayTrozo, repitiendo, velocidad }: Props) {
  const ahora = Math.round(velocidad * 100);
  const estado = !p.entrenar
    ? p.conCompases
      ? "Los números repiten esos compases desde donde está la canción. Con el entrenador, empiezas lento y la velocidad sube sola hasta la de la canción."
      : "Con el entrenador, empiezas lento y la velocidad sube sola en cada vuelta del trozo, hasta la de la canción."
    : !repitiendo
      ? "Elige el trozo que quieres repetir y la velocidad a la que empezar: subirá sola con las vueltas."
      : velocidad >= 1
        ? "Ya vas al 100 %: a la velocidad de la canción."
        : `Ahora al ${ahora} %: vuelta ${Math.min(p.cada, p.vuelta + 1)} de ${p.cada}; después sube al ${Math.min(100, ahora + 5)} %.`;
  return (
    <div className="pb">
      <div className="pb-fila">
        <span className="pb-titulo">Por compases</span>
        {p.conCompases ? (
          <>
            <div className="pb-chips" role="group" aria-label="Repetir compases desde donde está la canción">
              {COMPASES.map((n) => (
                <button key={n} type="button" className="chip" aria-pressed={repitiendo && p.compasesDelBucle === n} onClick={() => p.onCompases(n)} aria-label={n === 1 ? "Repetir 1 compás" : `Repetir ${n} compases`}>
                  {n}
                </button>
              ))}
            </div>
            <div className="pb-chips">
              <button type="button" className="chip" onClick={() => p.onMover(-1)} disabled={!hayTrozo} aria-label="El bucle, un compás antes">
                ◀
              </button>
              <button type="button" className="chip" onClick={() => p.onMover(1)} disabled={!hayTrozo} aria-label="El bucle, un compás después">
                ▶
              </button>
            </div>
          </>
        ) : (
          <>
            <button type="button" className="chip" onClick={p.onBuscar} disabled={p.buscando}>
              {p.buscando ? "Buscando el ritmo…" : p.sinRitmo ? "Buscar el ritmo otra vez" : "Buscar el ritmo de la canción"}
            </button>
            <span className="pb-nota">{p.sinRitmo ? "No lo encuentro: la batería no se oye clara." : "Hace falta para saber dónde empieza cada compás."}</span>
          </>
        )}
      </div>
      <button type="button" className={`interruptor-mini pb-interruptor ${p.entrenar ? "on" : ""}`} role="switch" aria-checked={p.entrenar} onClick={() => p.onEntrenar(!p.entrenar)}>
        <span className="interruptor-pista" aria-hidden="true">
          <span className="interruptor-bola" />
        </span>
        <span>Entrenador de velocidad</span>
      </button>
      {p.entrenar && (
        <div className="pb-fila">
          <span className="pb-titulo">Sube un 5 % cada</span>
          <div className="pb-chips" role="group" aria-label="Cada cuántas vueltas sube la velocidad">
            {VUELTAS.map((n) => (
              <button key={n} type="button" className="chip" aria-pressed={p.cada === n} onClick={() => p.onCada(n)}>
                {n === 1 ? "1 vuelta" : `${n} vueltas`}
              </button>
            ))}
          </div>
        </div>
      )}
      <p className="practica-ayuda pb-estado" aria-live="polite">
        {estado}
      </p>
    </div>
  );
}
