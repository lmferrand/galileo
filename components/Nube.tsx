"use client";

// «Tus canciones en la nube»: entrar con la cuenta de Clavija, subir desde el
// ordenador lo separado (solo, al acabar) y descargarlo en el móvil.

import { useCallback, useEffect, useRef, useState } from "react";
import { borrarDeNube, enlacesBajada, entrar, listarNube, nube, salir, sesionActual, type InfoNube } from "@/lib/nube/cliente";
import { encolarSubida, suscribirSubidas, type EstadoSubida } from "@/lib/nube/cola";
import { importarPistas } from "@/lib/pistas/importar";
import { formatoMB, formatoTiempo, type Cancion } from "@/lib/pistas/tipos";
import { ID_EJEMPLO } from "@/lib/pistas/ejemplo";

interface Props {
  canciones: Cancion[];
  esMovil: boolean;
  onCambio: () => Promise<void> | void;
  onAbrir: (c: Cancion) => void;
}

export default function Nube({ canciones, esMovil, onCambio, onAbrir }: Props) {
  const [sesion, setSesion] = useState<{ correo: string } | null | undefined>(undefined);
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [entrando, setEntrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remotas, setRemotas] = useState<InfoNube[] | null>(null);
  const [progreso, setProgreso] = useState<Record<string, { tipo: "subir" | "bajar"; f: number }>>({});
  const [subidas, setSubidas] = useState<EstadoSubida>({ enCurso: {}, fallos: {}, terminadas: 0 });
  const terminadasVistas = useRef(0);
  const [fallos, setFallos] = useState<Record<string, string>>({});
  const [borrando, setBorrando] = useState<string | null>(null);

  useEffect(() => {
    sesionActual().then((s) => setSesion(s ? { correo: s.user.email ?? "" } : null));
    const { data } = nube().auth.onAuthStateChange((_evento, s) => setSesion(s ? { correo: s.user.email ?? "" } : null));
    return () => data.subscription.unsubscribe();
  }, []);

  const recargarNube = useCallback(async () => {
    try {
      setRemotas(await listarNube());
      setError(null);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    if (sesion) recargarNube();
    else setRemotas(null);
  }, [sesion, recargarNube]);

  // Subidas en segundo plano: al terminar cada una se refrescan las listas.
  useEffect(() => suscribirSubidas(setSubidas), []);
  useEffect(() => {
    if (subidas.terminadas === terminadasVistas.current) return;
    terminadasVistas.current = subidas.terminadas;
    void onCambio();
    void recargarNube();
  }, [subidas.terminadas, onCambio, recargarNube]);

  const bajar = async (info: InfoNube) => {
    setFallos((f) => ({ ...f, [info.id]: "" }));
    setProgreso((p) => ({ ...p, [info.id]: { tipo: "bajar", f: 0 } }));
    try {
      const urls = await enlacesBajada(info.id);
      const c = await importarPistas(urls, { id: info.id, nombre: info.nombre, creada: info.creada, nube: true }, (f) =>
        setProgreso((p) => ({ ...p, [info.id]: { tipo: "bajar", f } })),
      );
      await onCambio();
      onAbrir(c);
    } catch (e) {
      setFallos((f) => ({ ...f, [info.id]: (e as Error).message }));
    } finally {
      setProgreso((p) => {
        const { [info.id]: _quitado, ...resto } = p;
        void _quitado;
        return resto;
      });
    }
  };

  const quitarDeNube = async (id: string) => {
    setBorrando(null);
    try {
      await borrarDeNube(id);
      await recargarNube();
    } catch (e) {
      setFallos((f) => ({ ...f, [id]: (e as Error).message }));
    }
  };

  if (sesion === undefined) return null;

  if (!sesion) {
    return (
      <section className="tarjeta nube" aria-label="Tus canciones en la nube">
        <p className="nube-titulo">{esMovil ? "Tus canciones, también en el ordenador" : "Tus canciones, también en el móvil"}</p>
        <p className="nube-texto">
          {esMovil
            ? "Entra con tu cuenta de Clavija: lo que separes aquí se subirá solo y lo tendrás también en el ordenador, y al revés."
            : "Entra con tu cuenta de Clavija: lo que separes aquí se subirá solo y lo tendrás en el móvil."}
        </p>
        <form
          className="nube-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setEntrando(true);
            setError(null);
            try {
              await entrar(correo, clave);
              setClave("");
            } catch (err) {
              setError((err as Error).message);
            } finally {
              setEntrando(false);
            }
          }}
        >
          <label className="campo">
            <span>Correo</span>
            <input type="email" autoComplete="username" value={correo} onChange={(e) => setCorreo(e.target.value)} required />
          </label>
          <label className="campo">
            <span>Contraseña</span>
            <input type="password" autoComplete="current-password" value={clave} onChange={(e) => setClave(e.target.value)} required />
          </label>
          <button type="submit" className="boton-secundario ancho" disabled={entrando}>
            {entrando ? "Entrando…" : "Entrar"}
          </button>
          {error && <p className="nube-error">{error}</p>}
        </form>
      </section>
    );
  }

  const locales = new Set(canciones.map((c) => c.id));
  const paraBajar = (remotas ?? []).filter((r) => !locales.has(r.id));
  const paraSubir = canciones.filter((c) => !c.nube && c.id !== ID_EJEMPLO);

  return (
    <section className="tarjeta nube" aria-label="Tus canciones en la nube">
      <div className="nube-cabeza">
        <p className="nube-titulo">En la nube</p>
        <button type="button" className="boton-texto suave" onClick={() => salir()}>
          Salir
        </button>
      </div>
      <p className="nube-texto">
        Has entrado como {sesion.correo}.{" "}
        {esMovil ? "Lo que separes aquí se sube solo, y lo del ordenador lo bajas desde esta lista." : "Lo que separes aquí se sube solo para tenerlo en el móvil."}
      </p>

      {error && <p className="nube-error">{error}</p>}

      {paraBajar.length > 0 && (
        <ul className="nube-lista">
          {paraBajar.map((r) => {
            const pr = progreso[r.id];
            return (
              <li key={r.id}>
                <div className="nube-fila-textos">
                  <span className="nube-nombre">{r.nombre}</span>
                  <span className="nube-datos">
                    {formatoTiempo(r.duracion)}
                    {r.bytesMp3 ? `, ${formatoMB(r.bytesMp3)} para descargar` : ""}
                  </span>
                  {fallos[r.id] && <span className="nube-error">{fallos[r.id]}</span>}
                </div>
                {pr ? (
                  <span className="nube-progreso">{Math.round(pr.f * 100)} %</span>
                ) : borrando === r.id ? (
                  <span className="biblioteca-confirmar">
                    <button type="button" className="boton-texto peligro" onClick={() => quitarDeNube(r.id)}>
                      Borrar
                    </button>
                    <button type="button" className="boton-texto" onClick={() => setBorrando(null)}>
                      No
                    </button>
                  </span>
                ) : (
                  <span className="nube-acciones">
                    <button type="button" className="chip" onClick={() => bajar(r)}>
                      Descargar
                    </button>
                    <button type="button" className="boton-texto suave" onClick={() => setBorrando(r.id)} aria-label={`Borrar ${r.nombre} de la nube`}>
                      Borrar
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {paraSubir.length > 0 && (
        <ul className="nube-lista">
          {paraSubir.map((c) => {
            const enCurso = c.id in subidas.enCurso;
            const fallo = subidas.fallos[c.id];
            return (
              <li key={c.id}>
                <div className="nube-fila-textos">
                  <span className="nube-nombre">{c.nombre}</span>
                  <span className="nube-datos">{enCurso ? "Comprimiendo y subiendo…" : esMovil ? "Solo en este móvil" : "Solo en este ordenador"}</span>
                  {fallo && <span className="nube-error">{fallo}</span>}
                </div>
                {enCurso ? (
                  <span className="nube-progreso">{Math.round(subidas.enCurso[c.id] * 100)} %</span>
                ) : (
                  <button type="button" className="chip" onClick={() => encolarSubida(c)}>
                    Subir
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {remotas !== null && paraBajar.length === 0 && paraSubir.length === 0 && (
        <p className="nube-texto suave">
          {remotas.length === 0
            ? "Todavía no hay nada en la nube. Separa una canción y se subirá sola."
            : "Todo al día: lo que hay en la nube ya está en este aparato."}
        </p>
      )}
    </section>
  );
}
