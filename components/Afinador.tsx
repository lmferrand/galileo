"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Roseta from "./Roseta";
import Pala from "./Pala";
import Hoja from "./Hoja";
import SelectorAfinacion, { ID_CROMATICO } from "./SelectorAfinacion";
import EditorAfinacion from "./EditorAfinacion";
import Ajustes from "./Ajustes";
import Navegacion from "./Navegacion";
import { afinacionesDe, estandarDe, familiaDe, ESTANDAR, type Afinacion } from "@/lib/afinaciones";
import { enLetra, INSTRUMENTOS, instrumentoDe, type InstrumentoId } from "@/lib/instrumentos";
import { centsEntre, formatoHz, frecuenciaDe, midiDe, partesNota } from "@/lib/notas";
import { crearContextoAudio, Motor, type EstadoMicro, type LecturaEstable } from "@/lib/motor";
import { tocarArpegio, tocarNota } from "@/lib/tono";
import { guardarPreferencias, leerPreferencias, PREFERENCIAS_INICIALES, type Preferencias } from "@/lib/preferencias";

const TOLERANCIA = 4; // cents
const TIEMPO_AFINADA = 350; // ms seguidos dentro de la tolerancia
const HISTERESIS = 60; // cents que tiene que ganar otra cuerda para cambiar en automático

type HojaAbierta = null | "afinacion" | "ajustes" | "editor";

interface WakeLock {
  release: () => Promise<void>;
}

export default function Afinador() {
  const [prefs, setPrefs] = useState<Preferencias>(PREFERENCIAS_INICIALES);
  const [listo, setListo] = useState(false);
  const [estado, setEstado] = useState<EstadoMicro>("parado");
  // Lo que se oye y, en automático, la cuerda que se le asigna (con histéresis
  // para que no salte entre dos cuerdas cuando la nota cae a medio camino).
  const [senal, setSenal] = useState<{ lectura: LecturaEstable | null; auto: number | null }>({ lectura: null, auto: null });
  const [automatico, setAutomatico] = useState(true);
  const [cuerdaManual, setCuerdaManual] = useState(0);
  const [afinadas, setAfinadas] = useState<Set<number>>(() => new Set());
  const [hoja, setHoja] = useState<HojaAbierta>(null);
  const [celebrando, setCelebrando] = useState(false);
  const [tonoEn, setTonoEn] = useState<number | null>(null);

  const motor = useRef<Motor | null>(null);
  const ctxTono = useRef<AudioContext | null>(null);
  const cuerdaAuto = useRef<number | null>(null);
  const config = useRef<{ notas: number[]; la4: number }>({ notas: ESTANDAR.notas, la4: 440 });
  const dentroDesde = useRef<{ cuerda: number; t: number } | null>(null);
  const bloqueo = useRef<WakeLock | null>(null);
  const temporizadores = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Preferencias guardadas: se leen después de hidratar para no descuadrar el HTML.
  useEffect(() => {
    setPrefs(leerPreferencias());
    setListo(true);
  }, []);

  const cambiarPrefs = useCallback((cambio: Partial<Preferencias>) => {
    setPrefs((p) => {
      const nuevas = { ...p, ...cambio };
      guardarPreferencias(nuevas);
      return nuevas;
    });
  }, []);

  const instrumento = instrumentoDe(prefs.instrumento);
  const familia = instrumento.familia;
  const total = instrumento.cuerdas;
  const todas = useMemo<Afinacion[]>(
    () => [...prefs.propias.filter((a) => familiaDe(a) === familia), ...afinacionesDe(familia)],
    [prefs.propias, familia],
  );
  const afinacionId = familia === "bajo" ? prefs.afinacionBajoId : prefs.afinacionId;
  const cromatico = afinacionId === ID_CROMATICO;
  const afinacion = todas.find((a) => a.id === afinacionId) ?? estandarDe(familia);
  const elegirAfinacion = (id: string) => (familia === "bajo" ? { afinacionBajoId: id } : { afinacionId: id });

  // El bajo baja hasta el Si0 (31 Hz): el oído del motor se ajusta al instrumento.
  useEffect(() => {
    if (motor.current) motor.current.frecuenciaMin = instrumento.frecuenciaMin;
  }, [instrumento.frecuenciaMin]);

  const cambiarInstrumento = (id: InstrumentoId) => {
    if (id === instrumento.id) return;
    cambiarPrefs({ instrumento: id });
    setAutomatico(true);
    setCuerdaManual(0);
    setAfinadas(new Set());
  };

  // Cambiar de afinación (o de La) deja todas las cuerdas por afinar.
  useEffect(() => {
    config.current = { notas: afinacion.notas, la4: prefs.la4 };
    setAfinadas(new Set());
    cuerdaAuto.current = null;
    dentroDesde.current = null;
  }, [afinacion.notas, prefs.la4]);

  const alLeer = useCallback((l: LecturaEstable | null) => {
    if (!l) {
      cuerdaAuto.current = null;
      setSenal({ lectura: null, auto: null });
      return;
    }
    const { notas, la4 } = config.current;
    const distancias = notas.map((n) => Math.abs(centsEntre(l.frecuencia, n, la4)));
    let mejor = 0;
    distancias.forEach((d, i) => {
      if (d < distancias[mejor]) mejor = i;
    });
    const previa = cuerdaAuto.current;
    const elegida = previa !== null && previa < notas.length && distancias[previa] - distancias[mejor] < HISTERESIS ? previa : mejor;
    cuerdaAuto.current = elegida;
    setSenal({ lectura: l, auto: elegida });
  }, []);

  // ---------- Qué está sonando ----------
  const lectura = senal.lectura;
  const f = lectura?.frecuencia ?? null;
  let cuerda: number | null = null;
  let objetivo: number | null = null;
  let cents: number | null = null;

  if (f !== null) {
    if (cromatico) {
      const m = midiDe(f, prefs.la4);
      objetivo = Math.round(m);
      cents = (m - objetivo) * 100;
    } else {
      cuerda = automatico ? senal.auto : cuerdaManual;
    }
    if (cuerda !== null) {
      objetivo = afinacion.notas[cuerda];
      cents = centsEntre(f, objetivo, prefs.la4);
    }
  }

  const enTolerancia = cents !== null && Math.abs(cents) <= TOLERANCIA;
  const viva = lectura !== null && !lectura.retenida;

  // Una cuerda cuenta como afinada si se mantiene dentro un momento.
  useEffect(() => {
    if (cromatico || cuerda === null || !viva || !enTolerancia) {
      dentroDesde.current = null;
      return;
    }
    const ahora = performance.now();
    if (!dentroDesde.current || dentroDesde.current.cuerda !== cuerda) {
      dentroDesde.current = { cuerda, t: ahora };
      return;
    }
    if (ahora - dentroDesde.current.t >= TIEMPO_AFINADA && !afinadas.has(cuerda)) {
      const nuevas = new Set(afinadas);
      nuevas.add(cuerda);
      setAfinadas(nuevas);
      try {
        navigator.vibrate?.(nuevas.size === afinacion.notas.length ? [18, 60, 18, 60, 40] : 14);
      } catch {
        /* sin vibración */
      }
      if (nuevas.size === afinacion.notas.length) {
        setCelebrando(true);
        temporizadores.current.push(setTimeout(() => setCelebrando(false), 2800));
      }
    }
  }, [lectura, cuerda, viva, enTolerancia, cromatico, afinadas, afinacion.notas.length]);

  // ---------- Micrófono ----------
  const pedirBloqueo = useCallback(async () => {
    try {
      const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<WakeLock> } }).wakeLock;
      if (wl && document.visibilityState === "visible") bloqueo.current = await wl.request("screen");
    } catch {
      /* la pantalla se apagará sola, no pasa nada */
    }
  }, []);

  const empezar = useCallback(async () => {
    if (!motor.current) motor.current = new Motor(alLeer);
    motor.current.frecuenciaMin = instrumento.frecuenciaMin;
    setEstado("pidiendo");
    const resultado = await motor.current.empezar();
    setEstado(resultado);
    if (resultado === "escuchando") pedirBloqueo();
  }, [pedirBloqueo, alLeer, instrumento.frecuenciaMin]);

  const parar = useCallback(() => {
    motor.current?.parar();
    setEstado("parado");
    bloqueo.current?.release().catch(() => undefined);
    bloqueo.current = null;
  }, []);

  useEffect(() => {
    const alVolver = async () => {
      if (document.visibilityState !== "visible" || !motor.current?.escuchando) return;
      const r = await motor.current.reanudar();
      if (r) setEstado(r);
      pedirBloqueo();
    };
    document.addEventListener("visibilitychange", alVolver);
    const timers = temporizadores.current;
    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      timers.forEach(clearTimeout);
      motor.current?.parar();
    };
  }, [pedirBloqueo]);

  // ---------- Nota de referencia ----------
  const contextoTono = () => {
    const ctx = motor.current?.contexto ?? ctxTono.current ?? crearContextoAudio();
    if (ctx && !motor.current?.contexto) ctxTono.current = ctx;
    ctx?.resume().catch(() => undefined);
    return ctx;
  };

  const marcarTono = (indice: number | null, desde: number, durante: number) => {
    temporizadores.current.push(setTimeout(() => setTonoEn(indice), desde));
    temporizadores.current.push(setTimeout(() => setTonoEn((v) => (v === indice ? null : v)), desde + durante));
  };

  const oirNota = (midi: number, indice: number | null) => {
    const ctx = contextoTono();
    if (!ctx) return;
    const ms = tocarNota(ctx, frecuenciaDe(midi, prefs.la4));
    motor.current?.ensordecer(ms + 250);
    marcarTono(indice, 0, Math.min(ms, 1600));
  };

  const oirTodas = () => {
    const ctx = contextoTono();
    if (!ctx) return;
    const ms = tocarArpegio(ctx, afinacion.notas.map((m) => frecuenciaDe(m, prefs.la4)));
    motor.current?.ensordecer(ms + 250);
    afinacion.notas.forEach((_, i) => marcarTono(i, i * 420, 420));
  };

  // ---------- Textos ----------
  const parteObjetivo = objetivo !== null ? partesNota(objetivo, prefs.notacion, cromatico ? false : afinacion.bemoles) : null;
  const cuerdaFoco = automatico ? senal.auto : cuerdaManual;
  const notaFoco = !cromatico && cuerdaFoco !== null ? partesNota(afinacion.notas[cuerdaFoco], prefs.notacion, afinacion.bemoles) : null;

  let principal = "";
  let detalle = "";
  if (estado === "pidiendo") {
    principal = "Permite el micrófono";
    detalle = `Solo lo usamos para oír ${instrumento.tuyo}. No se graba nada.`;
  } else if (estado === "denegado") {
    principal = "No hay permiso para el micrófono";
    detalle = "En el iPhone: Ajustes, Safari, Micrófono, y permite esta página. Luego vuelve a tocar el botón.";
  } else if (estado === "sin-soporte") {
    principal = "Este navegador no deja usar el micrófono";
    detalle = "Abre la página en Safari o en Chrome.";
  } else if (estado === "error") {
    principal = "No se ha podido abrir el micrófono";
    detalle = "Comprueba que ninguna otra app lo está usando y vuelve a intentarlo.";
  } else if (estado === "parado") {
    principal = `Afina ${instrumento.tuyo}`;
    detalle = "Toca el círculo para empezar a escuchar.";
  } else if (cents === null || !viva) {
    if (lectura?.retenida && cents !== null && Math.abs(cents) <= TOLERANCIA) {
      principal = "Afinada";
      detalle = cuerda !== null ? `La ${total - cuerda}.ª cuerda está lista.` : "Perfecta.";
    } else {
      principal = cromatico ? "Toca una nota" : automatico ? "Toca cualquier cuerda" : `Toca la ${total - cuerdaManual}.ª cuerda`;
      detalle = cromatico
        ? "Reconozco cualquier nota."
        : automatico
          ? "Sé cuál es por cómo suena."
          : `Tiene que sonar ${notaFoco?.base ?? ""}${notaFoco?.alteracion ?? ""}${notaFoco?.octava ?? ""}.`;
    }
  } else if (enTolerancia) {
    principal = "Afinada";
    detalle = cuerda !== null ? `La ${total - cuerda}.ª cuerda está lista.` : "Perfecta.";
  } else {
    const grave = cents < 0;
    const lejos = Math.abs(cents) > 50 ? "bastante" : Math.abs(cents) > 20 ? "" : "un poco";
    principal = `${grave ? "Sube" : "Baja"} ${lejos}`.trim();
    detalle = grave ? "Está grave: tensa la cuerda." : "Está aguda: afloja la cuerda.";
  }

  const sonandoCuerda = tonoEn ?? (viva ? cuerda : null);
  const celebrandoAhora = celebrando && !cromatico;

  return (
    <main className={`app ${listo ? "es-lista" : ""}`}>
      {listo && instrumento.fondo && (
        <div key={instrumento.id} className="fondo-estudio" style={{ backgroundImage: `url(${instrumento.fondo})` }} aria-hidden="true" />
      )}
      <header className="cabecera">
        <Navegacion actual="afinar" />
        <div className="cabecera-acciones">
          {(estado === "escuchando" || estado === "pidiendo") && (
            <button type="button" className="boton-icono activo" onClick={parar} aria-label="Pausar el micrófono">
              <IconoMicro />
            </button>
          )}
          <button type="button" className="boton-la" onClick={() => setHoja("ajustes")} aria-label={`Ajustes. La a ${prefs.la4} hercios`}>
            <IconoAjustes />
            <span className="boton-la-texto">La {prefs.la4}</span>
          </button>
        </div>
      </header>

      <button type="button" className="selector-boton" onClick={() => setHoja("afinacion")}>
        <span className="selector-boton-nombre">
          {INSTRUMENTOS.length > 1 && <span className="selector-boton-instrumento">{instrumento.nombre}</span>}
          {cromatico ? "Cromático" : afinacion.nombre}
        </span>
        <span className="selector-boton-notas">
          {cromatico
            ? "Cualquier nota"
            : afinacion.notas.map((m, i) => {
                const p = partesNota(m, prefs.notacion, afinacion.bemoles);
                return (
                  <span key={i} className={afinadas.has(i) ? "ok" : ""}>
                    {p.base}
                    {p.alteracion}
                  </span>
                );
              })}
        </span>
        <svg viewBox="0 0 16 16" className="selector-boton-flecha" aria-hidden="true">
          <path d="M4 6 L8 10 L12 6" />
        </svg>
      </button>

      <section className="escenario">
        <div className="zona-roseta">
          <div className={`estado ${enTolerancia && viva ? "ok" : ""} ${celebrandoAhora ? "fiesta" : ""}`} role="status" aria-live="polite">
            <p className="estado-principal">{celebrandoAhora ? instrumento.afinado : principal}</p>
            <p className="estado-detalle">{celebrandoAhora ? `Las ${enLetra(total)} cuerdas están en su sitio.` : detalle}</p>
          </div>

          <Roseta cents={viva || lectura?.retenida ? cents : null} afinada={enTolerancia} brillo={celebrandoAhora} apagada={estado !== "escuchando"}>
            {estado !== "escuchando" ? (
              <button type="button" className="boca-boton" onClick={empezar} disabled={estado === "pidiendo"}>
                <IconoMicro grande />
                <span>{estado === "parado" ? "Empezar" : estado === "pidiendo" ? "Un momento…" : "Intentar otra vez"}</span>
              </button>
            ) : parteObjetivo && cents !== null ? (
              <div className={`lectura ${lectura?.retenida ? "retenida" : ""}`} aria-live="off">
                <div className="lectura-nota">
                  <span className="lectura-base">{parteObjetivo.base}</span>
                  <span className="lectura-lado">
                    <span className="lectura-alt">{parteObjetivo.alteracion}</span>
                    <span className="lectura-octava">{parteObjetivo.octava}</span>
                  </span>
                </div>
                <div className={`lectura-cents ${enTolerancia ? "ok" : ""}`}>
                  {enTolerancia ? "0" : `${cents > 0 ? "+" : "−"}${Math.abs(Math.round(cents))}`}
                  <span> cents</span>
                </div>
                <div className="lectura-hz">{f !== null ? `${formatoHz(f)} Hz` : ""}</div>
              </div>
            ) : (
              <div className="escuchando">
                {notaFoco && !automatico ? (
                  <div className="lectura-nota tenue">
                    <span className="lectura-base">{notaFoco.base}</span>
                    <span className="lectura-lado">
                      <span className="lectura-alt">{notaFoco.alteracion}</span>
                      <span className="lectura-octava">{notaFoco.octava}</span>
                    </span>
                  </div>
                ) : (
                  <span className="ondas" aria-hidden="true">
                    <i />
                    <i />
                    <i />
                    <i />
                    <i />
                  </span>
                )}
                <span className="escuchando-texto">Escuchando</span>
              </div>
            )}
          </Roseta>
        </div>

        <div className="zona-pala">
          <div className="pala-marco">
            {/* Hasta saber qué instrumento tienes elegido no se pinta ninguna pala */}
            {listo && (
              <Pala
                key={instrumento.id}
                geometria={instrumento.pala}
                notas={afinacion.notas}
                notacion={prefs.notacion}
                bemoles={afinacion.bemoles}
                seleccionada={!cromatico && !automatico ? cuerdaManual : null}
                sonando={cromatico ? null : sonandoCuerda}
                afinadas={afinadas}
                desactivada={cromatico}
                onElegir={(i) => {
                  setAutomatico(false);
                  setCuerdaManual(i);
                }}
              />
            )}
          </div>

          {!cromatico && (
            <div className="pala-acciones">
              <button
                type="button"
                className={`interruptor ${automatico ? "on" : ""}`}
                role="switch"
                aria-checked={automatico}
                onClick={() => setAutomatico((a) => !a)}
              >
                <span className="interruptor-pista" aria-hidden="true">
                  <span className="interruptor-bola" />
                </span>
                <span>Automático</span>
              </button>

              <button
                type="button"
                className="boton-oir"
                onClick={() => (automatico ? oirTodas() : oirNota(afinacion.notas[cuerdaManual], cuerdaManual))}
              >
                <IconoAltavoz />
                <span>{automatico ? `Oír las ${enLetra(total)}` : `Oír ${notaFoco?.base ?? ""}${notaFoco?.alteracion ?? ""}`}</span>
              </button>
            </div>
          )}
          {cromatico && <p className="pala-nota">En modo cromático no hay cuerdas fijas: toca la nota que quieras.</p>}
        </div>
      </section>

      <Hoja abierta={hoja === "afinacion"} titulo="Afinación" onCerrar={() => setHoja(null)}>
        <SelectorAfinacion
          cabecera={
            INSTRUMENTOS.length > 1 && (
              <div
                className="segmentado instrumentos"
                role="group"
                aria-label="Instrumento"
                style={{ gridTemplateColumns: `repeat(${INSTRUMENTOS.length}, 1fr)` }}
              >
                {INSTRUMENTOS.map((i) => (
                  <button key={i.id} type="button" aria-pressed={i.id === instrumento.id} onClick={() => cambiarInstrumento(i.id)}>
                    {i.nombre}
                  </button>
                ))}
              </div>
            )
          }
          afinaciones={todas}
          actualId={afinacionId}
          notacion={prefs.notacion}
          onElegir={(id) => {
            cambiarPrefs(elegirAfinacion(id));
            setAutomatico(true);
            setCuerdaManual(0);
            setHoja(null);
          }}
          onCrear={() => setHoja("editor")}
          onBorrar={(id) =>
            cambiarPrefs({
              propias: prefs.propias.filter((a) => a.id !== id),
              ...(afinacionId === id ? elegirAfinacion(estandarDe(familia).id) : {}),
            })
          }
        />
      </Hoja>

      <Hoja abierta={hoja === "editor"} titulo="Nueva afinación" onCerrar={() => setHoja("afinacion")}>
        <EditorAfinacion
          notasIniciales={afinacion.notas}
          rango={instrumento.rango}
          notacion={prefs.notacion}
          onProbar={(m, i) => oirNota(m, i)}
          onGuardar={(nombre, notas, bemoles) => {
            const nueva: Afinacion = {
              id: `mia-${Date.now().toString(36)}`,
              nombre,
              grupo: "mias",
              notas,
              bemoles,
              ...(familia === "bajo" ? { familia } : {}),
            };
            cambiarPrefs({ propias: [nueva, ...prefs.propias], ...elegirAfinacion(nueva.id) });
            setAutomatico(true);
            setHoja(null);
          }}
        />
      </Hoja>

      <Hoja abierta={hoja === "ajustes"} titulo="Ajustes" onCerrar={() => setHoja(null)}>
        <Ajustes la4={prefs.la4} notacion={prefs.notacion} onLa4={(la4) => cambiarPrefs({ la4 })} onNotacion={(notacion) => cambiarPrefs({ notacion })} />
      </Hoja>
    </main>
  );
}

function IconoMicro({ grande }: { grande?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={grande ? "icono grande" : "icono"} aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" />
    </svg>
  );
}

function IconoAjustes() {
  return (
    <svg viewBox="0 0 24 24" className="icono" aria-hidden="true">
      <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
      <circle cx="16" cy="7" r="2.2" />
      <circle cx="10" cy="17" r="2.2" />
    </svg>
  );
}

function IconoAltavoz() {
  return (
    <svg viewBox="0 0 24 24" className="icono" aria-hidden="true">
      <path d="M4 9.5h3.5L12 5.5v13l-4.5-4H4z" />
      <path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11" />
    </svg>
  );
}
