"use client";

// Una lección de «Aprender»: enseña la nota (nombre, cuerda y dónde pisar), escucha con el motor
// del afinador y avanza cuando suena la correcta (lib/aprender/juez). Al acabar, estrellas.
// El micro se abre con «Empezar» (el iPhone lo pide en un toque) y sigue abierto si pasas a la
// siguiente lección; se cierra al salir.

import { useCallback, useEffect, useRef, useState } from "react";
import Diapason from "./Diapason";
import { midiDePaso, siguienteDe, TODAS, type Leccion as TipoLeccion } from "@/lib/aprender/curso";
import { Juez } from "@/lib/aprender/juez";
import { estrellasDe, guardarEstrellas } from "@/lib/aprender/progreso";
import { crearContextoAudio, Motor, type EstadoMicro, type LecturaEstable } from "@/lib/motor";
import { sonarAunqueEnSilencio } from "@/lib/sesionAudio";
import { frecuenciaDe, midiDe, nombreNota, partesNota, type Notacion } from "@/lib/notas";
import { mantenerPantalla, type BloqueoPantalla } from "@/lib/pantalla";
import { tocarNota } from "@/lib/tono";
import Estrella from "./Estrella";

interface Props {
  leccion: TipoLeccion;
  notacion: Notacion;
  la4: number;
  onSalir: () => void;
  /** Cambiar a otra lección sin cerrar el micro (siguiente u «otra vez») */
  onCambiar: (id: string) => void;
  onTerminada: () => void;
}

const ORDINAL = ["", "1.ª", "2.ª", "3.ª", "4.ª", "5.ª", "6.ª"];

export default function Leccion({ leccion, notacion, la4, onSalir, onCambiar, onTerminada }: Props) {
  const [i, setI] = useState(0);
  const [estado, setEstado] = useState<EstadoMicro>("parado");
  const [destello, setDestello] = useState<"normal" | "acierto" | "fallo">("normal");
  const [aviso, setAviso] = useState<number | null>(null);
  const [oido, setOido] = useState<number | null>(null);
  const [fin, setFin] = useState<{ estrellas: number; fallos: number } | null>(null);

  const motor = useRef<Motor | null>(null);
  const juez = useRef<Juez | null>(null);
  const indice = useRef(0);
  const fallos = useRef(0);
  const terminada = useRef(false);
  const pasos = useRef(leccion.pasos);
  const ctxTono = useRef<AudioContext | null>(null);
  const bloqueo = useRef<BloqueoPantalla | null>(null);
  const tiempos = useRef<ReturnType<typeof setTimeout>[]>([]);
  const manejar = useRef<(l: LecturaEstable | null) => void>(() => undefined);

  const paso = leccion.pasos[Math.min(i, leccion.pasos.length - 1)];
  const objetivo = midiDePaso(paso);

  const destellar = useCallback((tipo: "acierto" | "fallo") => {
    setDestello(tipo);
    tiempos.current.push(setTimeout(() => setDestello("normal"), tipo === "acierto" ? 260 : 600));
  }, []);

  // Lo que hace cada lectura del micro (en una ref: el motor guarda la función al crearse)
  useEffect(() => {
    manejar.current = (l) => {
      const m = l ? Math.round(midiDe(l.frecuencia, la4)) : null;
      setOido((o) => (o === m ? o : m));
      if (terminada.current || !juez.current) return;
      const v = juez.current.lectura(l, performance.now());
      if (!v) return;
      if (v.tipo === "otra") {
        fallos.current++;
        setAviso(v.midi);
        destellar("fallo");
        tiempos.current.push(setTimeout(() => setAviso((a) => (a === v.midi ? null : a)), 1600));
        return;
      }
      // Acierto: a la siguiente nota, o se acaba
      setAviso(null);
      destellar("acierto");
      // Vibrar solo si ya se ha tocado la pantalla (si no, el navegador se queja)
      if ((navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive) navigator.vibrate?.(25);
      indice.current++;
      if (indice.current >= pasos.current.length) {
        terminada.current = true;
        const estrellas = estrellasDe(fallos.current);
        guardarEstrellas(leccion.id, estrellas);
        setFin({ estrellas, fallos: fallos.current });
        onTerminada();
        return;
      }
      juez.current.pedir(midiDePaso(pasos.current[indice.current]));
      setI(indice.current);
    };
  }, [la4, leccion.id, destellar, onTerminada]);

  const empezar = async () => {
    if (!juez.current) juez.current = new Juez(la4);
    juez.current.la4 = la4;
    juez.current.reiniciar();
    juez.current.pedir(midiDePaso(pasos.current[indice.current]));
    if (!motor.current) {
      motor.current = new Motor((l) => manejar.current(l));
      motor.current.alNivel = (v, t) => juez.current?.nivel(v, t);
    }
    motor.current.frecuenciaMin = 55;
    setEstado("pidiendo");
    const r = await motor.current.empezar();
    setEstado(r);
    if (r === "escuchando") bloqueo.current = await mantenerPantalla();
  };

  // Otra lección (o la misma otra vez) sin cerrar el micro
  const irA = (l: TipoLeccion) => {
    indice.current = 0;
    fallos.current = 0;
    terminada.current = false;
    pasos.current = l.pasos;
    juez.current?.reiniciar();
    juez.current?.pedir(midiDePaso(l.pasos[0]));
    setI(0);
    setFin(null);
    setAviso(null);
    if (l.id !== leccion.id) onCambiar(l.id);
  };

  const oir = () => {
    const ctx = motor.current?.contexto ?? ctxTono.current ?? crearContextoAudio();
    if (!ctx) return;
    if (!motor.current?.contexto) ctxTono.current = ctx;
    sonarAunqueEnSilencio();
    ctx.resume().catch(() => undefined);
    const ms = tocarNota(ctx, frecuenciaDe(objetivo, la4));
    motor.current?.ensordecer(ms + 250);
  };

  useEffect(() => {
    const alVolver = async () => {
      if (document.visibilityState !== "visible" || !motor.current?.escuchando) return;
      const r = await motor.current.reanudar();
      if (r) setEstado(r);
      bloqueo.current = await mantenerPantalla();
    };
    document.addEventListener("visibilitychange", alVolver);
    const t = tiempos.current;
    return () => {
      document.removeEventListener("visibilitychange", alVolver);
      t.forEach(clearTimeout);
      motor.current?.parar();
      bloqueo.current?.release().catch(() => undefined);
    };
  }, []);

  const escuchando = estado === "escuchando";
  const nota = partesNota(objetivo, notacion);
  const siguiente = siguienteDe(leccion.id);
  const numero = TODAS.findIndex((l) => l.id === leccion.id) + 1;
  // Carril: la anterior, la de ahora y las que vienen
  const desde = Math.max(0, i - 1);
  const carril = leccion.pasos.slice(desde, desde + 7).map((p, k) => ({ p, n: desde + k }));
  const oyeLaBuena = oido !== null && [0, 12, -12].includes(oido - objetivo);

  return (
    <main className={`app app-aprender en-leccion ${destello}`}>
      <header className="leccion-arriba">
        <button type="button" className="leccion-cerrar" onClick={onSalir} aria-label="Salir de la lección">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
        <div className="progreso leccion-progreso" role="progressbar" aria-valuemin={0} aria-valuemax={leccion.pasos.length} aria-valuenow={i}>
          <span style={{ width: `${(fin ? 1 : i / leccion.pasos.length) * 100}%` }} />
        </div>
        <span className="leccion-cuenta">
          {Math.min(i + 1, leccion.pasos.length)}/{leccion.pasos.length}
        </span>
      </header>

      <p className="leccion-titulo">
        {numero}. {leccion.titulo}
      </p>

      <ol className="carril" aria-label="Notas">
        {carril.map(({ p, n }) => (
          <li key={n} className={n < i ? "hecha" : n === i ? "ahora" : ""}>
            {nombreNota(midiDePaso(p), notacion)}
          </li>
        ))}
      </ol>

      <section className="leccion-centro" aria-live="polite">
        <p className="leccion-nota">
          {nota.base}
          {nota.alteracion && <span className="alteracion">{nota.alteracion}</span>}
        </p>
        <p className="leccion-donde">
          {ORDINAL[paso.cuerda]} cuerda · {paso.traste === 0 ? "al aire" : `traste ${paso.traste}`}
        </p>
        <Diapason paso={paso} estado={destello} notacion={notacion} />
        <p className={`leccion-oido${oyeLaBuena ? " buena" : ""}`}>
          {!escuchando
            ? leccion.consejo ?? " "
            : aviso !== null
              ? `Suena ${nombreNota(aviso, notacion)} · busca ${nombreNota(objetivo, notacion)}`
              : oido !== null
                ? `Oigo ${nombreNota(oido, notacion)}`
                : "Te escucho…"}
        </p>
      </section>

      <div className="leccion-abajo">
        <button type="button" className="boton-texto leccion-oir" onClick={oir}>
          Oír la nota
        </button>
        {!escuchando && (
          <button type="button" className="boton-principal leccion-empezar" onClick={() => void empezar()} disabled={estado === "pidiendo"}>
            {estado === "pidiendo" ? "Abriendo el micro…" : "Empezar"}
          </button>
        )}
        {(estado === "denegado" || estado === "sin-soporte" || estado === "error") && (
          <p className="leccion-error" role="alert">
            {estado === "denegado"
              ? "Sin permiso para el micrófono. Actívalo en los ajustes del navegador y vuelve a probar."
              : "No se ha podido abrir el micrófono en este aparato."}
          </p>
        )}
      </div>

      {fin && (
        <div className="leccion-fin" role="dialog" aria-label="Lección terminada">
          <div className="leccion-fin-caja">
            <p className="estrellas" aria-label={`${fin.estrellas} de 3 estrellas`}>
              {[1, 2, 3].map((k) => (
                <span key={k} className={k <= fin.estrellas ? "llena" : ""}>
                  <Estrella />
                </span>
              ))}
            </p>
            <p className="leccion-fin-texto">{fin.fallos === 0 ? "¡Sin fallos!" : fin.fallos === 1 ? "1 fallo" : `${fin.fallos} fallos`}</p>
            {siguiente && (
              <button type="button" className="boton-principal" onClick={() => irA(siguiente)}>
                Siguiente: {siguiente.titulo}
              </button>
            )}
            <button type="button" className="boton-texto" onClick={() => irA(leccion)}>
              Otra vez
            </button>
            <button type="button" className="boton-texto" onClick={onSalir}>
              Volver al curso
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
