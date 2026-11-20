"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Navegacion from "./Navegacion";
import Reproduccion from "./Reproduccion";
import FondoEstudio from "./FondoEstudio";
import Nube from "./Nube";
import Hoja from "./Hoja";
import EstudioEncargos from "./EstudioEncargos";
import ParaTocar from "./ParaTocar";
import Repertorio from "./Repertorio";
import Directo from "./Directo";
import type { Repertorio as TipoRepertorio } from "@/lib/pistas/repertorio";
import { estudioEncendido, mandarAlEstudio, type EstadoEstudio } from "@/lib/estudio/cliente";
import { ErrorNube, nubeDisponible, separarEnLaNube, type FaseNube } from "@/lib/estudio/nube";
import { borrarCancion, espacio, listarCanciones, pedirPersistencia } from "@/lib/pistas/almacen";
import { tomarAbrirEnMesa } from "@/lib/mesa/abrirEnMesa";
import { contenidoZip, esPaquete, importarSeparada, type CancionEnZip } from "@/lib/pistas/importar";
import {
  nombreBonito,
  olvidarAviso,
  olvidarTerminada,
  pararSeparacion,
  separacionCortada,
  separarCanciones,
  suscribirSeparacion,
  type EstadoSeparacion,
  type Trabajo,
} from "@/lib/pistas/separar";
import { esMovil as esAparatoMovil } from "@/lib/pistas/aparato";
import { formatoMB, formatoTiempo, PISTAS, type Cancion } from "@/lib/pistas/tipos";
import { mantenerPantalla, type BloqueoPantalla } from "@/lib/pantalla";
import { usePestanaVisible } from "@/lib/pestana";
import { cargarEjemplo, ID_EJEMPLO, PESO_EJEMPLO } from "@/lib/pistas/ejemplo";

const IDS = PISTAS.map((p) => p.id);

// Qué pasa con la canción que se manda: primero la gráfica gratis y, si no puede, el PC
type FaseMandando = FaseNube | "estudio";
const TEXTO_FASE: Record<FaseMandando, string> = {
  despertando: "Despertando la gráfica (hasta 2 minutos)…",
  subiendo: "Subiéndola a la gráfica…",
  separando: "Separando en la gráfica; suele tardar menos de un minuto…",
  bajando: "Bajando las pistas…",
  estudio: "Mandándola al estudio…",
};
const PESO_MODELO = "285 MB";

export default function Pistas() {
  const [canciones, setCanciones] = useState<Cancion[] | null>(null);
  const [abierta, setAbierta] = useState<Cancion | null>(null);
  // La clave del reproductor mientras se cambia de canción desde la Mesa (null: la de la canción)
  const [claveAbierta, setClaveAbierta] = useState<string | null>(null);
  // Elegida desde el selector de pistas de la Mesa: se abre ya en la Mesa
  const [mesaAlEntrar, setMesaAlEntrar] = useState(false);
  const [sep, setSep] = useState<EstadoSeparacion>({ trabajo: null, error: null, terminada: null, enCola: [], tanda: { total: 0, hechas: 0 } });
  // Canciones elegidas que ya tenías separadas (no se repiten).
  const [repetidas, setRepetidas] = useState<string[]>([]);
  // Cuántas se acaban de cambiar por su versión nueva (al añadir .zip con el mismo nombre)
  const [sustituidas, setSustituidas] = useState(0);
  const [sinGpu, setSinGpu] = useState(false);
  const [esMovil, setEsMovil] = useState(false);
  // Nombre de la canción si la última separación se cortó (la página se recargó a medias).
  const [cortada, setCortada] = useState<string | null>(null);
  const [uso, setUso] = useState<{ usado: number; disponible: number } | null>(null);
  const [borrando, setBorrando] = useState<string | null>(null);
  const [ejemplo, setEjemplo] = useState<{ fraccion: number } | { error: string } | null>(null);
  // Canciones que llegan ya separadas (.zip): se añaden al momento, sin separador.
  const [anadiendo, setAnadiendo] = useState<{ nombre: string; hechas: number; total: number } | null>(null);
  const [fallosAnadir, setFallosAnadir] = useState<string | null>(null);
  const [abriendoZip, setAbriendoZip] = useState(false);
  const entradaZip = useRef<HTMLInputElement>(null);
  const entrada = useRef<HTMLInputElement>(null);
  // Hoja abierta: la nube o la ayuda (antes eran una tarjeta y párrafos en la pantalla)
  const [hoja, setHoja] = useState<"nube" | "ayuda" | "tocar" | "repertorio" | null>(null);
  // El repertorio que se está tocando en directo (modo escenario)
  const [directo, setDirecto] = useState<TipoRepertorio | null>(null);
  const cerrarHoja = useCallback(() => setHoja(null), []);
  // Canciones elegidas que esperan a que digas dónde separarlas (aquí o en el estudio)
  const [porSeparar, setPorSeparar] = useState<File[] | null>(null);
  const cerrarDonde = useCallback(() => setPorSeparar(null), []);
  const [estudio, setEstudio] = useState<EstadoEstudio | null>(null);
  const [versionEstudio, setVersionEstudio] = useState(0);
  const [mandando, setMandando] = useState<{ nombre: string; hechas: number; total: number; fase: FaseMandando } | null>(null);
  // Si al elegir había gráfica gratis (se mira al abrir la hoja: lee lo guardado en el aparato)
  const [conNube, setConNube] = useState(false);

  usePestanaVisible("pistas");
  // Al ocultarse (cambias de pestaña; ver next.config.ts) se vuelve a la lista, como antes: el
  // reproductor y el directo ya han parado su sonido, y las hojas se cierran. La lista se queda montada.
  useLayoutEffect(
    () => () => {
      setAbierta(null);
      setClaveAbierta(null);
      setMesaAlEntrar(false);
      setDirecto(null);
      setHoja(null);
      setPorSeparar(null);
    },
    [],
  );

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

  // Una canción elegida en la Mesa del afinador: se abre ya en la Mesa, en la consola
  useEffect(() => {
    const id = tomarAbrirEnMesa();
    if (!id) return;
    listarCanciones()
      .then((lista) => {
        const c = lista.find((x) => x.id === id);
        if (!c) return;
        setMesaAlEntrar(true);
        setAbierta(c);
      })
      .catch(() => undefined);
  }, []);

  // Progreso de la separación (sigue aunque cambies de pestaña).
  useEffect(() => suscribirSeparacion(setSep), []);

  // Al terminar una canción: a la lista, y se abre si era una sola (con varias, se sigue con la siguiente).
  const tandaDeUna = sep.tanda.total <= 1;
  useEffect(() => {
    if (!sep.terminada) return;
    const nueva = sep.terminada;
    olvidarTerminada();
    recargar().then(() => {
      if (tandaDeUna) setAbierta(nueva);
    });
  }, [sep.terminada, recargar, tandaDeUna]);

  // Pantalla encendida mientras separa o manda a la gráfica (si se apaga, el iPhone lo para).
  const trabajando = sep.trabajo !== null;
  const pantallaFija = trabajando || mandando !== null;
  useEffect(() => {
    if (!pantallaFija) return;
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
  }, [pantallaFija]);

  const elegir = async (lista: FileList | null) => {
    const elegidos = Array.from(lista ?? []);
    if (!elegidos.length) return;
    setCortada(null);
    setFallosAnadir(null);
    // Los .zip se abren: dentro puede haber canciones ya separadas o archivos de música sueltos.
    const archivos: File[] = [];
    const yaSeparadas: CancionEnZip[] = [];
    const fallos: string[] = [];
    if (elegidos.some(esPaquete)) setAbriendoZip(true);
    for (const a of elegidos) {
      if (!esPaquete(a)) {
        archivos.push(a);
        continue;
      }
      try {
        const dentro = await contenidoZip(a, a.name);
        if (!dentro.separadas.length && !dentro.audios.length) fallos.push(`«${a.name}»: no trae canciones (mp3, m4a, wav…).`);
        yaSeparadas.push(...dentro.separadas);
        archivos.push(...dentro.audios);
      } catch (e) {
        fallos.push(`«${a.name}»: ${(e as Error).message || "no se ha podido abrir."}`);
      }
    }
    setAbriendoZip(false);

    // Las que ya tienes separadas (o ya esperan en la cola) no se repiten.
    const tienes = new Set([...(canciones ?? []).map((c) => c.nombre), ...sep.enCola, ...(sep.trabajo ? [sep.trabajo.nombre] : [])]);
    const ya: string[] = [];
    const nuevo = (nombre: string) => {
      if (tienes.has(nombre)) {
        ya.push(nombre);
        return false;
      }
      tienes.add(nombre);
      return true;
    };
    const aSeparar = archivos.filter((a) => nuevo(nombreBonito(a.name)));
    // Las que ya vienen separadas sí entran aunque ya la tengas: sustituyen a la vieja
    // (así se cambian por una separación mejor). Solo no se repiten dentro de lo elegido.
    const enEsta = new Set<string>();
    const aAnadir = yaSeparadas.filter((c) => (enEsta.has(c.nombre) ? false : (enEsta.add(c.nombre), true)));
    setRepetidas(ya);
    // Antes de separar, dónde: aquí o en el estudio (más calidad)
    if (aSeparar.length) {
      setConNube(nubeDisponible());
      setPorSeparar(aSeparar);
    }
    if (aAnadir.length) void anadirYaSeparadas(aAnadir, fallos);
    else if (fallos.length) setFallosAnadir(fallos.join("\n"));
  };

  /** Guarda canciones que ya vienen separadas; devuelve los fallos (los previos incluidos). */
  const anadirYaSeparadas = async (lista: CancionEnZip[], fallosPrevios: string[], abrir = lista.length === 1): Promise<string[]> => {
    const orden = [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    // Así salen en la lista por orden alfabético (la lista va de la más nueva a la más vieja).
    const base = Date.now();
    const fallos = [...fallosPrevios];
    let ultima: Cancion | null = null;
    // Las que ya tenías con el mismo nombre: se borran cuando la nueva ya está guardada
    const tenias = new Map((canciones ?? []).map((c) => [c.nombre, c.id]));
    let cambiadas = 0;
    for (const [i, c] of orden.entries()) {
      setAnadiendo({ nombre: c.nombre, hechas: i, total: orden.length });
      try {
        const id = typeof crypto.randomUUID === "function" ? crypto.randomUUID() : `c${Date.now().toString(36)}${i}`;
        ultima = await importarSeparada(c, { id, nombre: c.nombre, creada: base - i });
        const vieja = tenias.get(ultima.nombre);
        if (vieja && vieja !== ultima.id) {
          await borrarCancion(vieja, IDS);
          tenias.delete(ultima.nombre);
          cambiadas++;
        }
      } catch (e) {
        const m = (e as Error).message || "";
        const lleno = /quota|QuotaExceeded|lleno/i.test(m);
        const texto = lleno ? "No cabe en el aparato. Borra alguna canción y vuelve a probar." : m || "No se ha podido añadir.";
        fallos.push(orden.length > 1 ? `«${c.nombre}»: ${texto}` : texto);
        if (lleno) break;
      }
    }
    setAnadiendo(null);
    setFallosAnadir(fallos.length ? fallos.join("\n") : null);
    setSustituidas(cambiadas);
    pedirPersistencia();
    await recargar();
    if (abrir && ultima) setAbierta(ultima);
    return fallos;
  };

  const separarAqui = () => {
    if (porSeparar) separarCanciones(porSeparar);
    setPorSeparar(null);
  };

  const separarEnEstudio = async () => {
    const lista = porSeparar ?? [];
    setPorSeparar(null);
    let fallos: string[] = [];
    const avisos: string[] = [];
    for (const [i, a] of lista.entries()) {
      const nombre = nombreBonito(a.name);
      const cual = lista.length > 1 ? `«${nombre}»: ` : "";
      // Primero la gráfica gratis (segundos). Si a esta persona se le acaban los minutos del
      // día o no responde, la canción va a la cola del PC como antes.
      if (nubeDisponible()) {
        setMandando({ nombre, hechas: i, total: lista.length, fase: "subiendo" });
        try {
          const zip = await separarEnLaNube(a, nombre, (fase) => setMandando((m) => (m ? { ...m, fase } : m)));
          const { separadas } = await contenidoZip(zip, zip.name);
          if (!separadas.length) throw new ErrorNube("error", "La gráfica no ha devuelto las pistas.");
          setMandando(null);
          fallos = await anadirYaSeparadas(separadas.slice(0, 1), fallos, lista.length === 1);
          continue;
        } catch (e) {
          const cupo = e instanceof ErrorNube && e.motivo === "cupo";
          const aviso = cupo
            ? "se han acabado tus minutos gratis de hoy en la gráfica; va al estudio del PC."
            : `la gráfica no ha podido (${(e as Error).message}); va al estudio del PC.`;
          avisos.push(cual ? cual + aviso : aviso[0].toUpperCase() + aviso.slice(1));
        }
      }
      setMandando({ nombre, hechas: i, total: lista.length, fase: "estudio" });
      try {
        await mandarAlEstudio(a, nombre);
      } catch (e) {
        fallos.push(`${cual}${(e as Error).message}`);
      }
      setVersionEstudio((v) => v + 1);
    }
    setMandando(null);
    const todo = [...avisos, ...fallos];
    if (todo.length) setFallosAnadir(todo.join("\n"));
  };

  if (directo) {
    return <Directo repertorio={directo} canciones={canciones ?? []} onSalir={() => setDirecto(null)} />;
  }

  if (abierta) {
    return (
      <Reproduccion
        key={claveAbierta ?? abierta.id}
        cancion={abierta}
        onVolver={() => {
          setAbierta(null);
          setClaveAbierta(null);
          setMesaAlEntrar(false);
          recargar();
        }}
        onRenombrada={recargar}
        mesaAlEntrar={mesaAlEntrar}
        canciones={canciones ?? []}
        onAbrirOtra={(c) => {
          // Desde la placa de la Mesa: misma clave, así la Mesa no se desmonta (cambia la canción por dentro)
          setClaveAbierta((k) => k ?? abierta.id);
          setMesaAlEntrar(true);
          setAbierta(c);
        }}
      />
    );
  }

  return (
    <main className="app app-pistas">
      {/* La foto nítida del estudio (la «-fondo» era una copia desenfocada y se veía opaca) */}
      <FondoEstudio foto="/estudio/pistas-3.webp" fotoHorizontal="/estudio/completo-h3.webp" vertical />
      <header className="cabecera">
        <Navegacion actual="pistas" />
      </header>

      <section className="pistas-intro">
        <h1>Tus pistas</h1>
        <input
          ref={entrada}
          type="file"
          accept="audio/*,.mp3,.m4a,.wav,.aac,.flac,.ogg,.zip,application/zip"
          multiple
          className="oculto"
          onChange={(e) => {
            void elegir(e.target.files);
            e.target.value = "";
          }}
        />
        <input
          ref={entradaZip}
          type="file"
          accept=".zip,application/zip,application/x-zip-compressed"
          multiple
          className="oculto"
          onChange={(e) => {
            void elegir(e.target.files);
            e.target.value = "";
          }}
        />
        {/* Cuatro bloques en vez de párrafos: lo que explica cada cosa está en «Ayuda» */}
        <div className="pistas-bloques">
          <button type="button" className="bloque principal" onClick={() => entrada.current?.click()} disabled={anadiendo !== null || abriendoZip}>
            <IconoNota />
            <span>{trabajando ? "Añadir" : "Canciones"}</span>
          </button>
          <button type="button" className="bloque" onClick={() => entradaZip.current?.click()} disabled={anadiendo !== null || abriendoZip}>
            <IconoZip />
            <span>{abriendoZip ? "Abriendo…" : ".zip"}</span>
          </button>
          <button type="button" className="bloque" onClick={() => setHoja("nube")}>
            <IconoNube />
            <span>Nube</span>
          </button>
          <button type="button" className="bloque" onClick={() => setHoja("ayuda")}>
            <IconoAyuda />
            <span>Ayuda</span>
          </button>
        </div>
        {/* Canciones libres ya separadas, por estilos, para tocar encima */}
        <button type="button" className="bloque-ancho" onClick={() => setHoja("tocar")}>
          <IconoPua />
          <span className="bloque-ancho-textos">
            <span>Para tocar</span>
            <small>Blues, rock and roll, funk…</small>
          </span>
          <svg className="bloque-ancho-flecha" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        {/* El repertorio de un concierto y el modo escenario */}
        <button type="button" className="bloque-ancho" onClick={() => setHoja("repertorio")}>
          <svg className="icono" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 6h11M4 12h11M4 18h7M18 15v6M18 15l3 1.5" />
          </svg>
          <span className="bloque-ancho-textos">
            <span>Repertorio</span>
            <small>Para tocar en directo: botones grandes y pedal</small>
          </span>
          <svg className="bloque-ancho-flecha" viewBox="0 0 24 24" aria-hidden="true">
            <path d="m9 6 6 6-6 6" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </section>

      <Hoja abierta={hoja === "repertorio"} titulo="Repertorio para tocar en directo" onCerrar={cerrarHoja}>
        <Repertorio
          canciones={canciones ?? []}
          onDirecto={(r) => {
            setHoja(null);
            setDirecto(r);
          }}
        />
      </Hoja>

      <Hoja abierta={hoja === "tocar"} titulo="Para tocar" onCerrar={cerrarHoja}>
        <ParaTocar
          activa={hoja === "tocar"}
          canciones={canciones ?? []}
          onAbrir={(c) => {
            setHoja(null);
            void recargar();
            setAbierta(c);
          }}
        />
      </Hoja>

      <Hoja abierta={porSeparar !== null} titulo="¿Dónde las separo?" onCerrar={cerrarDonde}>
        <div className="donde">
          <button type="button" className="donde-opcion" onClick={separarAqui}>
            <span className="donde-titulo">Aquí</span>
            <span className="donde-texto">En este aparato. Calidad normal; tarda unos minutos y hay que dejar la app abierta.</span>
          </button>
          <button type="button" className="donde-opcion mejor" onClick={() => void separarEnEstudio()}>
            <span className="donde-titulo">En el estudio · más calidad</span>
            <span className="donde-texto">
              {conNube ? (
                <>
                  En una gráfica gratis: menos de un minuto por canción, con la app abierta. Cada persona tiene unas cuantas al día; si se
                  acaban, va al PC del estudio (unos 15 minutos) y vuelve sola a tu lista.
                </>
              ) : (
                <>
                  Se separa en el estudio de Galileo y vuelve sola a tu lista, aunque cierres la app. Unos 15 minutos por canción.{" "}
                  {estudioEncendido(estudio) ? "Ahora está encendido." : "Ahora está apagado: empezará cuando se encienda."}
                </>
              )}
            </span>
          </button>
        </div>
      </Hoja>

      <Hoja abierta={hoja === "nube"} titulo="Tu nube" onCerrar={cerrarHoja}>
        {canciones !== null && (
          <Nube
            canciones={canciones}
            esMovil={esMovil}
            onCambio={recargar}
            onAbrir={(c) => {
              setHoja(null);
              setAbierta(c);
            }}
          />
        )}
      </Hoja>

      <Hoja abierta={hoja === "ayuda"} titulo="Cómo funciona" onCerrar={cerrarHoja}>
        <ul className="pistas-ayuda">
          <li>
            <b>Canciones:</b> elige uno o varios mp3, m4a o wav{esMovil ? " de la app Archivos (hasta 8 minutos)" : ""}. Se separan en voz,
            guitarra, bajo, batería, piano y el resto, aquí mismo y una detrás de otra.
          </li>
          <li>
            <b>.zip:</b> varias canciones juntas. Las que ya vienen separadas entran al momento.
          </li>
          <li>
            <b>En el estudio:</b> al elegir canciones puedes mandarlas al estudio de Galileo, que separa con más calidad y te las devuelve
            solas a esta lista (unos 15 minutos por canción; hasta 3 a la vez y de 10 minutos como mucho).
          </li>
          <li>La primera vez que separas aquí se descarga el separador ({PESO_MODELO}): mejor con wifi.</li>
          <li>Las de Apple Music o Spotify no se pueden abrir: vienen protegidas.</li>
          {esMovil && <li>Mientras separa, deja la pantalla encendida y Galileo abierta.</li>}
          {sinGpu && <li>Este navegador solo deja usar un núcleo: separar irá unas cuatro veces más lento.</li>}
        </ul>
        {canciones !== null && !canciones.some((c) => c.id === ID_EJEMPLO) && (
          <div className="ejemplo">
            <button
              type="button"
              className="boton-secundario ancho"
              onClick={() => {
                setHoja(null);
                void abrirEjemplo();
              }}
              disabled={ejemplo !== null && "fraccion" in ejemplo}
            >
              {ejemplo && "fraccion" in ejemplo ? `Bajando la canción de ejemplo… ${Math.round(ejemplo.fraccion * 100)} %` : "Probar con una canción de ejemplo"}
            </button>
            <p className="pistas-letra-pequena">
              {ejemplo && "error" in ejemplo ? ejemplo.error : `Viene ya separada (${PESO_EJEMPLO}).`}
            </p>
          </div>
        )}
        {uso && (
          <p className="biblioteca-espacio">
            En este aparato: {formatoMB(uso.usado)} usados de {formatoMB(uso.disponible)} disponibles.
          </p>
        )}
      </Hoja>

      {mandando && (
        <div className="tarjeta tarjeta-trabajo" aria-live="polite">
          {mandando.total > 1 && (
            <p className="trabajo-tanda">
              Canción {mandando.hechas + 1} de {mandando.total}
            </p>
          )}
          <p className="trabajo-cancion">{mandando.nombre}</p>
          <p className="trabajo-titulo">{TEXTO_FASE[mandando.fase]}</p>
          {mandando.fase !== "estudio" && <p className="pistas-letra-pequena">Deja Galileo abierta hasta que acabe.</p>}
        </div>
      )}
      <EstudioEncargos version={versionEstudio} onEstado={setEstudio} onRecibida={() => void recargar()} />

      {sep.trabajo && <TarjetaTrabajo trabajo={sep.trabajo} enCola={sep.enCola} tanda={sep.tanda} />}

      {anadiendo && (
        <div className="tarjeta tarjeta-trabajo" aria-live="polite">
          {anadiendo.total > 1 && (
            <p className="trabajo-tanda">
              Canción {anadiendo.hechas + 1} de {anadiendo.total}
            </p>
          )}
          <p className="trabajo-cancion">{anadiendo.nombre}</p>
          <p className="trabajo-titulo">Añadiendo, ya viene separada</p>
          <div className="progreso" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round((anadiendo.hechas / anadiendo.total) * 100)}>
            <span style={{ width: `${Math.max(2, (anadiendo.hechas / anadiendo.total) * 100)}%` }} />
          </div>
          <p className="pistas-letra-pequena">Deja Galileo abierta hasta que acabe.</p>
        </div>
      )}

      {fallosAnadir && (
        <div className="tarjeta tarjeta-error" role="alert">
          <p className="con-saltos">{fallosAnadir}</p>
          <button type="button" className="boton-texto" onClick={() => setFallosAnadir(null)}>
            Vale
          </button>
        </div>
      )}

      {sustituidas > 0 && (
        <div className="tarjeta" role="status">
          <p>{sustituidas === 1 ? "Se ha cambiado 1 canción por su versión nueva." : `Se han cambiado ${sustituidas} canciones por su versión nueva.`}</p>
          <button type="button" className="boton-texto" onClick={() => setSustituidas(0)}>
            Vale
          </button>
        </div>
      )}

      {repetidas.length > 0 && (
        <div className="tarjeta" role="status">
          <p>
            {repetidas.length === 1
              ? `«${repetidas[0]}» ya la tenías separada. No se repite.`
              : `Ya tenías separadas ${repetidas.length}: ${repetidas.join(", ")}. No se repiten.`}
          </p>
          <button type="button" className="boton-texto" onClick={() => setRepetidas([])}>
            Vale
          </button>
        </div>
      )}

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
          <p className="con-saltos">{sep.error}</p>
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
                  <span className="biblioteca-play" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M9.5 7.2v9.6l7.6-4.8z" />
                    </svg>
                  </span>
                  <span className="biblioteca-textos">
                    <span className="biblioteca-nombre">{c.nombre}</span>
                    <span className="biblioteca-datos">
                      {formatoTiempo(c.duracion)}
                      {c.nube && <IconoNube pequeno />}
                    </span>
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
                  <button type="button" className="biblioteca-borrar" onClick={() => setBorrando(c.id)} aria-label={`Borrar ${c.nombre}`}>
                    <IconoPapelera />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}

function TarjetaTrabajo({ trabajo, enCola, tanda }: { trabajo: Trabajo; enCola: string[]; tanda: EstadoSeparacion["tanda"] }) {
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
      {tanda.total > 1 && (
        <p className="trabajo-tanda">
          Canción {Math.min(tanda.hechas + 1, tanda.total)} de {tanda.total}
        </p>
      )}
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
      {enCola.length > 0 && (
        <p className="pistas-letra-pequena">
          Después: {enCola.slice(0, 2).join(", ")}
          {enCola.length > 2 ? ` y ${enCola.length - 2} más` : ""}.
        </p>
      )}
      <p className="pistas-letra-pequena">
        {enCola.length > 0 ? "Deja Galileo abierta hasta que acaben todas; «Parar» las para todas." : "Deja esta pantalla abierta hasta que acabe."}
      </p>
    </div>
  );
}

function IconoNota() {
  return (
    <svg viewBox="0 0 24 24" className="icono" aria-hidden="true">
      <path d="M9 18.5V5.5l10-2v12.5" />
      <circle cx="6.5" cy="18.5" r="2.5" />
      <circle cx="16.5" cy="16" r="2.5" />
    </svg>
  );
}

/** Un archivo con cremallera: el .zip */
function IconoZip() {
  return (
    <svg viewBox="0 0 24 24" className="icono" aria-hidden="true">
      <path d="M6 3h9l4 4v14H6z" />
      <path d="M11 3v2h2v2h-2v2h2v2h-2v2.5" />
      <rect x="10" y="13.5" width="3" height="3.5" rx="0.8" />
    </svg>
  );
}

function IconoNube({ pequeno }: { pequeno?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={`icono ${pequeno ? "icono-dato" : ""}`}
      aria-hidden={pequeno ? undefined : true}
      role={pequeno ? "img" : undefined}
      aria-label={pequeno ? "También en la nube" : undefined}
    >
      <path d="M7 18.5h10.5a4 4 0 0 0 .6-7.95A6 6 0 0 0 6.6 9.1 4.75 4.75 0 0 0 7 18.5z" />
    </svg>
  );
}

function IconoPua() {
  return (
    <svg className="icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 3.2c-4.6 0-8 1.7-8 4.8 0 3.7 4.1 9.4 6.5 12a2 2 0 0 0 3 0C15.9 17.4 20 11.7 20 8c0-3.1-3.4-4.8-8-4.8z" />
      <path d="M10.4 9.2v4.6a1.3 1.3 0 1 1-1-1.25M10.4 9.2l3.6-.9v3.9a1.3 1.3 0 1 1-1-1.25" strokeLinecap="round" />
    </svg>
  );
}

function IconoAyuda() {
  return (
    <svg viewBox="0 0 24 24" className="icono" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M9.6 9.3a2.5 2.5 0 1 1 3.6 2.3c-.8.4-1.2 1-1.2 1.9v.4" />
      <path d="M12 17.2v.3" />
    </svg>
  );
}

function IconoPapelera() {
  return (
    <svg viewBox="0 0 24 24" className="icono" aria-hidden="true">
      <path d="M4.5 6.5h15M9.5 6.5V4.5h5v2M6.5 6.5l1 13h9l1-13M10.2 10v6.5M13.8 10v6.5" />
    </svg>
  );
}
