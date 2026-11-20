"use client";

// Organizar las carpetas del selector de la grabadora (se abre con la lente de la rueda dentada, a
// la derecha de la placa): crear una carpeta (un álbum, un proyecto…), cambiarle el nombre,
// ordenarlas, quitarlas y pasar canciones de una a otra. Cada canción guarda su carpeta
// (Cancion.grupo, lib/pistas/grupos); el orden y las carpetas vacías se guardan en este aparato.
// Lo cambiado se ve aquí al momento (`cambios`) y luego llega la lista nueva (`onCambiadas`).

import { useState, type FormEvent } from "react";
import type { Cancion } from "@/lib/pistas/tipos";
import { agrupar, guardarGrupos, leerGrupos, SIN_GRUPO, tituloEn } from "@/lib/pistas/grupos";
import { cambiarGrupo } from "@/lib/pistas/almacen";

/** Lo que se está haciendo dentro de la hoja, además de mirar */
type Paso =
  | null
  /** `conMarcadas`: al crearla, las canciones marcadas pasan a ella */
  | { tipo: "nueva"; texto: string; conMarcadas?: boolean }
  | { tipo: "renombrar"; texto: string }
  | { tipo: "quitar" }
  /** Elegir a qué carpeta van las marcadas */
  | { tipo: "mover" }
  /** Elegir canciones de otras carpetas para traerlas a esta */
  | { tipo: "traer" };

const LARGO_NOMBRE = 40;
const cuantas = (n: number) => (n === 1 ? "1 canción" : `${n} canciones`);

interface Props {
  canciones: Cancion[];
  /** Han cambiado las carpetas: hay que volver a leer las canciones */
  onCambiadas: () => void;
  onCerrar: () => void;
}

export default function CarpetasMesa({ canciones, onCambiadas, onCerrar }: Props) {
  const [guardados, setGuardados] = useState<string[]>(() => leerGrupos());
  // Lo cambiado aquí, hasta que llegue la lista nueva
  const [cambios, setCambios] = useState<Record<string, string | null>>({});
  const lista = canciones.map((c) => (c.id in cambios ? { ...c, grupo: cambios[c.id] ?? undefined } : c));
  const grupos = agrupar(lista, guardados);
  // La carpeta que se está viendo por dentro (null: la lista de carpetas)
  const [abierta, setAbierta] = useState<string | null>(null);
  const [paso, setPaso] = useState<Paso>(null);
  const [marcadas, setMarcadas] = useState<Set<string>>(() => new Set());
  const grupo = abierta === null ? null : (grupos.find((g) => g.nombre === abierta) ?? { nombre: abierta, canciones: [] });

  const guardar = (gs: string[]) => {
    const limpia = [...new Set(gs)];
    setGuardados(limpia);
    guardarGrupos(limpia);
    onCambiadas();
  };
  const ponerGrupo = async (ids: string[], nombre: string | null) => {
    if (!ids.length) return;
    setCambios((c) => ({ ...c, ...Object.fromEntries(ids.map((id) => [id, nombre])) }));
    await Promise.all(ids.map((id) => cambiarGrupo(id, nombre).catch(() => undefined)));
    onCambiadas();
  };
  const ver = (nombre: string | null) => {
    setAbierta(nombre);
    setPaso(null);
    setMarcadas(new Set());
  };
  const marcar = (id: string) =>
    setMarcadas((m) => {
      const n = new Set(m);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const limpiar = (texto: string) => texto.trim().replace(/\s+/g, " ").slice(0, LARGO_NOMBRE);
  /** Crea la carpeta (si ya existe, se usa la que hay) y entra en ella */
  const crear = (texto: string, conMarcadas: boolean) => {
    const n = limpiar(texto);
    if (!n) return;
    const ids = conMarcadas ? [...marcadas] : [];
    if (n !== SIN_GRUPO && !grupos.some((g) => g.nombre === n)) guardar([...guardados, n]);
    void ponerGrupo(ids, n);
    ver(n);
  };
  const renombrar = (texto: string) => {
    const n = limpiar(texto);
    if (!grupo || !n || n === grupo.nombre) return setPaso(null);
    const viejo = grupo.nombre;
    if (n !== SIN_GRUPO) guardar(guardados.includes(viejo) ? guardados.map((g) => (g === viejo ? n : g)) : [...guardados, n]);
    else guardar(guardados.filter((g) => g !== viejo));
    void ponerGrupo(grupo.canciones.map((c) => c.id), n);
    ver(n);
  };
  /** Se puede quitar si la hiciste tú (las de un artista salen solas del nombre de sus canciones) */
  const esPropia = (nombre: string) => nombre !== SIN_GRUPO && (guardados.includes(nombre) || lista.some((c) => c.grupo?.trim() === nombre));
  const quitar = () => {
    if (!grupo) return;
    const nombre = grupo.nombre;
    guardar(guardados.filter((g) => g !== nombre));
    void ponerGrupo(grupo.canciones.filter((c) => c.grupo?.trim() === nombre).map((c) => c.id), null);
    ver(null);
  };
  /** Sube o baja una carpeta: desde entonces el orden es el que se ve («Mis canciones», siempre al final) */
  const mover = (nombre: string, hacia: -1 | 1) => {
    const orden = grupos.map((g) => g.nombre).filter((n) => n !== SIN_GRUPO);
    const i = orden.indexOf(nombre);
    const j = i + hacia;
    if (i < 0 || j < 0 || j >= orden.length) return;
    [orden[i], orden[j]] = [orden[j], orden[i]];
    guardar(orden);
  };
  const pasarA = (nombre: string) => {
    void ponerGrupo([...marcadas], nombre);
    setMarcadas(new Set());
    setPaso(null);
  };
  const traer = () => {
    if (!grupo) return;
    void ponerGrupo([...marcadas], grupo.nombre);
    setMarcadas(new Set());
    setPaso(null);
  };

  const formulario = (titulo: string, texto: string, alCambiar: (t: string) => void, alEnviar: () => void, boton: string) => (
    <form
      className="cm-form"
      onSubmit={(e: FormEvent) => {
        e.preventDefault();
        alEnviar();
      }}
    >
      <label>
        <span>{titulo}</span>
        {/* Se abre al pulsar su botón: lo siguiente es escribir */}
        <input value={texto} onChange={(e) => alCambiar(e.target.value)} maxLength={LARGO_NOMBRE} placeholder="Un álbum, un proyecto…" autoFocus enterKeyHint="done" />
      </label>
      <div className="cm-fila">
        <button type="submit" className="boton-principal" disabled={!texto.trim()}>
          {boton}
        </button>
        <button type="button" className="boton-texto" onClick={() => setPaso(null)}>
          Cancelar
        </button>
      </div>
    </form>
  );

  const fila = (c: Cancion, en: string) => (
    <li key={c.id}>
      <label className="cm-cancion">
        <input type="checkbox" checked={marcadas.has(c.id)} onChange={() => marcar(c.id)} />
        <span>{tituloEn(c, en)}</span>
      </label>
    </li>
  );

  const otras = grupo ? grupos.filter((g) => g.nombre !== grupo.nombre) : [];
  const n = marcadas.size;

  return (
    <div className="hoja-fondo" onClick={onCerrar}>
      <div className="hoja" role="dialog" aria-modal="true" aria-label="Carpetas" onClick={(e) => e.stopPropagation()}>
        <div className="hoja-asa" aria-hidden="true" />
        <header className="hoja-cabecera">
          {grupo ? (
            <button type="button" className="boton-texto cm-atras" onClick={() => ver(null)}>
              <Flecha hacia="izq" /> Carpetas
            </button>
          ) : (
            <h2>Carpetas</h2>
          )}
          <button type="button" className="boton-texto" onClick={onCerrar}>
            Listo
          </button>
        </header>

        {!grupo ? (
          // ---------- Todas las carpetas ----------
          <div className="hoja-cuerpo cm-hoja">
            <p className="toma-ayuda">Son las carpetas del selector de la grabadora. Toca una para ver sus canciones, cambiarle el nombre o pasar canciones a otra.</p>
            {paso?.tipo === "nueva" ? (
              formulario("Nombre de la carpeta", paso.texto, (texto) => setPaso({ tipo: "nueva", texto }), () => crear(paso.texto, false), "Crear")
            ) : (
              <button type="button" className="boton-secundario ancho" onClick={() => setPaso({ tipo: "nueva", texto: "" })}>
                Nueva carpeta
              </button>
            )}
            <ul className="cm-lista">
              {grupos.map((g, i) => {
                const fija = g.nombre === SIN_GRUPO;
                const ultima = i === grupos.length - 1 || grupos[i + 1].nombre === SIN_GRUPO;
                return (
                  <li key={g.nombre} className="cm-carpeta">
                    <button type="button" className="cm-carpeta-abrir" onClick={() => ver(g.nombre)}>
                      <Carpeta />
                      <span className="cm-carpeta-nombre">{g.nombre}</span>
                      <small>{g.canciones.length ? cuantas(g.canciones.length) : "vacía"}</small>
                    </button>
                    {!fija && (
                      <>
                        <button type="button" className="cm-orden" onClick={() => mover(g.nombre, -1)} disabled={i === 0} aria-label={`Subir «${g.nombre}»`}>
                          <Flecha hacia="arriba" />
                        </button>
                        <button type="button" className="cm-orden" onClick={() => mover(g.nombre, 1)} disabled={ultima} aria-label={`Bajar «${g.nombre}»`}>
                          <Flecha hacia="abajo" />
                        </button>
                      </>
                    )}
                  </li>
                );
              })}
            </ul>
            {grupos.length === 0 && <p className="toma-estado">Todavía no hay canciones ni carpetas.</p>}
          </div>
        ) : (
          // ---------- Una carpeta por dentro ----------
          <div className="hoja-cuerpo cm-hoja">
            <h3 className="cm-titulo">
              <Carpeta /> {grupo.nombre}
            </h3>

            {paso?.tipo === "renombrar" ? (
              formulario("Nombre nuevo", paso.texto, (texto) => setPaso({ tipo: "renombrar", texto }), () => renombrar(paso.texto), "Guardar")
            ) : paso?.tipo === "quitar" ? (
              <div className="cm-aviso">
                <p>
                  Se quita la carpeta «{grupo.nombre}». Sus canciones <strong>no se borran</strong>: vuelven a la carpeta de su artista o a «{SIN_GRUPO}».
                </p>
                <div className="cm-fila">
                  <button type="button" className="boton-secundario peligro" onClick={quitar}>
                    Quitar la carpeta
                  </button>
                  <button type="button" className="boton-texto" onClick={() => setPaso(null)}>
                    Cancelar
                  </button>
                </div>
              </div>
            ) : paso?.tipo === "nueva" ? (
              formulario("Nombre de la carpeta nueva", paso.texto, (texto) => setPaso({ tipo: "nueva", texto, conMarcadas: true }), () => crear(paso.texto, true), n ? `Crear y pasar ${cuantas(n)}` : "Crear")
            ) : paso?.tipo === "mover" ? (
              // A qué carpeta van las marcadas
              <div className="cm-aviso">
                <p>¿A qué carpeta {n === 1 ? "pasa la canción marcada" : `pasan las ${n} canciones marcadas`}?</p>
                <div className="cm-destinos">
                  {otras.map((g) => (
                    <button key={g.nombre} type="button" className="chip" onClick={() => pasarA(g.nombre)}>
                      {g.nombre}
                    </button>
                  ))}
                  <button type="button" className="chip cm-chip-nueva" onClick={() => setPaso({ tipo: "nueva", texto: "", conMarcadas: true })}>
                    Carpeta nueva…
                  </button>
                </div>
                <button type="button" className="boton-texto" onClick={() => setPaso(null)}>
                  Cancelar
                </button>
              </div>
            ) : paso?.tipo === "traer" ? null : (
              <div className="cm-fila">
                <button type="button" className="boton-secundario" onClick={() => setPaso({ tipo: "renombrar", texto: grupo.nombre })}>
                  Cambiar el nombre
                </button>
                {esPropia(grupo.nombre) && (
                  <button type="button" className="boton-texto peligro" onClick={() => setPaso({ tipo: "quitar" })}>
                    Quitar la carpeta
                  </button>
                )}
              </div>
            )}

            {paso?.tipo === "traer" ? (
              // Canciones de las otras carpetas, para traerlas a esta
              <>
                <p className="toma-ayuda">Marca las canciones que quieres traer a «{grupo.nombre}».</p>
                {otras
                  .filter((g) => g.canciones.length)
                  .map((g) => (
                    <section key={g.nombre} className="cm-de">
                      <h4>{g.nombre}</h4>
                      <ul className="cm-canciones">{g.canciones.map((c) => fila(c, g.nombre))}</ul>
                    </section>
                  ))}
                {otras.every((g) => !g.canciones.length) && <p className="toma-estado">No hay canciones en otras carpetas.</p>}
                <div className="cm-fila cm-pie">
                  <button type="button" className="boton-principal" onClick={traer} disabled={!n}>
                    {n ? `Traer ${cuantas(n)}` : "Traer"}
                  </button>
                  <button
                    type="button"
                    className="boton-texto"
                    onClick={() => {
                      setMarcadas(new Set());
                      setPaso(null);
                    }}
                  >
                    Cancelar
                  </button>
                </div>
              </>
            ) : (
              <>
                {grupo.canciones.length ? (
                  <ul className="cm-canciones">{grupo.canciones.map((c) => fila(c, grupo.nombre))}</ul>
                ) : (
                  <p className="toma-estado">Esta carpeta está vacía.</p>
                )}
                {paso === null && (
                  <div className="cm-fila cm-pie">
                    <button type="button" className="boton-principal" onClick={() => setPaso({ tipo: "mover" })} disabled={!n}>
                      {n ? `Pasar ${cuantas(n)} a otra carpeta` : "Pasar a otra carpeta"}
                    </button>
                    <button
                      type="button"
                      className="boton-secundario"
                      onClick={() => {
                        setMarcadas(new Set());
                        setPaso({ tipo: "traer" });
                      }}
                    >
                      Traer canciones aquí
                    </button>
                  </div>
                )}
                {paso === null && grupo.canciones.length > 0 && !n && <p className="toma-ayuda">Marca canciones para pasarlas a otra carpeta.</p>}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Carpeta() {
  return (
    <svg className="cm-ico" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M2.5 5.5h7l2.2 2.6h9.8v11.4h-19z" />
    </svg>
  );
}

function Flecha({ hacia }: { hacia: "izq" | "arriba" | "abajo" }) {
  const d = hacia === "izq" ? "M14.5 5.5 8 12l6.5 6.5" : hacia === "arriba" ? "M5.5 14.5 12 8l6.5 6.5" : "M5.5 9.5 12 16l6.5-6.5";
  return (
    <svg className="cm-flecha" viewBox="0 0 24 24" aria-hidden="true">
      <path d={d} fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
