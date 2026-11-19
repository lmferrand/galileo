"use client";

// El modo escenario: el repertorio de un concierto con botones grandes. Cada canción se carga con
// su mezcla, su velocidad y su tono (ajustesCancion) y sus partes a mano; al acabar, queda lista
// la siguiente. Pantalla siempre encendida, bloqueo contra toques sin querer (se quita
// manteniendo pulsado) y pedal: los pedales Bluetooth de pasar páginas mandan teclas.
//   izquierda (Re Pág, ←, espacio, Intro): tocar o pausa · derecha (Av Pág, →): siguiente · ↑: anterior
// El click (el pulso de cada canción, sacado de su batería en Pistas) puede ir con la canción o solo
// a los cascos: la canción en mono por la izquierda y el click por la derecha (cable en Y).
// «Afinar» abre un afinador rápido (AfinadorRapido) con la canción en pausa: no suena nada; el pedal
// lo cierra.

import { useEffect, useRef, useState } from "react";
import { Reproductor } from "@/lib/pistas/reproductor";
import { leerPistasDeCancion } from "@/lib/pistas/cargar";
import { leerAjustesCancion, type ClickCancion, type Marca } from "@/lib/pistas/ajustesCancion";
import { formatoTiempo, PISTAS, type Cancion } from "@/lib/pistas/tipos";
import { guardarAjustesDirecto, leerAjustesDirecto, type AjustesDirecto, type Repertorio } from "@/lib/pistas/repertorio";
import { mantenerPantalla, type BloqueoPantalla } from "@/lib/pantalla";
import { Motor, type EstadoMicro } from "@/lib/motor";
import { leerPreferencias } from "@/lib/preferencias";
import { instrumentoDe } from "@/lib/instrumentos";
import AfinadorRapido from "./AfinadorRapido";

interface Props {
  repertorio: Repertorio;
  canciones: Cancion[];
  onSalir: () => void;
}

export default function Directo({ repertorio, canciones, onSalir }: Props) {
  const lista = repertorio.canciones.map((id) => canciones.find((c) => c.id === id)).filter((c): c is Cancion => !!c);
  const [indice, setIndice] = useState(0);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tocando, setTocando] = useState(false);
  const [segundo, setSegundo] = useState(0);
  const [marcas, setMarcas] = useState<Marca[]>([]);
  const [bloqueado, setBloqueado] = useState(false);
  const [pulso, setPulso] = useState<ClickCancion | null>(null);
  const [ajustes, setAjustes] = useState<AjustesDirecto>(() => (typeof window === "undefined" ? { ruta: "no", volumen: 0.8, cuenta: true } : leerAjustesDirecto()));
  const [verClick, setVerClick] = useState(false);
  // El afinador rápido: el micro se abre con el toque del botón (el iPhone solo lo deja así)
  const motor = useRef<Motor | null>(null);
  const [afinando, setAfinando] = useState(false);
  const [oido, setOido] = useState<number | null>(null);
  const [micro, setMicro] = useState<EstadoMicro>("parado");
  const rep = useRef<Reproductor | null>(null);
  const antes = useRef({ tocando: false });
  const cancion = lista[indice];
  const siguiente = lista[indice + 1];

  // Un solo reproductor para todo el concierto
  useEffect(() => {
    const r = new Reproductor();
    rep.current = r;
    return () => {
      void r.cerrar();
      rep.current = null;
    };
  }, []);

  // Cargar la canción que toca, como la dejaste
  useEffect(() => {
    const r = rep.current;
    if (!r || !cancion) return;
    let vivo = true;
    r.pausar();
    setCargando(true);
    setError(null);
    setSegundo(0);
    setTocando(false);
    antes.current.tocando = false;
    const a = leerAjustesCancion(cancion.id, PISTAS.length);
    setMarcas(a.marcas);
    setPulso(a.click);
    r.alCambiar = ({ tocando: t, segundo: s }) => {
      if (!vivo) return;
      setTocando(t);
      setSegundo(s);
      // Al acabar la canción queda lista la siguiente (sin que empiece sola)
      if (antes.current.tocando && !t && s >= cancion.duracion - 0.5) setIndice((i) => (i + 1 < lista.length ? i + 1 : i));
      antes.current.tocando = t;
    };
    (async () => {
      try {
        const datos = await leerPistasDeCancion(cancion, () => vivo);
        if (!datos || !vivo) return;
        await r.cargar(
          datos,
          cancion.frames,
          a.volumen.map((v, i) => (a.silencio[i] ? 0 : v * v)),
        );
        r.velocidad(a.velocidad);
        r.tono(a.tono);
        r.tempoClick(a.click);
        if (vivo) setCargando(false);
      } catch (e) {
        if (vivo) setError((e as Error).message || "No se ha podido abrir esta canción.");
      }
    })();
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancion?.id]);

  // El click: por dónde sale y su volumen (lo recuerda el aparato)
  useEffect(() => {
    rep.current?.rutaClick(ajustes.ruta);
    rep.current?.volumenClick(ajustes.volumen);
    guardarAjustesDirecto(ajustes);
  }, [ajustes]);
  const cambiarAjustes = (c: Partial<AjustesDirecto>) => setAjustes((a) => ({ ...a, ...c }));

  // La pantalla no se apaga mientras estás en el escenario
  useEffect(() => {
    let vivo = true;
    let bloqueo: BloqueoPantalla | null = null;
    void mantenerPantalla().then((b) => {
      if (vivo) bloqueo = b;
      else b?.release().catch(() => undefined);
    });
    return () => {
      vivo = false;
      bloqueo?.release().catch(() => undefined);
    };
  }, []);

  const alternar = () => {
    const r = rep.current;
    if (!r || cargando) return;
    if (tocando) r.pausar();
    else void r.tocar({ cuenta: ajustes.cuenta });
  };
  const ir = (s: number) => {
    rep.current?.ir(s);
    setSegundo(s);
  };
  const pasar = (paso: 1 | -1) => setIndice((i) => Math.max(0, Math.min(lista.length - 1, i + paso)));

  const pararMotor = () => {
    const m = motor.current;
    motor.current = null;
    m?.parar();
    void m?.contexto?.close().catch(() => undefined);
  };
  const abrirAfinador = () => {
    rep.current?.pausar();
    pararMotor();
    setAfinando(true);
    setOido(null);
    const m = new Motor((l) => setOido(l ? l.frecuencia : null));
    m.frecuenciaMin = instrumentoDe(leerPreferencias().instrumento).frecuenciaMin;
    motor.current = m;
    setMicro("pidiendo");
    void m.empezar().then((e) => {
      if (motor.current === m) setMicro(e);
    });
  };
  const cerrarAfinador = () => {
    pararMotor();
    setAfinando(false);
    setOido(null);
  };
  // Al salir del directo, el micro se cierra
  useEffect(
    () => () => {
      const m = motor.current;
      motor.current = null;
      m?.parar();
      void m?.contexto?.close().catch(() => undefined);
    },
    [],
  );

  // El pedal (y el teclado); con el afinador abierto, cualquier pedal lo cierra
  const ultimas = useRef({ alternar, pasar, afinando, cerrarAfinador });
  useEffect(() => {
    ultimas.current = { alternar, pasar, afinando, cerrarAfinador };
  });
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.closest?.("input, textarea")) return;
      const { alternar: a, pasar: p, afinando: af, cerrarAfinador: cerrar } = ultimas.current;
      if (af) {
        if ([" ", "Enter", "PageUp", "PageDown", "ArrowLeft", "ArrowRight", "ArrowUp", "Escape", "MediaPlayPause"].includes(e.key)) {
          cerrar();
          e.preventDefault();
          e.stopPropagation();
        }
        return;
      }
      if ([" ", "Enter", "PageUp", "ArrowLeft", "MediaPlayPause"].includes(e.key)) a();
      else if (["PageDown", "ArrowRight", "MediaTrackNext"].includes(e.key)) p(1);
      else if (["ArrowUp", "MediaTrackPrevious"].includes(e.key)) p(-1);
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener("keydown", tecla, true);
    return () => document.removeEventListener("keydown", tecla, true);
  }, []);

  // Quitar el bloqueo: mantener pulsado un momento
  const relojDesbloqueo = useRef<ReturnType<typeof setTimeout> | null>(null);
  const empezarDesbloqueo = () => {
    relojDesbloqueo.current = setTimeout(() => setBloqueado(false), 900);
  };
  const cancelarDesbloqueo = () => {
    if (relojDesbloqueo.current) clearTimeout(relojDesbloqueo.current);
  };

  if (!cancion) {
    return (
      <div className="directo" role="dialog" aria-modal="true" aria-label="Modo escenario">
        <p className="directo-aviso">Este repertorio no tiene canciones del aparato.</p>
        <button type="button" className="boton-principal" onClick={onSalir}>
          Salir
        </button>
      </div>
    );
  }

  const parteActual = [...marcas].reverse().find((m) => m.segundo <= segundo + 0.05);

  return (
    <div className={`directo${bloqueado ? " bloqueado" : ""}`} role="dialog" aria-modal="true" aria-label={`Modo escenario: ${repertorio.nombre}`}>
      <header className="directo-cabeza">
        <button type="button" className="estudio-boton" onClick={onSalir} disabled={bloqueado}>
          ‹ Salir
        </button>
        <span className="directo-titulo">
          {repertorio.nombre} · {indice + 1} / {lista.length}
        </span>
        <button type="button" className={`estudio-boton directo-click${ajustes.ruta !== "no" ? " on" : ""}`} onClick={() => setVerClick(true)} disabled={bloqueado}>
          {ajustes.ruta === "no" ? "Click" : ajustes.ruta === "cascos" ? "Click: cascos" : "Click: sí"}
        </button>
        {bloqueado ? (
          <button
            type="button"
            className="estudio-boton directo-candado on"
            onPointerDown={empezarDesbloqueo}
            onPointerUp={cancelarDesbloqueo}
            onPointerLeave={cancelarDesbloqueo}
            aria-label="Mantén pulsado para desbloquear"
          >
            🔒 Mantén para desbloquear
          </button>
        ) : (
          <button type="button" className="estudio-boton directo-candado" onClick={() => setBloqueado(true)}>
            🔓 Bloquear
          </button>
        )}
      </header>

      <main className="directo-centro">
        <h1 className="directo-cancion">{cancion.nombre}</h1>
        <p className="directo-tiempo">
          {cargando ? "Cargando…" : error ? error : `${formatoTiempo(segundo)} / ${formatoTiempo(cancion.duracion)}`}
          {parteActual && !cargando && <span className="directo-parte"> · {parteActual.nombre}</span>}
        </p>
        {ajustes.ruta !== "no" && (
          <p className={`directo-pulso${pulso ? "" : " falta"}`}>
            {pulso ? `${Math.round(pulso.bpm)} BPM${ajustes.ruta === "cascos" ? ", click en tus cascos" : ""}` : "Sin click: saca su pulso en Pistas"}
          </p>
        )}
        <div className="directo-barra" aria-hidden="true">
          <span style={{ width: `${Math.min(100, (segundo / Math.max(1, cancion.duracion)) * 100)}%` }} />
          {marcas.map((m) => (
            <i key={`${m.segundo}-${m.nombre}`} style={{ left: `${(m.segundo / Math.max(1, cancion.duracion)) * 100}%` }} />
          ))}
        </div>
        {marcas.length > 0 && (
          <div className="directo-partes">
            {marcas.map((m) => (
              <button key={`${m.segundo}-${m.nombre}`} type="button" className={`directo-boton-parte${parteActual === m ? " on" : ""}`} onClick={() => ir(m.segundo)} disabled={cargando}>
                {m.nombre}
              </button>
            ))}
          </div>
        )}
        <p className="directo-siguiente">{siguiente ? `Después: ${siguiente.nombre}` : "Es la última"}</p>
        <button type="button" className="directo-afinar" onClick={abrirAfinador} disabled={bloqueado}>
          Afinar en silencio
        </button>
      </main>

      <footer className="directo-mandos">
        <button type="button" className="directo-boton" onClick={() => pasar(-1)} disabled={indice === 0} aria-label="Canción anterior">
          ◂◂
        </button>
        <button type="button" className={`directo-boton directo-tocar${tocando ? " on" : ""}`} onClick={alternar} disabled={cargando || !!error} aria-label={tocando ? "Pausa" : "Tocar"}>
          {tocando ? "❚❚" : "▸"}
        </button>
        <button type="button" className="directo-boton" onClick={() => pasar(1)} disabled={!siguiente} aria-label="Canción siguiente">
          ▸▸
        </button>
      </footer>
      <p className="directo-pedal">Pedal: izquierda = tocar o pausa · derecha = siguiente canción</p>

      {afinando && <AfinadorRapido frecuencia={oido} estado={micro} onCerrar={cerrarAfinador} />}

      {verClick && (
        <div className="directo-panel" role="dialog" aria-modal="true" aria-label="El click" onClick={(e) => e.target === e.currentTarget && setVerClick(false)}>
          <div className="directo-panel-caja">
            <h2>El click</h2>
            <div className="directo-opciones" role="radiogroup" aria-label="Por dónde sale el click">
              {(
                [
                  ["no", "Sin click"],
                  ["juntos", "Con la canción (para ensayar)"],
                  ["cascos", "Solo en tus cascos"],
                ] as const
              ).map(([v, texto]) => (
                <button key={v} type="button" role="radio" aria-checked={ajustes.ruta === v} className={`directo-opcion${ajustes.ruta === v ? " on" : ""}`} onClick={() => cambiarAjustes({ ruta: v })}>
                  {texto}
                </button>
              ))}
            </div>
            {ajustes.ruta === "cascos" && (
              <p className="directo-ayuda">
                La canción sale en mono por la izquierda y el click por la derecha. Con un cable en Y (de minijack estéreo a dos), la izquierda va a la mesa o a los altavoces y la
                derecha a tus cascos: el público no oye el click.
              </p>
            )}
            {ajustes.ruta !== "no" && (
              <>
                <label className="directo-volumen">
                  <span>Volumen del click</span>
                  <input type="range" min={0} max={1.5} step={0.05} value={ajustes.volumen} onChange={(e) => cambiarAjustes({ volumen: Number(e.target.value) })} />
                </label>
                <button type="button" className={`interruptor-mini ${ajustes.cuenta ? "on" : ""}`} role="switch" aria-checked={ajustes.cuenta} onClick={() => cambiarAjustes({ cuenta: !ajustes.cuenta })}>
                  <span className="interruptor-pista" aria-hidden="true">
                    <span className="interruptor-bola" />
                  </span>
                  <span>Cuenta de entrada: un compás de click antes de que entre la canción</span>
                </button>
                {!pulso && <p className="directo-ayuda">Esta canción aún no tiene su pulso: en Pistas, ábrela y toca «Sacar el pulso de la batería».</p>}
              </>
            )}
            <button type="button" className="boton-principal" onClick={() => setVerClick(false)}>
              Listo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
