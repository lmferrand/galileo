"use client";

// Los repertorios para tocar en directo: crear uno, ponerle nombre, elegir sus canciones (de las
// del aparato) y ordenarlas; «Tocar en directo» abre el modo escenario (Directo).

import { useState } from "react";
import { formatoTiempo, type Cancion } from "@/lib/pistas/tipos";
import { guardarRepertorios, leerRepertorios, nuevoRepertorio, type Repertorio as TipoRepertorio } from "@/lib/pistas/repertorio";

interface Props {
  canciones: Cancion[];
  onDirecto: (r: TipoRepertorio) => void;
}

export default function Repertorio({ canciones, onDirecto }: Props) {
  const [lista, setLista] = useState<TipoRepertorio[]>(() => (typeof window === "undefined" ? [] : leerRepertorios()));
  const [editando, setEditando] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [borrando, setBorrando] = useState<string | null>(null);

  const cambiar = (nueva: TipoRepertorio[]) => {
    setLista(nueva);
    guardarRepertorios(nueva);
  };
  const cambiarUno = (id: string, f: (r: TipoRepertorio) => TipoRepertorio) => cambiar(lista.map((r) => (r.id === id ? f(r) : r)));
  const porId = new Map(canciones.map((c) => [c.id, c]));
  const crear = () => {
    const r = nuevoRepertorio(nombre.trim() || `Concierto ${lista.length + 1}`);
    cambiar([...lista, r]);
    setNombre("");
    setEditando(r.id);
  };

  const enEdicion = lista.find((r) => r.id === editando);
  if (enEdicion) {
    const suyas = enEdicion.canciones.filter((id) => porId.has(id));
    const mover = (i: number, paso: -1 | 1) =>
      cambiarUno(enEdicion.id, (r) => {
        const cs = r.canciones.filter((id) => porId.has(id));
        const j = i + paso;
        if (j < 0 || j >= cs.length) return r;
        [cs[i], cs[j]] = [cs[j], cs[i]];
        return { ...r, canciones: cs };
      });
    return (
      <div className="repertorio">
        <label className="repertorio-nombre">
          <span>Nombre</span>
          <input type="text" value={enEdicion.nombre} maxLength={60} onChange={(e) => cambiarUno(enEdicion.id, (r) => ({ ...r, nombre: e.target.value }))} />
        </label>

        <h3>Canciones, en orden ({suyas.length})</h3>
        {suyas.length === 0 ? (
          <p className="practica-ayuda">Añade abajo las canciones del concierto.</p>
        ) : (
          <ol className="repertorio-canciones">
            {suyas.map((id, i) => {
              const c = porId.get(id)!;
              return (
                <li key={id}>
                  <span className="repertorio-cancion">
                    {c.nombre} <small>{formatoTiempo(c.duracion)}</small>
                  </span>
                  <button type="button" className="boton-texto suave" onClick={() => mover(i, -1)} disabled={i === 0} aria-label={`Subir ${c.nombre}`}>
                    ↑
                  </button>
                  <button type="button" className="boton-texto suave" onClick={() => mover(i, 1)} disabled={i === suyas.length - 1} aria-label={`Bajar ${c.nombre}`}>
                    ↓
                  </button>
                  <button
                    type="button"
                    className="boton-texto suave"
                    onClick={() => cambiarUno(enEdicion.id, (r) => ({ ...r, canciones: r.canciones.filter((x) => x !== id) }))}
                    aria-label={`Quitar ${c.nombre}`}
                  >
                    ✕
                  </button>
                </li>
              );
            })}
          </ol>
        )}

        <h3>Añadir</h3>
        {canciones.filter((c) => !enEdicion.canciones.includes(c.id)).length === 0 ? (
          <p className="practica-ayuda">{canciones.length === 0 ? "Primero separa o añade canciones en Pistas." : "Ya están todas tus canciones."}</p>
        ) : (
          <div className="repertorio-anadir">
            {canciones
              .filter((c) => !enEdicion.canciones.includes(c.id))
              .map((c) => (
                <button key={c.id} type="button" className="chip" onClick={() => cambiarUno(enEdicion.id, (r) => ({ ...r, canciones: [...r.canciones, c.id] }))}>
                  + {c.nombre}
                </button>
              ))}
          </div>
        )}

        <div className="repertorio-pie">
          <button type="button" className="boton-secundario" onClick={() => setEditando(null)}>
            Listo
          </button>
          <button type="button" className="boton-principal" onClick={() => onDirecto({ ...enEdicion, canciones: suyas })} disabled={suyas.length === 0}>
            Tocar en directo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="repertorio">
      <p className="practica-ayuda">
        Prepara la lista de canciones de tu concierto. En directo, cada una suena como la dejaste (su mezcla, su velocidad y su tono), con botones grandes, sus partes a mano y
        el pedal.
      </p>
      {lista.length > 0 && (
        <ul className="repertorio-lista">
          {lista.map((r) => {
            const n = r.canciones.filter((id) => porId.has(id)).length;
            return (
              <li key={r.id}>
                <span className="repertorio-cancion">
                  {r.nombre} <small>{n === 1 ? "1 canción" : `${n} canciones`}</small>
                </span>
                {borrando === r.id ? (
                  <>
                    <button
                      type="button"
                      className="boton-texto peligro"
                      onClick={() => {
                        cambiar(lista.filter((x) => x.id !== r.id));
                        setBorrando(null);
                      }}
                    >
                      Borrar
                    </button>
                    <button type="button" className="boton-texto" onClick={() => setBorrando(null)}>
                      No
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" className="boton-texto" onClick={() => setEditando(r.id)}>
                      Editar
                    </button>
                    <button type="button" className="boton-texto suave" onClick={() => setBorrando(r.id)} aria-label={`Borrar ${r.nombre}`}>
                      ✕
                    </button>
                    <button type="button" className="boton-principal repertorio-tocar" onClick={() => onDirecto({ ...r, canciones: r.canciones.filter((id) => porId.has(id)) })} disabled={n === 0}>
                      Tocar en directo
                    </button>
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="repertorio-nuevo">
        <input type="text" placeholder="Nombre del concierto" value={nombre} maxLength={60} onChange={(e) => setNombre(e.target.value)} onKeyDown={(e) => e.key === "Enter" && crear()} />
        <button type="button" className="boton-secundario" onClick={crear}>
          Nuevo repertorio
        </button>
      </div>
    </div>
  );
}
