"use client";

// La consola de la Mesa: arriba, fija, la grabadora de bobinas (GrabadoraMesa: teclas, contador,
// los VU de cada canal, la onda de la canción para elegir un trozo, los avisos y REC, que enciende
// las entradas); abajo, la mesa de mezclas de la foto (MesaFoto), que se desliza con el dedo si no
// cabe. SELECT abre los efectos del canal en una hoja.
// Canales 1 y 2: las entradas de la interfaz (lib/mesa/mesa, sigue sonando con la consola
// cerrada). Desde Pistas, además, las 6 pistas de la canción (canales 3 a 8): su volumen y su
// silencio son los del reproductor; sus efectos, los de su canal en lib/pistas/reproductor.
// En el móvil de pie pide girarlo: la mesa necesita la pantalla tumbada.

import { useEffect, useRef, useState, type ComponentProps, type RefObject } from "react";
import EfectosMesa, { efectosActivos } from "./EfectosMesa";
import MesaFoto, { ALTO_MESA, ANCHO_MESA, type CanalFoto } from "./MesaFoto";
import CanalGrande from "./CanalGrande";
import AyudaMesa from "./AyudaMesa";
import GrabadoraMesa, { ALTO_CINTA, ANCHO_CINTA, anguloVu, VU_REPOSO, VUS } from "./GrabadoraMesa";
import type { CancionesPlaca } from "./PlacaCanciones";
import type { Cancion } from "@/lib/pistas/tipos";
import { type Transporte } from "./TransporteMesa";
import {
  AJUSTES_INICIALES,
  AJUSTES_PISTA,
  conMaestros,
  generalCancion,
  guardarAjustesMesa,
  guardarAjustesPistas,
  leerAjustesMesa,
  leerAjustesPistas,
  type AjustesCanal,
  type AjustesMesa,
} from "@/lib/mesa/ajustes";
import { mesa } from "@/lib/mesa/mesa";
import { duracionToma, wavDeToma, type Toma } from "@/lib/mesa/toma";
import { guardarArchivo } from "@/lib/pistas/exportar";
import { esMovil } from "@/lib/pistas/aparato";
import { formatoTiempo } from "@/lib/pistas/tipos";
import { guardarAjustesMetronomo, leerAjustesMetronomo, Metronomo, type AjustesMetronomo } from "@/lib/metronomo";
import MetronomoMesa, { type MetronomoCancion } from "./MetronomoMesa";
import CarpetasMesa from "./CarpetasMesa";
import { guardarCuentaMesa, leerCuentaMesa, SEGUNDOS_CUENTA } from "@/lib/mesa/cuenta";
import { guardarEscucha, guardarModoGrabar, leerEscucha, leerModoGrabar, RETRASO_BLUETOOTH, RETRASO_QUE_SE_NOTA, type ModoGrabar } from "@/lib/mesa/escucha";
import { useEstadoMesa } from "@/lib/mesa/usarMesa";
import { useHidratado } from "@/lib/hidratado";

/** Las pistas de la canción que suena en Pistas, para tenerlas como canales 3 a 8. */
export interface PistasMesa {
  /** La canción (al cambiarla, la Mesa no se desmonta: ver «Otra canción» más abajo) */
  id: string;
  nombres: string[];
  /** «la voz», «el bajo»… (para el título de sus efectos) */
  conArticulo: string[];
  volumen: number[];
  silencio: boolean[];
  solo: boolean[];
  onVolumen: (i: number, v: number) => void;
  onSilencio: (i: number) => void;
  onSolo: (i: number) => void;
  /** Hay un «Solo» en alguna entrada: las pistas sin «Solo» se callan */
  onSoloFuera: (activo: boolean) => void;
  /** El reproductor de la canción, para tocar, moverse y repetir un trozo desde la Mesa */
  transporte: Transporte;
  /** Lo que tarda la canción en salir por los cascos (segundos), para poner la toma a tiempo */
  retrasoSalida: () => number;
  /** Escuchar la toma de REC con la canción, desde donde empezó */
  escucharToma: (t: Toma) => void;
  pararToma: () => void;
  /** La canción entera (como suena ahora) con la toma encima, en WAV */
  mezclaConToma: (t: Toma) => Promise<{ blob: Blob; nombre: string }>;
  /** Ecualizador, efectos y panorama de una pista */
  aplicar: (i: number, a: AjustesCanal) => void;
  volumenGeneral: (v: number) => void;
  /** Picos (0–1) de cada pista y de la salida (también por lado: izq y der) */
  niveles: () => { pistas: number[]; general: number; izq?: number; der?: number };
  /** Espectro de cada pista tras su fader (dB por banda; hz = lo que mide cada banda) */
  espectros: () => { datos: Float32Array<ArrayBuffer>[]; hz: number } | null;
  /** El metrónomo con el ritmo de la canción (y la cuenta antes de grabar en ese ritmo) */
  metronomo: MetronomoCancion;
}

type Abierta = { tipo: "entrada" | "pista"; i: number };

/**
 * La grabadora sobre la mesa como una sola pieza, en píxeles de la foto de la mesa: la madera de
 * la grabadora (1993 px de ancho, de x = 3 a 1996) mide lo mismo que la de arriba de la mesa
 * (1641 px, de x = 56 a 1697), su borde izquierdo encima del de la mesa, y la mesa monta un poco
 * sobre ella (tapa sus esquinas redondeadas de abajo): sin hueco.
 */
const K_CINTA = 1641 / 1993;
const PIEZA = (() => {
  const altoCinta = ALTO_CINTA * K_CINTA;
  const yMesa = altoCinta - 9;
  return { xCinta: 56 - 3 * K_CINTA, yMesa, alto: yMesa + 838 };
})();

function Pieza({
  escala,
  cinta,
  abajo,
  propsCinta,
  propsMesa,
  elegir,
}: {
  escala: number;
  cinta: RefObject<HTMLDivElement | null>;
  abajo: RefObject<HTMLDivElement | null>;
  propsCinta: Omit<ComponentProps<typeof GrabadoraMesa>, "escala">;
  propsMesa: Omit<ComponentProps<typeof MesaFoto>, "escala">;
  /** En la vista de las dos (móvil): cada parte se toca para verla en grande */
  elegir?: (p: "cinta" | "mesa") => Record<string, unknown>;
}) {
  return (
    <div className="cf-pieza" style={{ width: ANCHO_MESA * escala, height: PIEZA.alto * escala }}>
      <div
        className={`cf-pieza-cinta${elegir ? " cf-parte" : ""}`}
        style={{ left: PIEZA.xCinta * escala, top: 0 }}
        {...(elegir ? { "aria-label": "Ver la grabadora en grande", ...elegir("cinta") } : {})}
      >
        <div ref={cinta} inert={!!elegir}>
          <GrabadoraMesa escala={escala * K_CINTA} {...propsCinta} />
        </div>
      </div>
      <div
        className={`cf-pieza-mesa${elegir ? " cf-parte" : ""}`}
        style={{ left: 0, top: PIEZA.yMesa * escala }}
        {...(elegir ? { "aria-label": "Ver la mesa de mezclas en grande", ...elegir("mesa") } : {})}
      >
        <div ref={abajo} inert={!!elegir}>
          <MesaFoto escala={escala} {...propsMesa} />
        </div>
      </div>
    </div>
  );
}

/** Se ha puesto otra canción desde la placa con la grabadora en grande (ver «parte») */
let seguirEnLaCinta = false;

const LECTURA_MS = 1400;
/** Dónde queda el pico más fuerte de lo que tocas tras el ajuste automático del TRIM (dBFS) */
const PICO_OBJETIVO = -9;
/** Las tomas que se guardan (en memoria: cada minuto en estéreo ocupa unos 20 MB) */
const MAX_TOMAS = 6;

interface TomaGuardada {
  id: number;
  nombre: string;
  toma: Toma;
}

/** Un golpe de la cuenta atrás de REC */
function clic(ctx: AudioContext, t: number, fuerte: boolean) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.value = fuerte ? 1760 : 1320;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.5, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
  o.connect(g).connect(ctx.destination);
  o.start(t);
  o.stop(t + 0.09);
}
/** Canales 3 a 8 de la foto (VOCALS, DRUMS, BASS, GUITAR, PIANO, OTHER) → su pista (orden de PISTAS) */
const PISTA_DE_CANAL = [0, 3, 2, 1, 4, 5];

// El selector de pistas en el escritorio: su foto mide 277×145

export default function ConsolaMesa({
  pistas,
  canciones,
}: {
  pistas?: PistasMesa;
  /** Para el selector de la placa de la grabadora */
  canciones?: CancionesPlaca;
}) {
  const hidratado = useHidratado();
  const estado = useEstadoMesa();
  const n = pistas?.nombres.length ?? 0;
  const [cambiados, setAjustes] = useState<AjustesMesa | null>(null);
  const [pistasCambiadas, setAjustesPistas] = useState<AjustesCanal[] | null>(
    null,
  );
  const [retraso, setRetraso] = useState<number | null>(null);
  const [abierta, setAbierta] = useState<Abierta | null>(null);
  // «Solo» de las entradas (el de las pistas es el del reproductor). No se guarda: es para oír algo un momento.
  const [soloEntradas, setSoloEntradas] = useState<[boolean, boolean]>([
    false,
    false,
  ]);
  const soloEnEntradas = soloEntradas[0] || soloEntradas[1];
  const algunSolo = soloEnEntradas || (pistas?.solo.some(Boolean) ?? false);
  const [lectura, setLectura] = useState<{
    donde: string;
    texto: string;
  } | null>(null);
  const tLectura = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abajo = useRef<HTMLDivElement>(null);
  const cinta = useRef<HTMLDivElement>(null);
  const ultimasPistas = useRef(pistas);
  const ajustes =
    cambiados ?? (hidratado ? leerAjustesMesa() : AJUSTES_INICIALES);
  const ajustesPistas =
    pistasCambiadas ??
    (hidratado
      ? leerAjustesPistas(n)
      : Array.from({ length: n }, () => AJUSTES_PISTA));
  const encendida = estado === "encendida";
  const conPistas = n > 0;

  useEffect(() => {
    ultimasPistas.current = pistas;
  });

  // A la Mesa le llega cada entrada callada si hay algún «Solo» y ella no lo tiene
  const conSolo = (a: AjustesMesa): AjustesMesa => ({
    ...a,
    canales: a.canales.map((c, i) => ({
      ...c,
      silencio: c.silencio || (algunSolo && !soloEntradas[i]),
    })) as AjustesMesa["canales"],
  });
  const cambiar = (nuevo: AjustesMesa) => {
    setAjustes(nuevo);
    guardarAjustesMesa(nuevo);
    mesa.aplicar(conSolo(nuevo));
  };
  const cambiarEntrada = (i: number, f: (c: AjustesCanal) => AjustesCanal) => {
    const canales = [...ajustes.canales] as AjustesMesa["canales"];
    canales[i] = f(canales[i]);
    cambiar({ ...ajustes, canales });
  };
  const cambiarPista = (i: number, f: (c: AjustesCanal) => AjustesCanal) => {
    const lista = [...ajustesPistas];
    lista[i] = f(lista[i]);
    setAjustesPistas(lista);
    guardarAjustesPistas(lista);
    pistas?.aplicar(i, conMaestros(lista[i], ajustes.maestros));
  };
  // La sección general: el volumen y las ruedas mandan en las entradas (Mesa) y en la canción
  const cambiarGeneral = (nuevo: AjustesMesa) => {
    const reverbODelay = nuevo.maestros.reverb !== ajustes.maestros.reverb || nuevo.maestros.delay !== ajustes.maestros.delay;
    cambiar(nuevo);
    if (!pistas) return;
    pistas.volumenGeneral(generalCancion(nuevo));
    if (reverbODelay) ajustesPistas.forEach((c, i) => pistas.aplicar(i, conMaestros(c, nuevo.maestros)));
  };
  // La pantalla enseña el mando que se mueve y, al rato, vuelve a lo suyo
  const leer = (donde: string, texto: string) => {
    setLectura({ donde, texto });
    if (tLectura.current) clearTimeout(tLectura.current);
    tLectura.current = setTimeout(() => setLectura(null), LECTURA_MS);
  };
  useEffect(
    () => () => void (tLectura.current && clearTimeout(tLectura.current)),
    [],
  );

  // Al cambiar un «Solo»: las entradas y las pistas, a la vez
  useEffect(() => {
    mesa.aplicar(conSolo(ajustes));
    ultimasPistas.current?.onSoloFuera(soloEnEntradas);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [algunSolo, soloEntradas]);
  // Al salir de la consola se quitan los «Solo» de las entradas (la Mesa sigue sonando)
  useEffect(
    () => () => {
      mesa.aplicar(leerAjustesMesa());
      ultimasPistas.current?.onSoloFuera(false);
    },
    [],
  );

  // ---------- Dos maneras de grabar: con interfaz de audio o sin ella (lib/mesa/escucha) ----------
  // La primera vez que se van a encender las entradas (con INPUT, con REC o al ajustar la ganancia)
  // la Mesa pregunta cómo vas a grabar; lo que se iba a hacer se hace al elegir (en ese mismo toque:
  // el iPhone solo deja abrir el micro desde un toque).
  const [modoCambiado, setModoCambiado] = useState<ModoGrabar | null>(null);
  const modo: ModoGrabar | null = modoCambiado ?? (hidratado ? leerModoGrabar() : null);
  const [pideModo, setPideModo] = useState<{ que: "encender" } | { que: "rec" } | { que: "ganancia"; canal: 0 | 1 } | null>(null);
  const ponerModo = (m: ModoGrabar) => {
    setModoCambiado(m);
    guardarModoGrabar(m);
    cambiarEscucha(m === "interfaz");
  };
  const elegirModo = (m: ModoGrabar) => {
    const pendiente = pideModo;
    ponerModo(m);
    setPideModo(null);
    if (pendiente?.que === "encender") void encender(true);
    else if (pendiente?.que === "rec") void pulsarRec(true);
    else if (pendiente?.que === "ganancia") void ajustarGanancia(pendiente.canal, true);
  };

  /** `elegido`: el modo de grabar se acaba de elegir (no hay que preguntarlo) */
  const encender = async (elegido = false) => {
    if (mesa.grabando) await parar();
    if (encendida) return mesa.apagar();
    if (!elegido && !modo) return setPideModo({ que: "encender" });
    const r = await mesa.encender(conSolo(ajustes));
    if (r === "encendida") setRetraso(mesa.retrasoMs());
  };

  // ---------- El metrónomo de la Mesa ----------
  // Con canción va con su ritmo (el click del reproductor, sacado de la batería: ver MetronomoMesa);
  // sin canción, el tempo y el compás que pongas (los mismos que el metrónomo del afinador).
  const [verMetro, setVerMetro] = useState(false);
  // Organizar las carpetas del selector (la lente de la rueda dentada de la placa)
  const [verCarpetas, setVerCarpetas] = useState(false);
  const [metroCambiado, setMetroCambiado] = useState<AjustesMetronomo | null>(null);
  const metroAj: AjustesMetronomo = metroCambiado ?? (hidratado ? leerAjustesMetronomo() : { bpm: 90, compas: 4 });
  const [cuentaCambiada, setCuentaCambiada] = useState<boolean | null>(null);
  const conCuenta = cuentaCambiada ?? (hidratado ? leerCuentaMesa() : true);
  // Oírte en los cascos (se puede apagar para cantar o tocar sin el retraso: REC graba igual)
  const [escuchaCambiada, setEscuchaCambiada] = useState<boolean | null>(null);
  const oirse = escuchaCambiada ?? (hidratado ? leerEscucha() : true);
  const cambiarEscucha = (si: boolean) => {
    setEscuchaCambiada(si);
    guardarEscucha(si);
    mesa.oirse(si);
  };
  const metroLibre = useRef<Metronomo | null>(null);
  const [sonandoLibre, setSonandoLibre] = useState(false);
  const metroCancion = pistas?.metronomo ?? null;
  const metroListo = () => {
    if (!metroLibre.current) metroLibre.current = new Metronomo();
    metroLibre.current.bpm = metroAj.bpm;
    metroLibre.current.compas = metroAj.compas;
    return metroLibre.current;
  };
  const alternarMetro = () => {
    const m = metroListo();
    if (m.sonando) m.parar();
    else m.empezar();
    setSonandoLibre(m.sonando);
  };
  const cambiarMetro = (cambio: Partial<AjustesMetronomo>) => {
    const nuevo = { ...metroAj, ...cambio };
    setMetroCambiado(nuevo);
    guardarAjustesMetronomo(nuevo);
    if (metroLibre.current) {
      metroLibre.current.bpm = nuevo.bpm;
      metroLibre.current.compas = nuevo.compas;
    }
  };
  const teclaMetro = {
    texto: metroCancion ? (metroCancion.pulso ? String(Math.round(metroCancion.pulso.bpm)) : metroCancion.buscando ? "…" : "–") : String(metroAj.bpm),
    on: metroCancion ? metroCancion.oir && !!metroCancion.pulso : sonandoLibre,
    onAbrir: () => setVerMetro(true),
  };

  // ---------- REC: grabar lo que tocas ----------
  // REC: una cuenta de unos 3 s (se puede quitar en el metrónomo) y empieza a grabar donde esté la
  // canción (y la pone a sonar). Con el ritmo de la canción, la cuenta la da el reproductor en su
  // rejilla y la canción entra a tiempo; la toma empieza al pulsar y luego se le quita lo que dura la
  // cuenta. Se para con REC, con la pausa o cuando la canción acaba. Sin canción, graba hasta volver a
  // pulsar REC. Cada toma va a la lista (las últimas MAX_TOMAS) para elegir la mejor.
  const [grabando, setGrabando] = useState<{ desde: number | null; cuenta?: number } | null>(null);
  const [cuenta, setCuenta] = useState<number | null>(null);
  const [transcurrido, setTranscurrido] = useState(0);
  const [tomas, setTomas] = useState<TomaGuardada[]>([]);
  const [verTomas, setVerTomas] = useState(false);
  const [preparada, setPreparada] = useState<{ id: number; blob: Blob; nombre: string } | null>(null);
  const [estadoToma, setEstadoToma] = useState<string | null>(null);
  const sonoGrabando = useRef(false);
  const sonandoSola = useRef<AudioContext | null>(null);
  const relojCuenta = useRef<ReturnType<typeof setTimeout>[]>([]);
  const numeroToma = useRef(0);
  const tocandoCancion = pistas?.transporte.tocando ?? false;
  // Otra canción (elegida en la placa): la consola sigue montada, pero lo grabado era sobre la otra:
  // se deja de grabar y la lista de tomas empieza de nuevo
  const idCancion = pistas?.id;
  const idVisto = useRef(idCancion);
  useEffect(() => {
    if (idVisto.current === idCancion) return;
    idVisto.current = idCancion;
    relojCuenta.current.forEach(clearTimeout);
    relojCuenta.current = [];
    setCuenta(null);
    setGrabando(null);
    sonoGrabando.current = false;
    if (mesa.grabando) void mesa.pararToma();
    seguirEnLaCinta = false;
    setTomas([]);
    setVerTomas(false);
    setPreparada(null);
    setEstadoToma(null);
  }, [idCancion]);

  const parar = async () => {
    const g = grabando;
    relojCuenta.current.forEach(clearTimeout);
    relojCuenta.current = [];
    setCuenta(null);
    setGrabando(null);
    sonoGrabando.current = false;
    const datos = await mesa.pararToma();
    const t = ultimasPistas.current?.transporte;
    if (t?.tocando) t.onAlternar();
    if (!g || !datos || datos.muestras.length < datos.frecuencia * 2 * 0.3) return;
    // Lo que tardó la canción en salir y lo que tardó tu sonido en volver: eso sobra al principio
    // y, con la cuenta del reproductor, lo que duró la cuenta (la canción entró al acabar)
    const retrasoTotal = g.desde === null ? 0 : (ultimasPistas.current?.retrasoSalida() ?? 0) + mesa.retrasoEntrada();
    const recorte = Math.round((retrasoTotal + (g.cuenta ?? 0)) * datos.frecuencia);
    if (datos.muestras.length / 2 < recorte + datos.frecuencia * 0.3) return; // se paró en la cuenta
    numeroToma.current += 1;
    const nueva: TomaGuardada = {
      id: numeroToma.current,
      nombre: `Toma ${numeroToma.current}`,
      toma: { ...datos, desde: g.desde, recorte },
    };
    setEstadoToma(tomas.length >= MAX_TOMAS ? `Se guardan las ${MAX_TOMAS} últimas: la más antigua se ha quitado.` : null);
    setTomas((ts) => [nueva, ...ts].slice(0, MAX_TOMAS));
    setPreparada(null);
    setVerTomas(true);
  };
  const cancelarCuenta = () => {
    relojCuenta.current.forEach(clearTimeout);
    relojCuenta.current = [];
    setCuenta(null);
  };
  const empezarGrabar = async () => {
    if (!(await mesa.empezarToma())) return;
    const t = ultimasPistas.current?.transporte;
    setTranscurrido(0);
    setGrabando({ desde: t ? t.segundo : null });
    if (t && !t.tocando) t.onAlternar();
  };
  /** La cuenta atrás en la pantalla (3, 2, 1) y, al acabar, `alAcabar` */
  const verCuentaAtras = (segundos: number, alAcabar?: () => void) => {
    relojCuenta.current.forEach(clearTimeout);
    const fin = performance.now() + segundos * 1000;
    const paso = () => {
      const queda = (fin - performance.now()) / 1000;
      if (queda <= 0.03) {
        relojCuenta.current = [];
        setCuenta(null);
        alAcabar?.();
        return;
      }
      // 3, 2, 1 (aunque al ritmo de la canción dure un poco más o un poco menos de 3 s)
      setCuenta(Math.max(1, Math.min(SEGUNDOS_CUENTA, Math.ceil(queda - 0.2))));
      relojCuenta.current = [setTimeout(paso, Math.min(100, queda * 1000))];
    };
    paso();
  };
  const pulsarRec = async (elegido = false) => {
    if (grabando) return parar();
    if (cuenta !== null) return cancelarCuenta();
    if (mesa.estado !== "encendida") {
      if (!elegido && !modo) return setPideModo({ que: "rec" });
      const r = await mesa.encender(conSolo(ajustes));
      if (r !== "encendida") return;
      setRetraso(mesa.retrasoMs());
    }
    if (!conCuenta) return void empezarGrabar();
    const t = ultimasPistas.current?.transporte;
    const metro = ultimasPistas.current?.metronomo;
    // Con el ritmo de la canción: la cuenta, en su rejilla, la da el reproductor
    if (t && metro?.pulso) {
      if (!(await mesa.empezarToma())) return;
      const desde = t.segundo;
      setTranscurrido(0);
      setGrabando({ desde, cuenta: 0 });
      const segundos = await metro.tocarConCuenta(SEGUNDOS_CUENTA);
      setGrabando((g) => (g ? { ...g, cuenta: segundos } : g));
      if (segundos > 0) verCuentaAtras(segundos);
      return;
    }
    // Sin el ritmo de la canción: unos 3 s de golpes al tempo del metrónomo (acento en cada 1 del compás)
    const golpe = 60 / metroAj.bpm;
    const n = Math.max(2, Math.round(SEGUNDOS_CUENTA / golpe));
    let antes = 0.05;
    if (!t && sonandoLibre) {
      // El metrónomo ya suena: vuelve a empezar y la cuenta son sus primeros golpes (sigue al grabar)
      const m = metroListo();
      m.parar();
      m.empezar();
      antes = 0.08;
    } else {
      const ctx = mesa.ctx;
      if (ctx) for (let k = 0; k < n; k++) clic(ctx, ctx.currentTime + antes + k * golpe, k % metroAj.compas === 0);
    }
    verCuentaAtras(antes + n * golpe, () => void empezarGrabar());
  };
  // Con canción: al pararse la canción (pausa, parar o se acaba) se para la toma
  useEffect(() => {
    if (!grabando || !conPistas) return;
    if (tocandoCancion) sonoGrabando.current = true;
    else if (sonoGrabando.current) void parar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grabando, tocandoCancion]);
  // Sin canción, el contador cuenta lo que llevas grabado
  useEffect(() => {
    if (!grabando || conPistas) return;
    const id = setInterval(() => setTranscurrido((x) => x + 0.1), 100);
    return () => clearInterval(id);
  }, [grabando, conPistas]);
  // Al salir de la consola: deja de grabar, de contar y de sonar
  useEffect(
    () => () => {
      relojCuenta.current.forEach(clearTimeout);
      metroLibre.current?.cerrar();
      if (mesa.grabando) void mesa.pararToma();
      void sonandoSola.current?.close().catch(() => undefined);
    },
    [],
  );

  const pararEscucha = () => {
    ultimasPistas.current?.pararToma();
    void sonandoSola.current?.close().catch(() => undefined);
    sonandoSola.current = null;
  };
  const escucharToma = (toma: Toma) => {
    pararEscucha();
    setVerTomas(false);
    if (pistas && toma.desde !== null) return pistas.escucharToma(toma);
    // Sin canción: suena sola
    const ctx = new AudioContext();
    const n = toma.muestras.length / 2 - toma.recorte;
    if (n <= 0) return;
    const b = ctx.createBuffer(2, n, toma.frecuencia);
    const l = b.getChannelData(0);
    const d = b.getChannelData(1);
    for (let i = 0; i < n; i++) {
      l[i] = toma.muestras[(toma.recorte + i) * 2];
      d[i] = toma.muestras[(toma.recorte + i) * 2 + 1];
    }
    const fuente = ctx.createBufferSource();
    fuente.buffer = b;
    fuente.connect(ctx.destination);
    fuente.onended = () => void ctx.close().catch(() => undefined);
    fuente.start();
    sonandoSola.current = ctx;
  };
  const guardarToma = async (g: TomaGuardada, conCancion: boolean) => {
    setEstadoToma(conCancion ? `Preparando la canción con la ${g.nombre.toLowerCase()}…` : `Preparando la ${g.nombre.toLowerCase()}…`);
    try {
      const archivo =
        conCancion && pistas
          ? await pistas.mezclaConToma(g.toma).then((a) => ({ ...a, nombre: a.nombre.replace(/ \+ mi toma\.wav$/, ` + ${g.nombre.toLowerCase()}.wav`) }))
          : { blob: wavDeToma(g.toma), nombre: `${g.nombre}.wav` };
      if (esMovil()) {
        // En el móvil el menú de compartir necesita un toque nuevo
        setPreparada({ id: g.id, ...archivo });
        setEstadoToma(null);
      } else {
        const r = await guardarArchivo(archivo.blob, archivo.nombre);
        setEstadoToma(r === "cancelado" ? null : `Descargado: ${archivo.nombre}`);
      }
    } catch (e) {
      setEstadoToma((e as Error).message || "No se ha podido preparar el archivo.");
    }
  };
  const entregarToma = async () => {
    if (!preparada) return;
    const r = await guardarArchivo(preparada.blob, preparada.nombre);
    if (r !== "cancelado") {
      setPreparada(null);
      setEstadoToma(r === "compartido" ? "Guardado." : `Descargado: ${preparada.nombre}`);
    }
  };
  const borrarToma = (id: number) => {
    pararEscucha();
    if (preparada?.id === id) setPreparada(null);
    const quedan = tomas.filter((x) => x.id !== id);
    setTomas(quedan);
    if (quedan.length === 0) setVerTomas(false);
  };

  // ---------- Aviso de mezcla: cuando un instrumento tapa a otro ----------
  // Mientras suena la canción se mira la energía de cada pista (tras su fader) en los graves (donde
  // se pisan el bajo y la batería) y en los medios (donde la guitarra, el piano o el resto tapan la
  // voz). Si el choque dura un par de segundos, un consejo en la pantalla; el mismo no se repite enseguida.
  const [consejo, setConsejo] = useState<string | null>(null);
  useEffect(() => {
    if (!conPistas || !tocandoCancion) return;
    const suave: { graves: number; medios: number }[] = [];
    const seguidos = new Map<string, number>();
    const ultimaVez = new Map<string, number>();
    let ticks = 0;
    let borrar: ReturnType<typeof setTimeout> | null = null;
    const banda = (d: Float32Array, hz: number, desde: number, hasta: number) => {
      let p = 0;
      let n = 0;
      for (let k = Math.max(1, Math.floor(desde / hz)); k <= Math.min(d.length - 1, Math.ceil(hasta / hz)); k++) {
        p += Math.pow(10, d[k] / 10);
        n++;
      }
      return n ? 10 * Math.log10(p / n + 1e-12) : -120;
    };
    const id = setInterval(() => {
      const e = ultimasPistas.current?.espectros();
      const nombres = ultimasPistas.current?.conArticulo;
      if (!e || !nombres) return;
      ticks++;
      e.datos.forEach((d, i) => {
        const g = banda(d, e.hz, 40, 160);
        const m = banda(d, e.hz, 800, 3500);
        const a = suave[i];
        suave[i] = a ? { graves: a.graves * 0.7 + g * 0.3, medios: a.medios * 0.7 + m * 0.3 } : { graves: g, medios: m };
      });
      if (ticks < 8 || suave.length < 6) return;
      // Los choques de ahora (con su fuerza)
      const ahora: { clave: string; fuerza: number; texto: string }[] = [];
      const voz = suave[0].medios;
      if (voz > -75) {
        for (const j of [1, 4, 5]) {
          const exceso = suave[j].medios - voz;
          if (exceso > 4) {
            const quien = nombres[j];
            ahora.push({ clave: `voz-${j}`, fuerza: exceso, texto: `${quien[0].toUpperCase()}${quien.slice(1)} tapa la voz: baja ${quien} o sus agudos (HIGH)` });
          }
        }
      }
      const [bajo, bateria] = [suave[2].graves, suave[3].graves];
      if (bajo > -48 && bateria > -48 && Math.abs(bajo - bateria) < 3) {
        ahora.push({ clave: "graves", fuerza: 3, texto: "El bajo y la batería se pisan en los graves: baja los graves (LOW) de uno de los dos" });
      }
      // Que dure 2 s (8 vueltas) y que no se haya dicho en los últimos 25 s
      const claves = new Set(ahora.map((c) => c.clave));
      for (const k of [...seguidos.keys()]) if (!claves.has(k)) seguidos.delete(k);
      const t = performance.now();
      let elegido: (typeof ahora)[number] | null = null;
      for (const c of ahora) {
        const veces = (seguidos.get(c.clave) ?? 0) + 1;
        seguidos.set(c.clave, veces);
        if (veces < 8 || t - (ultimaVez.get(c.clave) ?? -1e9) < 25000) continue;
        if (!elegido || c.fuerza > elegido.fuerza) elegido = c;
      }
      if (!elegido) return;
      ultimaVez.set(elegido.clave, t);
      setConsejo(elegido.texto);
      if (borrar) clearTimeout(borrar);
      borrar = setTimeout(() => setConsejo(null), 6000);
    }, 250);
    return () => {
      clearInterval(id);
      if (borrar) clearTimeout(borrar);
      setConsejo(null);
    };
  }, [conPistas, tocandoCancion]);

  // «?»: qué hace cada mando
  const [verAyuda, setVerAyuda] = useState(false);
  useEffect(() => {
    if (!verAyuda) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      setVerAyuda(false);
    };
    document.addEventListener("keydown", tecla, true);
    return () => document.removeEventListener("keydown", tecla, true);
  }, [verAyuda]);

  // ---------- Ajuste automático de la ganancia (TRIM) de una entrada ----------
  // Tocas fuerte 5 segundos; se mide el pico más alto de lo que entra (antes del TRIM) y se deja el
  // TRIM para que ese pico quede en PICO_OBJETIVO: margen para los efectos y sin saturar.
  const [autoGanancia, setAutoGanancia] = useState<{ canal: 0 | 1; quedan: number; nivel: number; error?: string } | null>(null);
  const relojAuto = useRef<ReturnType<typeof setInterval> | null>(null);
  const pararAuto = () => {
    if (relojAuto.current) clearInterval(relojAuto.current);
    relojAuto.current = null;
  };
  const ajustarGanancia = async (canal: 0 | 1, elegido = false) => {
    pararAuto();
    setAbierta(null);
    if (mesa.estado !== "encendida") {
      if (!elegido && !modo) return setPideModo({ que: "ganancia", canal });
      const r = await mesa.encender(conSolo(ajustes));
      if (r !== "encendida") return setAutoGanancia({ canal, quedan: 0, nivel: 0, error: "No se ha podido abrir la entrada: mira el permiso del micro." });
      setRetraso(mesa.retrasoMs());
    }
    const ganancia = ajustes.canales[canal].ganancia;
    let maximo = 0;
    let pasos = 0;
    const TOTAL = 100; // 5 s, cada 50 ms
    setAutoGanancia({ canal, quedan: 5, nivel: 0 });
    relojAuto.current = setInterval(() => {
      // El medidor está tras el TRIM: se quita lo que suma ahora para tener lo que entra de verdad
      const pico = (mesa.niveles().canales[canal] ?? 0) / Math.pow(10, ganancia / 20);
      maximo = Math.max(maximo, pico);
      pasos++;
      setAutoGanancia({ canal, quedan: Math.ceil((TOTAL - pasos) / 20), nivel: Math.min(1, pico) });
      if (pasos < TOTAL) return;
      pararAuto();
      const entra = 20 * Math.log10(Math.max(maximo, 1e-6));
      if (entra < -60) {
        setAutoGanancia({ canal, quedan: 0, nivel: 0, error: "No llega sonido por esta entrada: mira el cable, el volumen de la guitarra y la entrada elegida en Ajustes." });
        return;
      }
      const nueva = Math.max(-20, Math.min(20, Math.round(PICO_OBJETIVO - entra)));
      cambiarEntrada(canal, (x) => ({ ...x, ganancia: nueva }));
      setAutoGanancia(null);
      leer(`Entrada ${canal + 1}`, `Ganancia ajustada: ${nueva > 0 ? "+" : ""}${nueva} dB`);
    }, 50);
  };
  useEffect(() => () => pararAuto(), []);

  // El tamaño de la consola, para escalar la grabadora y la mesa
  const raiz = useRef<HTMLDivElement>(null);
  const [tam, setTam] = useState<{ w: number; h: number; tactil: boolean } | null>(null);
  useEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const medir = () => setTam({ w: el.clientWidth, h: el.clientHeight, tactil: matchMedia("(pointer: coarse)").matches });
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const W = tam?.w ?? 900;
  const H = tam?.h ?? 640;
  // Pantalla bajita (el móvil tumbado): juntas no se ven; primero las dos en pequeño y, al tocar
  // una, esa a toda pantalla («Volver» regresa a las dos)
  const partido = H < 520;
  // Al poner otra canción desde la placa de la grabadora, la Mesa se vuelve a montar con ella: si
  // estabas viendo la grabadora en grande, sigue en grande
  const [parte, setParte] = useState<"las-dos" | "cinta" | "mesa">(() => (seguirEnLaCinta ? "cinta" : "las-dos"));
  useEffect(() => {
    seguirEnLaCinta = false;
  }, []);
  // En la mesa en grande, tocar un canal lo abre a toda pantalla (CanalGrande)
  const [canalAbierto, setCanalAbierto] = useState<number | null>(null);
  const vista = partido ? (parte === "mesa" && canalAbierto !== null ? "canal" : parte) : "juntas";
  const atras = () => (canalAbierto !== null ? setCanalAbierto(null) : setParte("las-dos"));
  // Juntas: la grabadora sobre la mesa, como una sola pieza (PIEZA), lo más grande que quepa; si así
  // queda demasiado pequeña, más grande y se desliza
  const escala = Math.min(1, Math.max(Math.min(W / ANCHO_MESA, H / PIEZA.alto), tam?.tactil ? 0.5 : 0.42));
  // Por separado: cada una lo más grande que quepa; las dos juntas, en pequeño una encima de otra
  const escalaCintaGrande = Math.min((W - 16) / ANCHO_CINTA, (H - 8) / ALTO_CINTA);
  const escalaMesaGrande = Math.min((W - 8) / ANCHO_MESA, (H - 4) / ALTO_MESA);
  const escalaResumen = Math.min((W * 0.92) / ANCHO_MESA, (H - 34) / PIEZA.alto);

  // Los medidores, sin pasar por React: las entradas si la Mesa está encendida y las pistas siempre
  useEffect(() => {
    if (!encendida && !conPistas) return;
    // Las luces de nivel de la mesa (en la ranura de cada fader)
    const luz = (id: string) => abajo.current?.querySelector<HTMLSpanElement>(`[data-medidor="${id}"]`) ?? null;
    const luces = Array.from({ length: 8 }, (_, i) => luz(String(i)));
    const general = luz("general");
    // Las agujas de los VU de la grabadora, con su inercia (suben deprisa y bajan despacio)
    const agujas = VUS.map((_, i) => cinta.current?.querySelector<SVGGElement>(`[data-vu="${i}"]`) ?? null);
    const angulos = VUS.map(() => VU_REPOSO);
    const aguja = (i: number, pico: number) => {
      const el = agujas[i];
      if (!el) return;
      const objetivo = anguloVu(pico);
      angulos[i] += (objetivo - angulos[i]) * (objetivo > angulos[i] ? 0.35 : 0.1);
      el.setAttribute("transform", `rotate(${angulos[i].toFixed(2)} ${VUS[i].eje[0]} ${VUS[i].eje[1]})`);
    };
    let raf = 0;
    const pintar = (el: HTMLSpanElement | null | undefined, v: number) => {
      if (!el) return;
      el.style.setProperty("--nivel", `${Math.min(1, Math.sqrt(v)) * 100}%`);
      el.classList.toggle("satura", v > 0.97);
    };
    const bucle = () => {
      raf = requestAnimationFrame(bucle);
      const e = encendida ? mesa.niveles() : null;
      const p = ultimasPistas.current?.niveles();
      pintar(luces[0], e?.canales[0] ?? 0);
      pintar(luces[1], e?.canales[1] ?? 0);
      p?.pistas.forEach((v, i) => pintar(luces[2 + i], v));
      pintar(general, Math.max(e?.general ?? 0, p?.general ?? 0));
      aguja(0, e?.canales[0] ?? 0);
      aguja(1, e?.canales[1] ?? 0);
      PISTA_DE_CANAL.forEach((j, k) => aguja(2 + k, p?.pistas[j] ?? 0));
      aguja(8, Math.max(e?.izq ?? 0, p?.izq ?? 0));
      aguja(9, Math.max(e?.der ?? 0, p?.der ?? 0));
    };
    bucle();
    const volver = () => void mesa.reanudar();
    document.addEventListener("visibilitychange", volver);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", volver);
      [...luces, general].forEach((el) =>
        el?.style.setProperty("--nivel", "0%"),
      );
      agujas.forEach((el, i) => el?.setAttribute("transform", `rotate(${VU_REPOSO} ${VUS[i].eje[0]} ${VUS[i].eje[1]})`));
    };
  }, [encendida, conPistas, vista]);

  // Escape: en una parte en grande, vuelve a las dos (antes de que lo oiga el estudio)
  useEffect(() => {
    if (vista !== "cinta" && vista !== "mesa" && vista !== "canal") return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector(".hoja")) return;
      e.stopImmediatePropagation();
      if (vista === "canal") setCanalAbierto(null);
      else setParte("las-dos");
    };
    document.addEventListener("keydown", tecla, true);
    return () => document.removeEventListener("keydown", tecla, true);
  }, [vista]);

  // Escape cierra primero la hoja de efectos (antes de que lo oiga el estudio)
  useEffect(() => {
    if (abierta === null) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      setAbierta(null);
    };
    document.addEventListener("keydown", tecla, true);
    return () => document.removeEventListener("keydown", tecla, true);
  }, [abierta]);

  const estadoTexto = encendida
    ? `${mesa.nombreEntrada || "Entrada"} · ${mesa.entradas === 1 ? "1 entrada" : "2 entradas"}`
    : estado === "abriendo"
      ? "Abriendo la entrada…"
      : estado === "denegada"
        ? "Sin permiso para el micro"
        : estado === "error" || estado === "sin-soporte"
          ? "Sin entrada de audio"
          : conPistas
            ? "Entradas apagadas"
            : "Apagada";

  // Lo que enseña la pantalla de la grabadora: el mando que se mueve o cómo están las entradas
  const aviso = lectura
    ? `${lectura.donde} · ${lectura.texto}`
    : consejo
      ? `Consejo · ${consejo}`
      : cuenta !== null
      ? `● Prepárate: ${cuenta}…`
      : grabando
      ? "● Grabando lo que tocas (REC para parar)"
      : pistas?.transporte.cargando
      ? pistas.transporte.esperaTocar
        ? "Cargando la canción… sonará en cuanto esté lista"
        : "Cargando la canción…"
      : encendida
      ? `${estadoTexto}${!oirse ? (modo === "sin" ? " · sin interfaz: no te oyes al grabar" : " · sin oírte en los cascos") : retraso !== null ? ` · retraso ≈ ${retraso} ms` : ""}`
      : estado !== "apagada"
        ? estadoTexto
        : conPistas
          ? null
          : "Toca INPUT 1 para encender las entradas · REC graba lo que tocas";

  const tituloHoja = abierta
    ? abierta.tipo === "entrada"
      ? `la entrada ${abierta.i + 1}`
      : (pistas?.conArticulo[abierta.i] ?? "")
    : "";

  const entrada = (i: 0 | 1): CanalFoto => {
    const c = ajustes.canales[i];
    return {
      nombre: `Entrada ${i + 1}`,
      titulo: `la entrada ${i + 1}`,
      c,
      ganancia: { min: -20, max: 20 },
      volumen: c.volumen,
      silencio: c.silencio,
      solo: soloEntradas[i],
      nFx: efectosActivos(c),
      onCanal: (f) => cambiarEntrada(i, f),
      onVolumen: (volumen) => cambiarEntrada(i, (x) => ({ ...x, volumen })),
      onSilencio: () => cambiarEntrada(i, (x) => ({ ...x, silencio: !x.silencio })),
      onSolo: () => setSoloEntradas((s) => (i === 0 ? [!s[0], s[1]] : [s[0], !s[1]])),
      onEfectos: () => setAbierta({ tipo: "entrada", i }),
      medidor: i,
    };
  };
  const pista = (j: number): CanalFoto | null => {
    if (!pistas || j >= n) return null;
    return {
      nombre: pistas.nombres[j],
      titulo: pistas.conArticulo[j],
      c: ajustesPistas[j],
      ganancia: { min: -12, max: 12 },
      volumen: pistas.volumen[j] * pistas.volumen[j],
      silencio: pistas.silencio[j],
      solo: pistas.solo[j],
      nFx: efectosActivos(ajustesPistas[j], true),
      onCanal: (f) => cambiarPista(j, f),
      onVolumen: (a) => pistas.onVolumen(j, Math.sqrt(a)),
      onSilencio: () => pistas.onSilencio(j),
      onSolo: () => pistas.onSolo(j),
      onEfectos: () => setAbierta({ tipo: "pista", i: j }),
      medidor: 2 + j,
    };
  };

  const propsCinta = {
    t: pistas?.transporte ?? null,
    aviso,
    contador: grabando && !conPistas ? transcurrido : null,
    rec: { grabando: !!grabando || cuenta !== null, ocupado: estado === "abriendo" || !!pistas?.transporte.cargando, onPulsar: () => void pulsarRec() },
    toma: tomas.length > 0 && !grabando && cuenta === null ? () => setVerTomas(true) : null,
    metronomo: teclaMetro,
    onOrganizar: canciones ? () => setVerCarpetas(true) : undefined,
    alLeer: leer,
    canciones: canciones && {
      ...canciones,
      onElegir: (c: Cancion) => {
        seguirEnLaCinta = parte === "cinta";
        canciones.onElegir(c);
      },
    },
  };
  const propsMesa = {
    canales: [entrada(0), entrada(1), ...PISTA_DE_CANAL.map(pista)],
    sinEntrada2: encendida && mesa.entradas < 2,
    general: ajustes.general,
    onGeneral: (general: number) => cambiarGeneral({ ...ajustes, general }),
    maestros: ajustes.maestros,
    onMaestros: (maestros: AjustesMesa["maestros"]) => cambiarGeneral({ ...ajustes, maestros }),
    conCancion: conPistas,
    entradas: { encendidas: encendida, ocupadas: estado === "abriendo", onPulsar: () => void encender() },
    leer,
  };
  // El canal de al lado (saltando los que no tienen nada, sin canción)
  const vecino = (paso: 1 | -1) => {
    if (canalAbierto === null) return null;
    for (let i = canalAbierto + paso; i >= 0 && i < 8; i += paso) if (propsMesa.canales[i]) return () => setCanalAbierto(i);
    return null;
  };
  const elegir = (p: "cinta" | "mesa") => ({
    role: "button" as const,
    tabIndex: 0,
    onClick: () => setParte(p),
    onKeyDown: (e: React.KeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setParte(p);
      }
    },
  });

  return (
    <div className={`consola-foto vista-${vista}`} ref={raiz}>
      {vista === "juntas" && (
        // La grabadora sobre la mesa, una sola pieza (se desliza si no cabe)
        <div className="cf-abajo">
          <Pieza escala={escala} cinta={cinta} abajo={abajo} propsCinta={propsCinta} propsMesa={propsMesa} />
        </div>
      )}

      {vista === "las-dos" && (
        <div className="cf-resumen">
          <Pieza escala={escalaResumen} cinta={cinta} abajo={abajo} propsCinta={propsCinta} propsMesa={propsMesa} elegir={elegir} />
          <p className="cf-ayuda-partes">Toca la grabadora o la mesa para verla en grande</p>
        </div>
      )}

      {vista === "cinta" && (
        <div className="cf-grande" ref={cinta}>
          <GrabadoraMesa escala={escalaCintaGrande} {...propsCinta} />
        </div>
      )}
      {vista === "mesa" && (
        <div className="cf-grande" ref={abajo}>
          <MesaFoto escala={escalaMesaGrande} {...propsMesa} alTocarCanal={setCanalAbierto} />
        </div>
      )}
      {vista === "canal" && canalAbierto !== null && propsMesa.canales[canalAbierto] && (
        <div className="cf-grande" ref={abajo}>
          <CanalGrande
            key={canalAbierto}
            canal={propsMesa.canales[canalAbierto]!}
            indice={canalAbierto}
            anterior={vecino(-1)}
            siguiente={vecino(1)}
            entradas={canalAbierto < 2 ? propsMesa.entradas : null}
            alAjustarGanancia={canalAbierto < 2 ? () => void ajustarGanancia(canalAbierto as 0 | 1) : null}
            leer={leer}
          />
        </div>
      )}
      {(vista === "cinta" || vista === "mesa" || vista === "canal") && (
        <button
          type="button"
          className="estudio-boton cf-volver"
          onClick={atras}
          aria-label={vista === "canal" ? "Volver a la mesa con todos los canales" : "Volver a ver la grabadora y la mesa"}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
        </button>
      )}
      {/* En la mesa en grande no se ve la pantalla de la grabadora: el mando que mueves, aquí */}
      {(vista === "mesa" || vista === "canal") && (lectura || consejo) && (
        <p className={`cf-lectura${lectura ? "" : " cf-consejo"}`} role="status">
          {lectura ? `${lectura.donde} · ${lectura.texto}` : consejo}
        </p>
      )}

      <div className="cf-girar" aria-live="polite">
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <rect x="15" y="6" width="18" height="32" rx="3" />
          <path d="M8 30a16 16 0 0 0 16 12M40 18A16 16 0 0 0 24 6" />
        </svg>
        <p>Gira el móvil para usar la mesa</p>
      </div>

      <button type="button" className="estudio-boton cf-ayuda" onClick={() => setVerAyuda(true)} aria-label="Qué hace cada mando">
        ?
      </button>
      {verAyuda && (
        <div className="hoja-fondo" onClick={() => setVerAyuda(false)}>
          <div className="hoja" role="dialog" aria-modal="true" aria-label="Qué hace cada mando" onClick={(e) => e.stopPropagation()}>
            <div className="hoja-asa" aria-hidden="true" />
            <header className="hoja-cabecera">
              <h2>Qué hace cada mando</h2>
              <button type="button" className="boton-texto" onClick={() => setVerAyuda(false)}>
                Listo
              </button>
            </header>
            <div className="hoja-cuerpo">
              <AyudaMesa />
            </div>
          </div>
        </div>
      )}

      {autoGanancia && (
        <div className="hoja-fondo" onClick={() => autoGanancia.error && setAutoGanancia(null)}>
          <div className="hoja" role="dialog" aria-modal="true" aria-label="Ajustar la ganancia" onClick={(e) => e.stopPropagation()}>
            <div className="hoja-asa" aria-hidden="true" />
            <header className="hoja-cabecera">
              <h2>Ganancia de la entrada {autoGanancia.canal + 1}</h2>
              <button
                type="button"
                className="boton-texto"
                onClick={() => {
                  pararAuto();
                  setAutoGanancia(null);
                }}
              >
                {autoGanancia.error ? "Listo" : "Cancelar"}
              </button>
            </header>
            <div className="hoja-cuerpo auto-hoja">
              {autoGanancia.error ? (
                <p className="toma-estado">{autoGanancia.error}</p>
              ) : (
                <>
                  <p className="auto-texto">
                    Toca <strong>fuerte</strong>, como en la parte más fuerte de la canción… <span className="auto-quedan">{autoGanancia.quedan}</span>
                  </p>
                  <span className="auto-barra" aria-hidden="true">
                    <span style={{ width: `${Math.sqrt(autoGanancia.nivel) * 100}%` }} />
                  </span>
                  <p className="toma-ayuda">Al acabar, el TRIM se queda donde tu señal entra fuerte pero sin saturar.</p>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {verCarpetas && canciones && (
        <CarpetasMesa canciones={canciones.lista} onCambiadas={canciones.onCambiadas ?? (() => undefined)} onCerrar={() => setVerCarpetas(false)} />
      )}

      {verMetro && (
        <MetronomoMesa
          cancion={metroCancion}
          segundo={pistas?.transporte.segundo}
          tocando={pistas?.transporte.tocando}
          bpm={metroAj.bpm}
          compas={metroAj.compas}
          sonando={sonandoLibre}
          alGolpe={(aviso) => {
            if (metroLibre.current) metroLibre.current.alGolpe = aviso;
          }}
          onBpm={(bpm) => cambiarMetro({ bpm })}
          onCompas={(compas) => cambiarMetro({ compas })}
          onAlternar={alternarMetro}
          cuenta={conCuenta}
          onCuenta={(si) => {
            setCuentaCambiada(si);
            guardarCuentaMesa(si);
          }}
          onCerrar={() => setVerMetro(false)}
        />
      )}

      {pideModo && (
        <div className="hoja-fondo" onClick={() => setPideModo(null)}>
          <div className="hoja" role="dialog" aria-modal="true" aria-label="Cómo vas a grabar" onClick={(e) => e.stopPropagation()}>
            <div className="hoja-asa" aria-hidden="true" />
            <header className="hoja-cabecera">
              <h2>¿Cómo vas a grabar?</h2>
              <button type="button" className="boton-texto" onClick={() => setPideModo(null)}>
                Ahora no
              </button>
            </header>
            <div className="hoja-cuerpo modo-hoja">
              <button type="button" className="modo-opcion" onClick={() => elegirModo("interfaz")}>
                <strong>Con interfaz de audio</strong>
                <span>La guitarra, el bajo o el micro van enchufados a una interfaz. Te oyes mientras tocas o cantas, con tus efectos.</span>
              </button>
              <button type="button" className="modo-opcion" onClick={() => elegirModo("sin")}>
                <strong>Sin interfaz de audio</strong>
                <span>Con el micrófono del móvil o del ordenador. No te oyes mientras grabas: tu voz llegaría tarde y complica ir a tiempo. Al parar, escuchas la toma con la canción.</span>
              </button>
              <p className="toma-ayuda">
                Sin interfaz, ponte cascos para oír la canción: si suena por el altavoz, el micrófono la graba también. Se recuerda en este aparato y se cambia en los efectos de cada entrada.
              </p>
            </div>
          </div>
        </div>
      )}

      {verTomas && tomas.length > 0 && (
        <div className="hoja-fondo" onClick={() => setVerTomas(false)}>
          <div className="hoja" role="dialog" aria-modal="true" aria-label="Tus tomas" onClick={(e) => e.stopPropagation()}>
            <div className="hoja-asa" aria-hidden="true" />
            <header className="hoja-cabecera">
              <h2>Tus tomas</h2>
              <button type="button" className="boton-texto" onClick={() => setVerTomas(false)}>
                Listo
              </button>
            </header>
            <div className="hoja-cuerpo toma-hoja">
              {modo === "sin" && <p className="toma-ayuda toma-oir">Pulsa «Escuchar» para oír cómo ha quedado{pistas ? ", con la canción" : ""}.</p>}
              {preparada && (
                <button type="button" className="boton-principal ancho" onClick={entregarToma}>
                  Guardar o compartir «{preparada.nombre}»
                </button>
              )}
              <ul className="tomas-lista">
                {tomas.map((g, i) => {
                  const ocupado = !!estadoToma?.startsWith("Preparando");
                  return (
                    <li key={g.id} className="toma-fila">
                      <span className="toma-nombre">
                        {g.nombre}
                        {i === 0 && <small> · la última</small>}
                      </span>
                      <span className="toma-dur">{formatoTiempo(duracionToma(g.toma))}</span>
                      <span className="toma-botones">
                        <button type="button" className="boton-secundario toma-boton" onClick={() => escucharToma(g.toma)}>
                          Escuchar
                        </button>
                        {pistas && g.toma.desde !== null && (
                          <button type="button" className="boton-secundario toma-boton" onClick={() => void guardarToma(g, true)} disabled={ocupado}>
                            Con la canción
                          </button>
                        )}
                        <button type="button" className="boton-secundario toma-boton" onClick={() => void guardarToma(g, false)} disabled={ocupado}>
                          {pistas ? "Solo la toma" : "Guardar"}
                        </button>
                        <button type="button" className="boton-texto peligro toma-boton" onClick={() => borrarToma(g.id)} aria-label={`Borrar la ${g.nombre.toLowerCase()}`}>
                          Borrar
                        </button>
                      </span>
                    </li>
                  );
                })}
              </ul>
              {estadoToma && <p className="toma-estado">{estadoToma}</p>}
              <p className="toma-ayuda">
                Se guardan las {MAX_TOMAS} últimas mientras estés en la Mesa. «Con la canción» guarda la canción entera con tu toma; «Solo la toma», solo lo que tocaste. En WAV.
              </p>
            </div>
          </div>
        </div>
      )}

      {abierta !== null && (
        <div className="hoja-fondo" onClick={() => setAbierta(null)}>
          <div
            className="hoja"
            role="dialog"
            aria-modal="true"
            aria-label={`Efectos de ${tituloHoja}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="hoja-asa" aria-hidden="true" />
            <header className="hoja-cabecera">
              <h2>Efectos de {tituloHoja}</h2>
              <button
                type="button"
                className="boton-texto"
                onClick={() => setAbierta(null)}
              >
                Listo
              </button>
            </header>
            <div className="hoja-cuerpo mesa-hoja">
              {abierta.tipo === "entrada" && (
                <section className="escucha-cascos" aria-live="polite">
                  <div className="segmentado modo-grabar" role="group" aria-label="Cómo grabas">
                    <button type="button" aria-pressed={modo === "interfaz"} onClick={() => ponerModo("interfaz")}>
                      Con interfaz de audio
                    </button>
                    <button type="button" aria-pressed={modo === "sin"} onClick={() => ponerModo("sin")}>
                      Sin interfaz
                    </button>
                  </div>
                  <button type="button" className={`interruptor escucha-interruptor${oirse ? " on" : ""}`} role="switch" aria-checked={oirse} onClick={() => cambiarEscucha(!oirse)}>
                    <span className="interruptor-pista" aria-hidden="true">
                      <span className="interruptor-bola" />
                    </span>
                    <span>Oírme en los cascos</span>
                  </button>
                  <p className="toma-ayuda">
                    {oirse
                      ? `${encendida && retraso !== null ? `Te oyes con unos ${retraso} ms de retraso${retraso >= RETRASO_BLUETOOTH ? " (¿cascos Bluetooth? Con cable baja mucho)" : ""}. ` : ""}${
                          retraso === null || retraso >= RETRASO_QUE_SE_NOTA ? "Si te cuesta cantar o tocar a tiempo, apágalo: " : "Si aun así te cuesta ir a tiempo, apágalo: "
                        }te oirás sin retraso con la escucha directa de tu interfaz («direct monitor») o apartando un poco un auricular. REC graba igual.`
                      : modo === "sin"
                        ? "Sin interfaz no te oyes mientras grabas: tu voz llegaría tarde y complica ir a tiempo. La canción suena igual; al parar REC, escuchas la toma con la canción, con tus efectos ya puestos."
                        : "No te oyes en los cascos: óyete con la escucha directa de tu interfaz («direct monitor») o apartando un poco un auricular. La canción suena igual y REC graba lo que tocas, con sus efectos."}
                  </p>
                </section>
              )}
              {abierta.tipo === "entrada" && (
                <button type="button" className="boton-secundario ancho auto-ganancia" onClick={() => void ajustarGanancia(abierta.i as 0 | 1)}>
                  Ajustar la ganancia sola (tocas fuerte 5 segundos)
                </button>
              )}
              {abierta.tipo === "entrada" ? (
                <EfectosMesa
                  canal={ajustes.canales[abierta.i]}
                  onCambio={(f) => cambiarEntrada(abierta.i, f)}
                />
              ) : (
                <EfectosMesa
                  canal={ajustesPistas[abierta.i]}
                  onCambio={(f) => cambiarPista(abierta.i, f)}
                  sinPuerta
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
