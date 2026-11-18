"use client";

// Hoja «Para tocar»: canciones libres ya separadas, por estilos. Si ya la tienes, se abre;
// si no, se baja (con su barra) y se abre. La lista viene de Hugging Face (lib/pistas/paraTocar).

import { useEffect, useMemo, useState } from "react";
import { pedirPersistencia } from "@/lib/pistas/almacen";
import { bajarTema, cargarCatalogo, idParaTocar, type CatalogoParaTocar, type TemaParaTocar } from "@/lib/pistas/paraTocar";
import { formatoMB, formatoTiempo, type Cancion } from "@/lib/pistas/tipos";

interface Props {
  /** La hoja está abierta (la lista se pide la primera vez que se abre). */
  activa: boolean;
  canciones: Cancion[];
  onAbrir: (c: Cancion) => void;
}

export default function ParaTocar({ activa, canciones, onAbrir }: Props) {
  const [catalogo, setCatalogo] = useState<CatalogoParaTocar | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const [intento, setIntento] = useState(0);
  const [estilo, setEstilo] = useState<string | null>(null);
  const [bajando, setBajando] = useState<{ id: string; fraccion: number } | null>(null);

  useEffect(() => {
    if (!activa || catalogo) return;
    let vivo = true;
    cargarCatalogo()
      .then((c) => vivo && setCatalogo(c))
      .catch((e) => vivo && setFallo((e as Error).message));
    return () => {
      vivo = false;
    };
  }, [activa, catalogo, intento]);

  const tienes = useMemo(() => new Map(canciones.map((c) => [c.id, c])), [canciones]);
  const lista = catalogo?.canciones.filter((t) => !estilo || t.estilo === estilo) ?? [];

  const tocar = async (t: TemaParaTocar) => {
    const ya = tienes.get(idParaTocar(t));
    if (ya) return onAbrir(ya);
    if (bajando) return;
    setFallo(null);
    setBajando({ id: t.id, fraccion: 0 });
    try {
      const c = await bajarTema(t, (fraccion) => setBajando({ id: t.id, fraccion }));
      pedirPersistencia();
      onAbrir(c);
    } catch (e) {
      const m = (e as Error).message || "";
      setFallo(/quota|QuotaExceeded/i.test(m) ? "No cabe en el aparato. Borra alguna canción y vuelve a probar." : m || "No se ha podido bajar.");
    } finally {
      setBajando(null);
    }
  };

  return (
    <div className="tocar">
      {catalogo && (
        <div className="tocar-estilos">
          <button type="button" className={estilo === null ? "activo" : ""} aria-pressed={estilo === null} onClick={() => setEstilo(null)}>
            Todas
          </button>
          {catalogo.estilos.map((e) => (
            <button type="button" key={e} className={estilo === e ? "activo" : ""} aria-pressed={estilo === e} onClick={() => setEstilo(e)}>
              {e}
            </button>
          ))}
        </div>
      )}

      {!catalogo && !fallo && <p className="tocar-aviso">Cargando…</p>}
      {fallo && (
        <div className="tocar-aviso" role="alert">
          <p>{fallo}</p>
          {!catalogo && (
            <button
              type="button"
              className="boton-texto"
              onClick={() => {
                setFallo(null);
                setIntento((i) => i + 1);
              }}
            >
              Reintentar
            </button>
          )}
        </div>
      )}

      {catalogo && (
        <ul className="tocar-lista">
          {lista.map((t) => {
            const ya = tienes.has(idParaTocar(t));
            const aqui = bajando?.id === t.id ? bajando : null;
            return (
              <li key={t.id}>
                <button type="button" className="tocar-fila" onClick={() => void tocar(t)} disabled={bajando !== null && !aqui}>
                  <span className={`tocar-icono${ya ? " tienes" : ""}`} aria-hidden="true">
                    {ya ? (
                      <svg viewBox="0 0 24 24">
                        <path d="M9.5 7.2v9.6l7.6-4.8z" fill="currentColor" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M12 5v10M7.5 10.5 12 15l4.5-4.5M6 19h12" />
                      </svg>
                    )}
                  </span>
                  <span className="tocar-textos">
                    <span className="tocar-nombre">{t.titulo}</span>
                    <span className="tocar-datos">
                      {estilo === null && `${t.estilo} · `}
                      {formatoTiempo(t.duracion)}
                      {t.bpm ? ` · ${t.bpm} bpm` : ""}
                      {!ya && ` · ${formatoMB(t.bytes)}`}
                    </span>
                    {aqui && (
                      <span className="progreso" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(aqui.fraccion * 100)}>
                        <span style={{ width: `${Math.max(3, aqui.fraccion * 100)}%` }} />
                      </span>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {catalogo && <p className="tocar-credito">{catalogo.credito}</p>}
    </div>
  );
}
