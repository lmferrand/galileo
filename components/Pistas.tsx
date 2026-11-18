"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Navegacion from "./Navegacion";
import Reproduccion from "./Reproduccion";
import FondoEstudio from "./FondoEstudio";
import Nube from "./Nube";
import { sesionActual } from "@/lib/nube/cliente";
import { encolarSubida } from "@/lib/nube/cola";
import { borrarCancion, espacio, listarCanciones } from "@/lib/pistas/almacen";
import { olvidarAviso, pararSeparacion, separacionCortada, separarCancion, suscribirSeparacion, type EstadoSeparacion, type Trabajo } from "@/lib/pistas/separar";
import { esMovil as esAparatoMovil } from "@/lib/pistas/aparato";
import { formatoMB, formatoTiempo, PISTAS, type Cancion } from "@/lib/pistas/tipos";
import { mantenerPantalla, type BloqueoPantalla } from "@/lib/pantalla";
import { cargarEjemplo, ID_EJEMPLO, PESO_EJEMPLO } from "@/lib/pistas/ejemplo";

const IDS = PISTAS.map((p) => p.id);
const PESO_MODELO = "285 MB";

export default function Pistas() {
  const [canciones, setCanciones] = useState<Cancion[] | null>(null);
  const [abierta, setAbierta] = useState<Cancion | null>(null);
  const [sep, setSep] = useState<EstadoSeparacion>({ trabajo: null, error: null, terminada: null });
  const [sinGpu, setSinGpu] = useState(false);
  const [esMovil, setEsMovil] = useState(false);
  // Nombre de la canción si la última separación se cortó (la página se recargó a medias).
  const [cortada, setCortada] = useState<string | null>(null);
  const [uso, setUso] = useState<{ usado: number; disponible: number } | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [ejemplo, setEjemplo] = useState<{ fraccion: number } | { error: string } | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const recargar = useCallback(async () => {
    try {
      setCanciones(await listarCanciones());
    } catch {
      setCanciones([]);
    }
    setUso(await espacio());
  }, []);

  const abrirEjemplo = async () => {
    setEjemplo({ fraccion: 0 });
    try {
      const c = await cargarEjemplo((fraccion) => setEjemplo({ fraccion }));
      setEjemplo(null);
      await recargar();
      setAbierta(c);
    } catch (e) {
      setEjemplo({ error: (e as Error).message || "No se ha podido cargar la canción de ejemplo." });
    }
  };

  useEffect(() => {
    recargar();
    // Sin aislamiento entre orígenes el separador solo puede usar un núcleo.
    setSinGpu(!self.crossOriginIsolated);
    setEsMovil(esAparatoMovil());
    setCortada(separacionCortada());
  }, [recargar]);

  // Progreso de la separación (sigue aunque cambies de pestaña).
  useEffect(() => suscribirSeparacion(setSep), []);

  // Al terminar una canción: a la lista y abrirla.
  useEffect(() => {
    if (!sep.terminada) return;
    const nueva = sep.terminada;
    olvidarAviso();
    recargar().then(() => setAbierta(nueva));
    sesionActual().then((s) => {
      if (s) encolarSubida(nueva);
    });
  }, [sep.terminada, recargar]);

  // Pantalla encendida mientras separa (si se apaga, el iPhone lo para).
  const trabajando = sep.trabajo !== null;
  useEffect(() => {
    if (!trabajando) return;
    let bloqueo: BloqueoPantalla | null = null;
    let vivo = true;
    mantenerPantalla().then((b) => {
      if (vivo) bloqueo = b;
      else b?.release().catch(() => undefined);
    });
    return () => {
      vivo = false;
      bloqueo?.release().catch(() => undefined);
    };
  }, [trabajando]);

  const elegir = (archivo: File | undefined) => {
    if (!archivo) return;
    setCortada(null);
    separarCancion(archivo);
  };

  if (abierta) {
    return (
      <Reproduccion
        key={abierta.id}
        cancion={abierta}
        onVolver={() => {
          setAbierta(null);
          recargar();
        }}
        onRenombrada={recargar}
      />
    );
  }

  return (
    <main className="app app-pistas">
      <FondoEstudio foto="/estudio/pistas-fondo-1.webp" vertical />
      <header className="cabecera">
        <Navegacion actual="pistas" />
      </header>

      <section className="pistas-intro">
        <h1>Tus pistas</h1>
        <p>Separa una canción en voz, guitarra, bajo, batería, piano y el resto, y quita lo que quieras para tocar encima.</p>
        <input
          ref={entrada}
          type="file"
          accept="audio/*,.mp3,.m4a,.wav,.aac,.flac,.ogg"
          className="oculto"
          onChange={(e) => {
            elegir(e.target.files?.[0]);
            e.target.value = "";
          }}
        />
        <button type="button" className="boton-principal" onClick={() => entrada.current?.click()} disabled={trabajando}>
          Elegir una canción
        </button>
        <p className="pistas-letra-pequena">
          Se separa en este aparato y la canción no sale de aquí. La primera vez descarga el separador ({PESO_MODELO}): mejor con wifi.
        </p>
        {esMovil && (
          <p className="pistas-letra-pequena">
            Elige un mp3, m4a o wav de la app Archivos (hasta 8 minutos). Las canciones de Apple Music o Spotify no se pueden abrir porque
            vienen protegidas. Tarda unos minutos: deja la pantalla encendida y Clavija abierta hasta que acabe.
          </p>
        )}
        {sinGpu && (
          <p className="pistas-aviso">
            Este navegador solo deja usar un núcleo del procesador, así que separar irá unas cuatro veces más lento.
          </p>
        )}

        {canciones !== null && !canciones.some((c) => c.id === ID_EJEMPLO) && (
          <div className="ejemplo">
            <button
              type="button"
              className="boton-secundario ancho"
              onClick={abrirEjemplo}
              disabled={ejemplo !== null && "fraccion" in ejemplo}
            >
              {ejemplo && "fraccion" in ejemplo ? `Bajando la canción de ejemplo… ${Math.round(ejemplo.fraccion * 100)} %` : "Probar con una canción de ejemplo"}
            </button>
            <p className="pistas-letra-pequena">
              {ejemplo && "error" in ejemplo
                ? ejemplo.error
                : `Viene ya separada: se descargan ${PESO_EJEMPLO} y no hace falta el separador. La puedes borrar cuando quieras.`}
            </p>
          </div>
        )}
      </section>

      {sep.trabajo && <TarjetaTrabajo trabajo={sep.trabajo} />}

      {cortada && !sep.trabajo && (
        <div className="tarjeta tarjeta-error" role="alert">
          <p>
            La separación de «{cortada}» se cortó antes de acabar.{" "}
            {esMovil
              ? "Suele pasar si se apaga la pantalla, si cambias de app o si el móvil anda justo de memoria. Cierra las demás apps y vuelve a probar."
              : "Vuelve a elegirla para empezar de nuevo."}
          </p>
          <button type="button" className="boton-texto" onClick={() => setCortada(null)}>
            Vale
          </button>
        </div>
      )}

      {sep.error && (
        <div className="tarjeta tarjeta-error" role="alert">
          <p>{sep.error}</p>
          <button type="button" className="boton-texto" onClick={olvidarAviso}>
            Vale
          </button>
        </div>
      )}

      {canciones !== null && <Nube canciones={canciones} esMovil={esMovil} onCambio={recargar} onAbrir={setAbierta} />}

      <section className="biblioteca" aria-label="Canciones separadas">
        {canciones === null ? null : canciones.length === 0 ? (
          !trabajando && <p className="biblioteca-vacia">Aquí aparecerán las canciones que separes.</p>
        ) : (
          <ul>
            {canciones.map((c) => (
              <li key={c.id}>
                <button type="button" className="biblioteca-fila" onClick={() => setAbierta(c)}>
                  <span className="biblioteca-nombre">{c.nombre}</span>
                  <span className="biblioteca-datos">
                    {formatoTiempo(c.duracion)}, {formatoMB(c.bytes)}
                    {c.nube ? ", también en la nube" : ""}
                  </span>
                </button>
                {borrando === c.id ? (
                  <span className="biblioteca-confirmar">
                    <button
                      type="button"
                      className="boton-texto peligro"
                      onClick={async () => {
                        await borrarCancion(c.id, IDS);
                        setBorrando(null);
                        recargar();
                      }}
                    >
                      Borrar
                    </button>
                    <button type="button" className="boton-texto" onClick={() => setBorrando(null)}>
                      No
                    </button>
                  </span>
                ) : (
                  <button type="button" className="boton-texto suave" onClick={() => setBorrando(c.id)} aria-label={`Borrar ${c.nombre}`}>
                    Borrar
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {uso && canciones && canciones.length > 0 && (
          <p className="biblioteca-espacio">
            En este aparato: {formatoMB(uso.usado)} usados de {formatoMB(uso.disponible)} disponibles.
          </p>
        )}
      </section>
    </main>
  );
}

function TarjetaTrabajo({ trabajo }: { trabajo: Trabajo }) {
  let titulo = "";
  let detalle = "";
  let fraccion: number | null = null;

  switch (trabajo.fase) {
    case "leyendo":
      titulo = "Leyendo la canción";
      break;
    case "descargando":
      titulo = "Descargando el separador";
      if (trabajo.total) {
        fraccion = (trabajo.recibido ?? 0) / trabajo.total;
        detalle = `${formatoMB(trabajo.recibido ?? 0)} de ${formatoMB(trabajo.total)}. Solo la primera vez.`;
      }
      break;
    case "cargando":
      titulo = "Preparando el separador";
      detalle = "Unos segundos.";
      break;
    case "separando": {
      titulo = "Separando las pistas";
      const hecho = trabajo.hecho ?? 0;
      const trozos = trabajo.trozos ?? 1;
      fraccion = hecho / trozos;
      if (hecho >= 2 && trabajo.msPorTrozo) {
        const quedan = Math.max(0, ((trozos - hecho) * trabajo.msPorTrozo) / 1000);
        const min = Math.round(quedan / 60);
        detalle = quedan < 60 ? "Queda menos de un minuto." : min <= 1 ? "Queda un minuto, más o menos." : `Quedan unos ${min} minutos.`;
      } else {
        detalle = "Calculando cuánto falta…";
      }
      break;
    }
    case "guardando":
      titulo = "Guardando las pistas";
      fraccion = 1;
      break;
  }

  return (
    <div className="tarjeta tarjeta-trabajo" aria-live="polite">
      <p className="trabajo-cancion">{trabajo.nombre}</p>
      <p className="trabajo-titulo">{titulo}</p>
      <div className={`progreso ${fraccion === null ? "indefinido" : ""}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={fraccion === null ? undefined : Math.round(fraccion * 100)}>
        <span style={{ width: fraccion === null ? undefined : `${Math.max(2, fraccion * 100)}%` }} />
      </div>
      <div className="trabajo-pie">
        <p>{detalle || " "}</p>
        <button type="button" className="boton-texto" onClick={pararSeparacion}>
          Parar
        </button>
      </div>
      <p className="pistas-letra-pequena">Deja esta pantalla abierta hasta que acabe.</p>
    </div>
  );
}
