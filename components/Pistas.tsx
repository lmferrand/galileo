"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Navegacion from "./Navegacion";
import { borrarCancion, espacio, leerAudios, listarCanciones } from "@/lib/pistas/almacen";
import { olvidarAviso, pararSeparacion, separarCancion, suscribirSeparacion, type EstadoSeparacion, type Trabajo } from "@/lib/pistas/separar";
import { Reproductor } from "@/lib/pistas/reproductor";
import { leerWav } from "@/lib/pistas/wav";
import { formatoMB, formatoTiempo, PISTAS, type Cancion, type Pista } from "@/lib/pistas/tipos";

const IDS = PISTAS.map((p) => p.id);
const PESO_MODELO = "285 MB";

interface WakeLock {
  release: () => Promise<void>;
}

async function mantenerPantalla(): Promise<WakeLock | null> {
  try {
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLock> } }).wakeLock;
    return wl ? await wl.request("screen") : null;
  } catch {
    return null;
  }
}

export default function Pistas() {
  const [canciones, setCanciones] = useState<Cancion[] | null>(null);
  const [abierta, setAbierta] = useState<Cancion | null>(null);
  const [sep, setSep] = useState<EstadoSeparacion>({ trabajo: null, error: null, terminada: null });
  const [sinGpu, setSinGpu] = useState(false);
  const [uso, setUso] = useState<{ usado: number; disponible: number } | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);
  const entrada = useRef<HTMLInputElement>(null);

  const recargar = useCallback(async () => {
    try {
      setCanciones(await listarCanciones());
    } catch {
      setCanciones([]);
    }
    setUso(await espacio());
  }, []);

  useEffect(() => {
    recargar();
    // Sin aislamiento entre orígenes el separador solo puede usar un núcleo.
    setSinGpu(!self.crossOriginIsolated);
  }, [recargar]);

  // Progreso de la separación (sigue aunque cambies de pestaña).
  useEffect(() => suscribirSeparacion(setSep), []);

  // Al terminar una canción: a la lista y abrirla.
  useEffect(() => {
    if (!sep.terminada) return;
    const nueva = sep.terminada;
    olvidarAviso();
    recargar().then(() => setAbierta(nueva));
  }, [sep.terminada, recargar]);

  // Pantalla encendida mientras separa (si se apaga, el iPhone lo para).
  const trabajando = sep.trabajo !== null;
  useEffect(() => {
    if (!trabajando) return;
    let bloqueo: WakeLock | null = null;
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
    separarCancion(archivo);
  };

  if (abierta) {
    return <Reproduccion key={abierta.id} cancion={abierta} onVolver={() => setAbierta(null)} />;
  }

  return (
    <main className="app app-pistas">
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
        {sinGpu && (
          <p className="pistas-aviso">
            Este navegador solo deja usar un núcleo del procesador, así que separar irá unas cuatro veces más lento.
          </p>
        )}
      </section>

      {sep.trabajo && <TarjetaTrabajo trabajo={sep.trabajo} />}

      {sep.error && (
        <div className="tarjeta tarjeta-error" role="alert">
          <p>{sep.error}</p>
          <button type="button" className="boton-texto" onClick={olvidarAviso}>
            Vale
          </button>
        </div>
      )}

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
        detalle = quedan < 60 ? "Queda menos de un minuto." : `Quedan unos ${Math.round(quedan / 60)} min.`;
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

// ------------------------------------------------------------------
// Reproductor de una canción
// ------------------------------------------------------------------

const MEZCLAS: { nombre: string; sin: Pista | null }[] = [
  { nombre: "Todo", sin: null },
  { nombre: "Sin guitarra", sin: "guitarra" },
  { nombre: "Sin voz", sin: "voz" },
  { nombre: "Sin batería", sin: "bateria" },
  { nombre: "Sin bajo", sin: "bajo" },
];

function Reproduccion({ cancion, onVolver }: { cancion: Cancion; onVolver: () => void }) {
  const rep = useRef<Reproductor | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tocando, setTocando] = useState(false);
  const [segundo, setSegundo] = useState(0);
  const [volumen, setVolumen] = useState<number[]>(() => PISTAS.map(() => 1));
  const [silencio, setSilencio] = useState<boolean[]>(() => PISTAS.map(() => false));
  const [solo, setSolo] = useState<boolean[]>(() => PISTAS.map(() => false));
  const ultimo = useRef({ segundo: -1, tocando: false });
  const bloqueo = useRef<WakeLock | null>(null);

  const algunSolo = solo.some(Boolean);
  const efectivas = PISTAS.map((_, i) => (silencio[i] || (algunSolo && !solo[i]) ? 0 : volumen[i] * volumen[i]));
  const claveGanancias = efectivas.join(",");
  const gananciasIniciales = useRef(efectivas);

  // Cargar las pistas del aparato y montar el reproductor.
  useEffect(() => {
    const r = new Reproductor();
    rep.current = r;
    let vivo = true;
    r.alCambiar = ({ tocando: t, segundo: s }) => {
      // Solo se repinta cuando cambia algo que se ve (décimas de segundo).
      if (t !== ultimo.current.tocando || Math.abs(s - ultimo.current.segundo) >= 0.1) {
        ultimo.current = { tocando: t, segundo: s };
        setTocando(t);
        setSegundo(s);
      }
    };
    (async () => {
      try {
        const audios = await leerAudios(cancion.id, IDS);
        const datos = await Promise.all(IDS.map((id) => leerWav(audios[id])));
        if (!vivo) return;
        await r.cargar(datos, cancion.frames, gananciasIniciales.current);
        if (vivo) setCargando(false);
      } catch (e) {
        if (vivo) setError((e as Error).message || "No se han podido abrir las pistas.");
      }
    })();
    return () => {
      vivo = false;
      r.cerrar();
      rep.current = null;
    };
  }, [cancion.id, cancion.frames]);

  useEffect(() => {
    rep.current?.ganancias(claveGanancias.split(",").map(Number));
  }, [claveGanancias]);

  // Pantalla encendida mientras suena.
  useEffect(() => {
    if (!tocando) return;
    let vivo = true;
    mantenerPantalla().then((b) => {
      if (vivo) bloqueo.current = b;
      else b?.release().catch(() => undefined);
    });
    return () => {
      vivo = false;
      bloqueo.current?.release().catch(() => undefined);
      bloqueo.current = null;
    };
  }, [tocando]);

  const alternar = () => {
    if (!rep.current || cargando) return;
    if (tocando) rep.current.pausar();
    else rep.current.tocar();
  };

  const saltar = (delta: number) => {
    const s = Math.max(0, Math.min(cancion.duracion, segundo + delta));
    rep.current?.ir(s);
    setSegundo(s);
  };

  const aplicarMezcla = (sin: Pista | null) => {
    setSolo(PISTAS.map(() => false));
    setSilencio(PISTAS.map((p) => p.id === sin));
    setVolumen(PISTAS.map(() => 1));
  };
  const mezclaActiva = (sin: Pista | null) =>
    !algunSolo && volumen.every((v) => v === 1) && PISTAS.every((p, i) => silencio[i] === (p.id === sin));

  const cambiar = (lista: boolean[], i: number) => lista.map((v, j) => (j === i ? !v : v));

  return (
    <main className="app app-pistas">
      <header className="cabecera">
        <Navegacion actual="pistas" />
      </header>

      <button type="button" className="volver" onClick={onVolver}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M10 3 L5 8 L10 13" />
        </svg>
        Tus pistas
      </button>

      <h1 className="reproductor-titulo">{cancion.nombre}</h1>

      {error ? (
        <div className="tarjeta tarjeta-error" role="alert">
          <p>{error}</p>
        </div>
      ) : (
        <>
          <section className="transporte" aria-label="Reproducción">
            <input
              type="range"
              className="barra-tiempo"
              min={0}
              max={cancion.duracion}
              step={0.1}
              value={Math.min(segundo, cancion.duracion)}
              onChange={(e) => {
                const s = Number(e.target.value);
                setSegundo(s);
                rep.current?.ir(s);
              }}
              disabled={cargando}
              aria-label="Posición en la canción"
              aria-valuetext={`${formatoTiempo(segundo)} de ${formatoTiempo(cancion.duracion)}`}
              style={{ "--hecho": `${(Math.min(segundo, cancion.duracion) / Math.max(1, cancion.duracion)) * 100}%` } as React.CSSProperties}
            />
            <div className="tiempos">
              <span>{formatoTiempo(segundo)}</span>
              <span>{formatoTiempo(cancion.duracion)}</span>
            </div>
            <div className="mandos">
              <button type="button" className="boton-salto" onClick={() => saltar(-10)} disabled={cargando} aria-label="Atrás 10 segundos">
                <IconoSalto atras />
              </button>
              <button type="button" className="boton-tocar" onClick={alternar} disabled={cargando} aria-label={tocando ? "Pausa" : "Tocar"}>
                {cargando ? <span className="girando" aria-hidden="true" /> : tocando ? <IconoPausa /> : <IconoTocar />}
              </button>
              <button type="button" className="boton-salto" onClick={() => saltar(10)} disabled={cargando} aria-label="Adelante 10 segundos">
                <IconoSalto />
              </button>
            </div>
          </section>

          <section aria-label="Mezclas rápidas">
            <div className="mezclas">
              {MEZCLAS.map((m) => (
                <button key={m.nombre} type="button" className="chip" aria-pressed={mezclaActiva(m.sin)} onClick={() => aplicarMezcla(m.sin)}>
                  {m.nombre}
                </button>
              ))}
            </div>
          </section>

          <section className="mesa" aria-label="Pistas">
            {PISTAS.map((p, i) => {
              const apagada = efectivas[i] === 0;
              return (
                <div key={p.id} className={`canal ${apagada ? "apagado" : ""}`}>
                  <div className="canal-cabeza">
                    <span className="canal-nombre">{p.nombre}</span>
                    <button
                      type="button"
                      className="canal-boton"
                      aria-pressed={solo[i]}
                      onClick={() => setSolo((s) => cambiar(s, i))}
                      aria-label={`Solo ${p.nombre}`}
                    >
                      Solo
                    </button>
                    <button
                      type="button"
                      className="canal-boton silencio"
                      aria-pressed={silencio[i]}
                      onClick={() => setSilencio((s) => cambiar(s, i))}
                      aria-label={silencio[i] ? `Volver a oír ${p.nombre}` : `Quitar ${p.nombre}`}
                    >
                      {silencio[i] ? <IconoMudo /> : <IconoSuena />}
                    </button>
                  </div>
                  <input
                    type="range"
                    className="cuerda-volumen"
                    min={0}
                    max={1}
                    step={0.01}
                    value={volumen[i]}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setVolumen((vs) => vs.map((x, j) => (j === i ? v : x)));
                    }}
                    aria-label={`Volumen de ${p.nombre}`}
                    style={{ "--hecho": `${volumen[i] * 100}%` } as React.CSSProperties}
                  />
                </div>
              );
            })}
          </section>
        </>
      )}
    </main>
  );
}

function IconoTocar() {
  return (
    <svg viewBox="0 0 24 24" className="icono-relleno" aria-hidden="true">
      <path d="M8 5.5v13l10.5-6.5z" />
    </svg>
  );
}

function IconoPausa() {
  return (
    <svg viewBox="0 0 24 24" className="icono-relleno" aria-hidden="true">
      <rect x="6.5" y="5.5" width="4" height="13" rx="1" />
      <rect x="13.5" y="5.5" width="4" height="13" rx="1" />
    </svg>
  );
}

function IconoSalto({ atras }: { atras?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="icono" aria-hidden="true" style={atras ? { transform: "scaleX(-1)" } : undefined}>
      <path d="M19 12a7 7 0 1 1-2.05-4.95" />
      <path d="M19 4.5v3.5h-3.5" />
      <text x="12" y="15.2" textAnchor="middle" className="icono-texto" style={atras ? { transform: "scaleX(-1)", transformOrigin: "12px 12px" } : undefined}>
        10
      </text>
    </svg>
  );
}

function IconoSuena() {
  return (
    <svg viewBox="0 0 24 24" className="icono" aria-hidden="true">
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M15.5 9a4 4 0 0 1 0 6" />
    </svg>
  );
}

function IconoMudo() {
  return (
    <svg viewBox="0 0 24 24" className="icono" aria-hidden="true">
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M16 9.5l5 5M21 9.5l-5 5" />
    </svg>
  );
}
