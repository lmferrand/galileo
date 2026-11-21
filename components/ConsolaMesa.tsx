"use client";

// La consola de la Mesa: arriba, fija, la grabadora de bobinas (GrabadoraMesa: teclas, contador,
// los VU de cada canal, la onda de la canción para elegir un trozo, los avisos y REC, que enciende
// las entradas); abajo, la mesa de mezclas de la foto (MesaFoto), que se desliza con el dedo si no
// cabe. SELECT abre los efectos del canal en una hoja.
// Canales 1 y 2: las entradas de la interfaz (lib/mesa/mesa, sigue sonando con la consola
// cerrada). Desde Pistas, además, las 6 pistas de la canción (canales 3 a 8): su volumen y su
// silencio son los del reproductor; sus efectos, los de su canal en lib/pistas/reproductor.
// En el móvil de pie pide girarlo: la mesa necesita la pantalla tumbada.

import { startTransition, useEffect, useLayoutEffect, useRef, useState, type ComponentProps, type RefObject } from "react";
import EfectosMesa, { efectosActivos } from "./EfectosMesa";
import MesaFoto, { ANCHO_MESA, BISEL_MESA, ZONA_MESA, type CanalFoto } from "./MesaFoto";
import CanalGrande from "./CanalGrande";
import AyudaMesa from "./AyudaMesa";
import GrabadoraMesa, { ALTO_CINTA, anguloVu, VU_REPOSO, VUS, ZONA_CINTA, ZONA_SELECTOR } from "./GrabadoraMesa";
import type { CancionesPlaca } from "./PlacaCanciones";
import type { Cancion, TomaCancion } from "@/lib/pistas/tipos";
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
import { duracionToma, type Toma } from "@/lib/mesa/toma";
import { archivoDeToma, guardarArchivo } from "@/lib/pistas/exportar";
import { leerFormato, type Formato } from "@/lib/pistas/formato";
import SelectorFormato from "./SelectorFormato";
import { esMovil } from "@/lib/pistas/aparato";
import { formatoTiempo, FRECUENCIA } from "@/lib/pistas/tipos";
import { guardarAjustesMetronomo, leerAjustesMetronomo, Metronomo, type AjustesMetronomo } from "@/lib/metronomo";
import MetronomoMesa, { type MetronomoCancion } from "./MetronomoMesa";
import CarpetasMesa from "./CarpetasMesa";
import BucleMesa from "./BucleMesa";
import { guardarCuentaMesa, leerCuentaMesa, SEGUNDOS_CUENTA } from "@/lib/mesa/cuenta";
import { guardarEscucha, guardarModoGrabar, leerEscucha, leerModoGrabar, RETRASO_BLUETOOTH, RETRASO_QUE_SE_NOTA, type ModoGrabar } from "@/lib/mesa/escucha";
import { useEstadoMesa } from "@/lib/mesa/usarMesa";
import { puedeTumbarse } from "@/lib/mesa/tumbada";
import { AJUSTE_MAXIMO, ajusteRetraso, calibrar, guardarCalibracion, leerCalibracion, type Calibracion } from "@/lib/mesa/calibrar";
import { Posicion } from "@/lib/pistas/posicion";
import { useHidratado } from "@/lib/hidratado";

/** Tus tomas añadidas a la canción: suenan con ella, como una pista más (lib/pistas/tomas) */
export interface TomasDeCancion {
  lista: TomaCancion[];
  /** Cuántas caben */
  tope: number;
  /** Añade a la canción una toma grabada con ella; devuelve el motivo si no se puede */
  anadir: (t: Toma, nombre: string) => Promise<string | null>;
  onVolumen: (id: string, v: number) => void;
  onSilencio: (id: string) => void;
  /** Moverla `ms` milisegundos (positivo: suena después; 0: a donde se grabó) */
  onMover: (id: string, ms: number) => void;
  onNombre: (id: string, nombre: string) => void;
  borrar: (id: string) => Promise<void>;
}

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
  /** Tus tomas añadidas a la canción */
  tomas: TomasDeCancion;
  /** La canción entera (como suena ahora) con la toma encima, en el formato pedido (`aviso`: si el MP3 no se ha podido hacer y va en WAV) */
  mezclaConToma: (t: Toma, formato: Formato, alProgreso?: (hecho: number) => void) => Promise<{ blob: Blob; nombre: string; aviso?: string }>;
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

/** Lo que mide la consola: su zona útil (w × h) y, alrededor, la pantalla entera con sus márgenes */
interface Tam {
  w: number;
  h: number;
  tactil: boolean;
  /** Dónde empieza la zona útil dentro de la pantalla */
  x0: number;
  y0: number;
  /** La pantalla entera */
  ancho: number;
  alto: number;
}

/** «placa»: dentro de la grabadora, el selector de canciones de cerca (con las teclas) */
type Parte = "las-dos" | "cinta" | "mesa" | "placa";
interface Encuadre {
  z: number;
  x: number;
  y: number;
}

/** Cómo se le dice a la capa un encuadre */
const transformDe = (e: Encuadre) => `translate(${e.x}px, ${e.y}px) scale(${e.z})`;

/** La foto del escritorio (public/mesa/escritorio2.webp) */
const ESCRITORIO = { w: 1671, h: 941 };
/** Debajo de la grabadora y la mesa vistas de lejos: el letrero «Toca la grabadora o la mesa…» (pisa solo la madera de abajo de la mesa) */
const HUECO_LETRERO = 14;
/** El margen de la consola (mesa.css): si mide más, es que ahí el aparato tapa algo (la cámara, la barra) */
const MARGEN_CONSOLA = 10;
/** Con la vista en una parte, lo que asoma de la otra (px de pantalla): por esa franja se pasa a ella */
const ASOMA_MESA = 30;
const ASOMA_CINTA = 16;
/** Lo que mide la franja de paso (en píxeles de la mesa): de sobra para todo lo que asome */
const LARGO_PASO = 420;
/** Lo que tarda la vista en llegar y quedarse quieta tras tocar (algo más que su transición, en mesa.css) */
const ASENTAR_MS = 650;
/** Lo que deja de moverse por no estar a la vista (ver «dormida») */
type Fuera = "cinta" | "mesa" | "mesa-y-vu" | null;

/**
 * Pantalla bajita (el móvil tumbado): el escritorio, la grabadora y la mesa van en UNA capa, y lo
 * que cambia al tocar una parte es desde dónde se mira (la cámara): la capa entera se acerca a ella,
 * con el fondo, y todo guarda sus proporciones. Antes la parte tocada se pintaba sola y más grande
 * sobre el mismo fondo: parecía que venía hacia ti en vez de acercarte tú.
 * La capa se pinta al tamaño más grande al que se va a ver la grabadora o la mesa, así acercarse a
 * ellas nunca la amplía (nítida). El selector de canciones sí se amplía: es lo único.
 * De cerca, cada una se ajusta a la pantalla por lo útil (ZONA_CINTA, ZONA_MESA): su marco de madera
 * puede quedar fuera. Y siempre asoma un poco de la otra por un borde: por ahí se pasa a ella.
 * Medidas de la capa en sus propios píxeles; cada encuadre, dónde cae en la pantalla y a qué escala.
 */
function camaraDe({ w, h, x0, y0, ancho, alto }: Tam) {
  // La pantalla entera: el margen de la consola es para el ordenador. Solo se deja libre lo que
  // tape de verdad el aparato.
  const tapado = (v: number) => (v > MARGEN_CONSOLA ? v : 0);
  const u = { x: tapado(x0), y: tapado(y0), w: ancho - tapado(x0) - tapado(ancho - x0 - w), h: alto - tapado(y0) - tapado(alto - y0 - h) };
  const AIRE = 2;
  const lejos = Math.min((u.w * 0.92) / ANCHO_MESA, (u.h - AIRE - HUECO_LETRERO) / PIEZA.alto);
  // (escalas en píxeles de pantalla por píxel de la mesa; la grabadora va a K_CINTA de eso)
  const cintaCerca = Math.min((u.w - 2 * AIRE) / (ZONA_CINTA.w * K_CINTA), (u.h - AIRE - ASOMA_MESA) / PIEZA.yMesa);
  const mesaCerca = Math.min((u.w - 2 * AIRE) / ZONA_MESA.w, (u.h - AIRE - ASOMA_CINTA) / ZONA_MESA.h);
  const placaCerca = Math.min((u.w - 36) / ZONA_SELECTOR.w, (u.h - 28) / ZONA_SELECTOR.h);
  const escala = Math.max(mesaCerca, cintaCerca);
  // Sin sitio (la consola aún sin tamaño, o escondida): no hay nada que encuadrar
  if (!(lejos > 0 && mesaCerca > 0 && cintaCerca > 0)) return null;
  const z0 = lejos / escala;
  // De lejos, la capa ocupa la pantalla justa
  const escena = { w: ancho / z0, h: alto / z0 };
  const pieza = { x: (u.x + (u.w - ANCHO_MESA * lejos) / 2) / z0, y: (u.y + (u.h - HUECO_LETRERO - PIEZA.alto * lejos) / 2) / z0 };
  // El escritorio: su foto entera, llenando la pantalla de lejos (lo que sobra asoma al acercarse)
  const k = Math.max(escena.w / ESCRITORIO.w, escena.h / ESCRITORIO.h);
  const fondo = { x: (escena.w - ESCRITORIO.w * k) / 2, y: (escena.h - ESCRITORIO.h * k) / 2, w: ESCRITORIO.w * k, h: ESCRITORIO.h * k };
  // Una parte (en píxeles de la capa) centrada en la zona útil, sin que asome el borde del escritorio
  const dentro = (v: number, z: number, desde: number, largo: number, pantalla: number) => Math.min(-z * desde, Math.max(pantalla - z * (desde + largo), v));
  const cerca = (z: number, x: number, y: number, ancha: number, alta: number): Encuadre => ({
    z,
    x: dentro(u.x + (u.w - ancha * z) / 2 - x * z, z, fondo.x, fondo.w, ancho),
    y: dentro(u.y + (u.h - alta * z) / 2 - y * z, z, fondo.y, fondo.h, alto),
  });
  // Píxeles de la capa por cada píxel de la foto de la grabadora
  const kc = K_CINTA * escala;
  const xCinta = pieza.x + PIEZA.xCinta * escala;
  const yMesa = pieza.y + PIEZA.yMesa * escala;
  const zCinta = cintaCerca / escala;
  const zMesa = mesaCerca / escala;
  const encuadres: Record<Parte, Encuadre> = {
    "las-dos": { z: z0, x: 0, y: 0 },
    placa: cerca(placaCerca / kc, xCinta + ZONA_SELECTOR.x * kc, pieza.y + ZONA_SELECTOR.y * kc, ZONA_SELECTOR.w * kc, ZONA_SELECTOR.h * kc),
    // La grabadora de arriba abajo y, debajo, lo que asoma de la mesa
    cinta: cerca(zCinta, xCinta + ZONA_CINTA.x * kc, pieza.y, ZONA_CINTA.w * kc, PIEZA.yMesa * escala + ASOMA_MESA / zCinta),
    // La mesa hasta el borde de abajo de su panel y, encima, lo que asoma de la grabadora
    mesa: cerca(zMesa, pieza.x + ZONA_MESA.x * escala, yMesa - ASOMA_CINTA / zMesa, ZONA_MESA.w * escala, ZONA_MESA.h * escala + ASOMA_CINTA / zMesa),
  };
  return { escala, escena, pieza, fondo, encuadres, marco: { left: -x0, top: -y0, width: ancho, height: alto } };
}

function Pieza({
  escala,
  cinta,
  abajo,
  propsCinta,
  propsMesa,
  tocar,
  activa,
  paso,
  cintaQuieta,
}: {
  escala: number;
  cinta: RefObject<HTMLDivElement | null>;
  abajo: RefObject<HTMLDivElement | null>;
  propsCinta: Omit<ComponentProps<typeof GrabadoraMesa>, "escala">;
  propsMesa: Omit<ComponentProps<typeof MesaFoto>, "escala">;
  /** Móvil, de lejos: cada parte entera es un botón (acercarse a ella) */
  tocar?: { cinta?: Record<string, unknown>; mesa?: Record<string, unknown> };
  /** Con la vista acercada a una parte (móvil): los mandos de la otra, que asoma, no se tocan */
  activa?: "cinta" | "mesa";
  /**
   * Móvil, con la grabadora o la mesa de cerca: la franja por la que asoma la otra (se toca, o se
   * desliza el dedo desde ella, y la vista pasa a la otra; el gesto lo recoge la capa entera)
   */
  paso?: Record<string, unknown>;
  /** La grabadora no está a la vista: no se mueve nada en ella */
  cintaQuieta?: boolean;
}) {
  return (
    <div className="cf-pieza" style={{ width: ANCHO_MESA * escala, height: PIEZA.alto * escala }}>
      <div
        className={`cf-pieza-cinta${tocar?.cinta ? " cf-parte" : ""}`}
        style={{ left: PIEZA.xCinta * escala, top: 0 }}
        {...tocar?.cinta}
      >
        <div ref={cinta} inert={!!tocar?.cinta || activa === "mesa"}>
          <GrabadoraMesa escala={escala * K_CINTA} {...propsCinta} quieta={cintaQuieta} />
        </div>
      </div>
      <div
        className={`cf-pieza-mesa${tocar?.mesa ? " cf-parte" : ""}`}
        style={{ left: 0, top: PIEZA.yMesa * escala }}
        {...tocar?.mesa}
      >
        <div ref={abajo} inert={!!tocar?.mesa || activa === "cinta"}>
          <MesaFoto escala={escala} {...propsMesa} />
        </div>
      </div>
      {paso && activa && (
        // Con la grabadora: desde su borde de abajo, la mesa que asoma. Con la mesa: la grabadora que
        // asoma por arriba y el bisel de la mesa (que no tiene mandos).
        <div
          className="cf-paso"
          style={{
            left: 0,
            width: ANCHO_MESA * escala,
            top: (activa === "cinta" ? PIEZA.yMesa - 8 : PIEZA.yMesa - LARGO_PASO) * escala,
            height: (activa === "cinta" ? LARGO_PASO : LARGO_PASO + BISEL_MESA) * escala,
          }}
          {...paso}
        />
      )}
    </div>
  );
}

/** Lo que responde al toque: tocarlo, o tocar pegado a ello, no es «tocar fuera» */
const TOCABLE = 'button, a, input, select, textarea, label, [role="button"], [role="slider"], [role="listbox"], .gm-placa, .gm-pantalla';
/** Lo que hay que apartarse de un mando (px de pantalla) para que el toque cuente como «fuera» */
const AIRE_PX = 14;
/** Lo que se puede mover el dedo (px de pantalla) y seguir siendo un toque */
const TOQUE_PX = 10;
/** Lo que hay que deslizar el dedo, hacia arriba o hacia abajo, para pasar de la grabadora a la mesa (o al revés) */
const DESLIZAR_PX = 32;
const ALREDEDOR = [
  [0, 0],
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [0.7, 0.7],
  [-0.7, 0.7],
  [0.7, -0.7],
  [-0.7, -0.7],
];
/** ¿Se ha tocado fuera de los mandos? (ni encima de uno ni pegado a él: fallar una tecla por poco no aleja la vista) */
const esFuera = (x: number, y: number) => ALREDEDOR.every(([dx, dy]) => !document.elementFromPoint(x + dx * AIRE_PX, y + dy * AIRE_PX)?.closest(TOCABLE));

/** Las primeras veces que te acercas se dice cómo se vuelve (no hay botón: se toca fuera de los mandos) */
const CLAVE_PISTA = "galileo:mesa:tocar-fuera";
const VECES_PISTA = 3;
const PISTA_MS = 3200;
function tocaDecirComoVolver(): boolean {
  try {
    const n = Number(localStorage.getItem(CLAVE_PISTA)) || 0;
    if (n >= VECES_PISTA) return false;
    localStorage.setItem(CLAVE_PISTA, String(n + 1));
    return true;
  } catch {
    return false;
  }
}

/** Se ha puesto otra canción desde la placa con la grabadora (o el selector) en grande: ahí se sigue (ver «parte») */
let seguirEn: Parte | null = null;

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
  tumbada,
}: {
  /** El giro de la pantalla en el móvil (lo pide el estudio al entrar): para el botón «Girar la pantalla» */
  tumbada?: { girar: () => Promise<void>; fallo: boolean };
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
  // La hoja «Bucle» (repetir, compases y entrenador de velocidad)
  const [verBucle, setVerBucle] = useState(false);
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
  // Lo que llevas grabado sin canción (para el contador): fuera de React, como la posición de la
  // canción, para no repintar la consola entera 10 veces por segundo (lib/pistas/posicion)
  const [transcurrido] = useState(() => new Posicion());
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
    seguirEn = null;
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
    // (más el ajuste de la calibración, si este aparato dice de menos o de más: lib/mesa/calibrar)
    const retrasoTotal = g.desde === null ? 0 : Math.max(0, (ultimasPistas.current?.retrasoSalida() ?? 0) + mesa.retrasoEntrada() + ajusteRetraso());
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
    transcurrido.poner(0);
    setGrabando({ desde: t ? t.posicion.leer() : null });
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
      const desde = t.posicion.leer();
      transcurrido.poner(0);
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
    const id = setInterval(() => transcurrido.poner(Math.round((transcurrido.leer() + 0.1) * 10) / 10), 100);
    return () => clearInterval(id);
  }, [grabando, conPistas, transcurrido]);
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
      const formato = leerFormato();
      const preparando = conCancion ? `Preparando la canción con la ${g.nombre.toLowerCase()}…` : `Preparando la ${g.nombre.toLowerCase()}…`;
      const avance = (hecho: number) => setEstadoToma(`${preparando} ${Math.round(hecho * 100)} %`);
      const archivo: { blob: Blob; nombre: string; aviso?: string } =
        conCancion && pistas
          ? await pistas.mezclaConToma(g.toma, formato, avance).then((a) => ({ ...a, nombre: a.nombre.replace(/ \+ mi toma(\.\w+)$/, ` + ${g.nombre.toLowerCase()}$1`) }))
          : await archivoDeToma(g.toma, formato, avance).then((a) => ({ blob: a.blob, nombre: `${g.nombre}.${a.formato}`, aviso: a.aviso }));
      if (esMovil()) {
        // En el móvil el menú de compartir necesita un toque nuevo
        setPreparada({ id: g.id, blob: archivo.blob, nombre: archivo.nombre });
        setEstadoToma(archivo.aviso ?? null);
      } else {
        const r = await guardarArchivo(archivo.blob, archivo.nombre);
        setEstadoToma(r === "cancelado" ? null : `Descargado: ${archivo.nombre}${archivo.aviso ? ` · ${archivo.aviso}` : ""}`);
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
  const anadidas = pistas?.tomas.lista ?? [];
  const borrarToma = (id: number) => {
    pararEscucha();
    if (preparada?.id === id) setPreparada(null);
    const quedan = tomas.filter((x) => x.id !== id);
    setTomas(quedan);
    if (quedan.length === 0 && anadidas.length === 0) setVerTomas(false);
  };
  // ---------- Calibrar el retraso de lo grabado (lib/mesa/calibrar) ----------
  // Una prueba de unos 10 s mide lo que tarda de verdad el aparato; la diferencia con lo que dice el
  // navegador se suma al cuadrar cada toma. También se puede retocar a mano.
  const [verCalibrar, setVerCalibrar] = useState(false);
  const [calCambiada, setCalCambiada] = useState<Calibracion | null | undefined>(undefined);
  const calibracion: Calibracion | null = calCambiada !== undefined ? calCambiada : hidratado ? leerCalibracion() : null;
  const [midiendo, setMidiendo] = useState(false);
  const [avisoCal, setAvisoCal] = useState<string | null>(null);
  const ponerCalibracion = (c: Calibracion | null) => {
    setCalCambiada(c);
    guardarCalibracion(c);
  };
  const abrirCalibrar = () => {
    setAbierta(null);
    setVerTomas(false);
    setAvisoCal(null);
    setVerCalibrar(true);
  };
  const empezarCalibrar = async () => {
    if (midiendo) return;
    if (grabando || cuenta !== null) return setAvisoCal("Para antes la grabación.");
    // Sin haber elegido cómo grabas, primero eso (enciende las entradas)
    if (mesa.estado !== "encendida" && !modo) {
      setVerCalibrar(false);
      return setPideModo({ que: "encender" });
    }
    const t = ultimasPistas.current?.transporte;
    if (t?.tocando) t.onAlternar();
    pararEscucha();
    setAvisoCal(null);
    setMidiendo(true);
    try {
      if (mesa.estado !== "encendida") {
        const r = await mesa.encender(conSolo(ajustes));
        if (r !== "encendida") throw new Error("No se ha podido abrir el micrófono: mira su permiso.");
        setRetraso(mesa.retrasoMs());
      }
      ponerCalibracion(await calibrar());
    } catch (e) {
      setAvisoCal((e as Error).message || "No se ha podido hacer la prueba.");
    } finally {
      // La prueba deja las entradas sin efectos: vuelven los tuyos
      if (mesa.estado === "encendida") mesa.aplicar(conSolo(ajustes));
      setMidiendo(false);
    }
  };
  const retocarCalibracion = (ms: number) => {
    const ajuste = Math.max(-AJUSTE_MAXIMO, Math.min(AJUSTE_MAXIMO, (Math.round((calibracion?.ajuste ?? 0) * 1000) + ms) / 1000));
    ponerCalibracion({ ajuste, medido: calibracion?.medido ?? null, dicho: calibracion?.dicho ?? null, cuando: calibracion?.cuando ?? Date.now() });
  };
  const ajusteMs = Math.round((calibracion?.ajuste ?? 0) * 1000);

  // Las tomas añadidas: cambiarles el nombre y borrarlas en dos toques (un toque suelto no borra)
  const [nombrando, setNombrando] = useState<{ id: string; texto: string } | null>(null);
  const guardarNombreToma = () => {
    if (nombrando && pistas) pistas.tomas.onNombre(nombrando.id, nombrando.texto);
    setNombrando(null);
  };
  const [borrarArmado, setBorrarArmado] = useState<string | null>(null);
  const relojBorrar = useRef<ReturnType<typeof setTimeout> | null>(null);
  const borrarAnadida = (id: string) => {
    if (relojBorrar.current) clearTimeout(relojBorrar.current);
    if (borrarArmado !== id) {
      setBorrarArmado(id);
      relojBorrar.current = setTimeout(() => setBorrarArmado(null), 4000);
      return;
    }
    setBorrarArmado(null);
    void pistas?.tomas.borrar(id);
  };
  useEffect(
    () => () => {
      if (relojBorrar.current) clearTimeout(relojBorrar.current);
    },
    [],
  );
  // Añadir una toma a la canción: se queda con ella y suena como una pista más
  const [anadiendo, setAnadiendo] = useState<number | null>(null);
  const anadirACancion = async (g: TomaGuardada) => {
    if (!pistas || anadiendo !== null) return;
    pararEscucha();
    setAnadiendo(g.id);
    setEstadoToma(`Añadiendo la ${g.nombre.toLowerCase()} a la canción…`);
    // Un nombre que no esté ya («Tu toma 2» si la 1 sigue ahí, aunque se hayan borrado otras)
    const usados = new Set(pistas.tomas.lista.map((t) => t.nombre));
    let numero = 1;
    while (usados.has(`Tu toma ${numero}`)) numero++;
    const motivo = await pistas.tomas.anadir(g.toma, `Tu toma ${numero}`);
    setAnadiendo(null);
    if (motivo) return setEstadoToma(motivo);
    if (preparada?.id === g.id) setPreparada(null);
    setTomas((ts) => ts.filter((x) => x.id !== g.id));
    setEstadoToma("Añadida: ya suena con la canción, también fuera de la Mesa.");
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
  const [tam, setTam] = useState<Tam | null>(null);
  const medido = useRef<Tam | null>(null);
  // La vista (móvil) se acerca y se aleja con suavidad solo al tocar una parte o al volver; si lo que
  // cambia es el tamaño de la pantalla (al girar el móvil), se recoloca de golpe
  const [suave, setSuave] = useState(false);
  // Con la grabadora o la mesa de cerca y la vista ya quieta, la capa entera se deja preparada
  // (will-change, en mesa.css): pasar de una a otra es entonces mover una imagen que ya está pintada.
  // Sin esto, el móvil pintaba la parte que entra sobre la marcha y el paso iba a tirones. Solo se
  // fija con la vista en su tamaño mayor (así queda pintada con todo su detalle) y se suelta al
  // alejarse o al acercarse al selector, que se pintan a otro tamaño.
  const [fija, setFija] = useState(false);
  // Lo que no está a la vista deja de moverse: las agujas, el contador y las bobinas de la grabadora
  // con la mesa de cerca; las luces de la mesa con la grabadora de cerca. Se duerme un momento después
  // de que la vista se haya ido de allí (que no se vea pararse mientras se aleja) y despierta en cuanto
  // se toca para moverla.
  const [dormida, setDormida] = useState<Fuera>(null);
  // Se mide antes de pintar, y hasta entonces no se pinta nada: si no, en el móvil salía un instante
  // la vista del ordenador (un salto) y la grabadora y la mesa se montaban dos veces
  useLayoutEffect(() => {
    const el = raiz.current;
    if (!el) return;
    const medir = () => {
      const marco = (el.offsetParent as HTMLElement | null) ?? el;
      const t: Tam = {
        w: el.clientWidth,
        h: el.clientHeight,
        tactil: matchMedia("(pointer: coarse)").matches,
        x0: el.offsetLeft,
        y0: el.offsetTop,
        ancho: marco.clientWidth,
        alto: marco.clientHeight,
      };
      const a = medido.current;
      if (a && (Object.keys(t) as (keyof Tam)[]).every((k) => a[k] === t[k])) return;
      medido.current = t;
      setSuave(false);
      setFija(false);
      setTam(t);
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const W = tam?.w ?? 900;
  const H = tam?.h ?? 640;
  // Pantalla bajita (el móvil tumbado): juntas no se ven; primero las dos en pequeño y, al tocar
  // una, la vista se acerca a ella (tocar fuera de los mandos regresa a las dos)
  const partido = H < 520;
  // Al poner otra canción desde la placa de la grabadora, la Mesa se vuelve a montar con ella: si
  // estabas viendo la grabadora en grande (o su selector de cerca), sigues ahí
  const [parte, setParte] = useState<Parte>(() => seguirEn ?? "las-dos");
  // Las primeras veces que te acercas: cómo se vuelve (un letrero que se va solo). 0: no se ve;
  // cada vez que toca enseñarlo, un número nuevo (así su reloj vuelve a empezar).
  const [verComoVolver, setVerComoVolver] = useState(0);
  const decirComoVolver = (hace: boolean) => {
    const si = hace && tocaDecirComoVolver();
    setVerComoVolver((n) => (si ? n + 1 : 0));
  };
  useEffect(() => {
    if (!verComoVolver) return;
    const t = setTimeout(() => setVerComoVolver(0), PISTA_MS);
    return () => clearTimeout(t);
  }, [verComoVolver]);
  const escena = useRef<HTMLDivElement>(null);
  const irA = (p: Parte) => {
    // La vista empieza a moverse en el mismo toque: a la capa se le pone ya su encuadre. Lo demás
    // (qué parte se puede tocar, qué se duerme, los letreros) es repintar media Mesa, y en un móvil
    // eso tardaba lo bastante para que el movimiento arrancara tarde: se deja para después, a ratos,
    // con la vista ya de camino (startTransition).
    const destino = camara?.encuadres[p];
    const capa = escena.current;
    if (capa && destino) {
      capa.classList.add("suave");
      capa.style.transform = transformDe(destino);
    }
    startTransition(() => {
      setSuave(true);
      setParte(p);
      setDormida(null);
      if (p !== "cinta" && p !== "mesa") setFija(false);
      decirComoVolver(p !== "las-dos");
    });
  };
  useEffect(() => {
    seguirEn = null;
  }, []);
  // En la mesa en grande, tocar un canal lo abre a toda pantalla (CanalGrande)
  const [canalAbierto, setCanalAbierto] = useState<number | null>(null);
  const vista = partido ? (parte === "mesa" && canalAbierto !== null ? "canal" : parte) : "juntas";
  const abrirCanal = (i: number) => {
    setCanalAbierto(i);
    decirComoVolver(true);
  };
  // Volver, paso a paso: del canal a la mesa, del selector a la grabadora entera y de ahí a las dos
  const atras = () => {
    if (canalAbierto === null) return irA(parte === "placa" ? "cinta" : "las-dos");
    setCanalAbierto(null);
    decirComoVolver(false);
  };
  // Con la grabadora o la mesa de cerca, la otra asoma por un borde (cf-paso, en Pieza)
  const otra = vista === "cinta" ? "mesa" : vista === "mesa" ? "cinta" : null;
  // Los gestos de la vista acercada, sin botones:
  //  - tocar en cualquier sitio que no sea un mando: volver un paso (como alejarse). Tiene que ser un
  //    toque (no un arrastre que acaba ahí) y caer fuera de los mandos;
  //  - pasar de la grabadora a la mesa (o al revés): tocar la franja por la que asoma, o deslizar el
  //    dedo desde ella, o deslizarlo hacia arriba o hacia abajo en cualquier sitio que no sea un mando.
  //    Basta el gesto: la vista va sola, no hay que llevarla con el dedo.
  // Un toque se atiende en el «clic» (lo último que llega) y un deslizamiento al levantar el dedo.
  // Tras un deslizamiento, el clic que pueda llegar detrás se descarta: con la vista ya cambiada
  // caería sobre lo que hay ahora bajo el dedo (un canal de la mesa, que se abriría solo).
  const bajo = useRef<{ x: number; y: number; paso: boolean } | null>(null);
  const deslizado = useRef(-1e9);
  const gestos = {
    onClickCapture: (e: React.MouseEvent) => {
      if (e.timeStamp - deslizado.current > 500) return;
      e.stopPropagation();
      e.preventDefault();
    },
    onPointerDown: (e: React.PointerEvent) => {
      const el = e.target as Element;
      // (de lejos, las partes enteras ya tienen su toque)
      bajo.current = !e.isPrimary || el.closest(".cf-parte") ? null : { x: e.clientX, y: e.clientY, paso: !!el.closest(".cf-paso") };
    },
    onPointerUp: (e: React.PointerEvent) => {
      const b = bajo.current;
      if (!b || !e.isPrimary || !otra) return;
      const dx = Math.abs(e.clientX - b.x);
      const dy = Math.abs(e.clientY - b.y);
      // Desde la franja vale deslizar hacia donde sea; fuera de ella, hacia arriba o hacia abajo
      const desliza = b.paso ? Math.hypot(dx, dy) > TOQUE_PX : dy >= DESLIZAR_PX && dy > 1.5 * dx && esFuera(b.x, b.y);
      if (!desliza) return;
      bajo.current = null;
      deslizado.current = e.timeStamp;
      irA(otra);
    },
    onClick: (e: React.MouseEvent) => {
      const b = bajo.current;
      bajo.current = null;
      if (vista === "juntas" || vista === "las-dos" || !b) return;
      // Un toque en la franja por la que asoma la otra parte
      if (b.paso) {
        if (otra) irA(otra);
        return;
      }
      if (Math.hypot(e.clientX - b.x, e.clientY - b.y) > TOQUE_PX || !esFuera(b.x, b.y)) return;
      atras();
    },
  };
  // El canal en grande va encima de la mesa (que sigue debajo, sin desmontarse): su luz de nivel
  const enCanal = useRef<HTMLDivElement>(null);
  // Juntas: la grabadora sobre la mesa, como una sola pieza (PIEZA), lo más grande que quepa; si así
  // queda demasiado pequeña, más grande y se desliza
  const escala = Math.min(1, Math.max(Math.min(W / ANCHO_MESA, H / PIEZA.alto), tam?.tactil ? 0.5 : 0.42));
  // En el móvil tumbado: las dos en pequeño y, al tocar una, la vista se acerca a ella (camaraDe)
  const camara = partido && tam ? camaraDe(tam) : null;
  const encuadre = camara?.encuadres[parte];

  // Con la vista ya quieta: qué se duerme y si la capa se deja preparada (ver «dormida» y «fija»)
  const fuera: Fuera = !partido ? null : parte === "mesa" ? "cinta" : parte === "cinta" ? "mesa" : parte === "placa" ? "mesa-y-vu" : null;
  const zVista = encuadre?.z ?? 0;
  const zMayor = camara ? Math.max(camara.encuadres.cinta.z, camara.encuadres.mesa.z) : 0;
  useEffect(() => {
    const t = setTimeout(() => {
      setDormida(fuera);
      if (fuera === "cinta" || fuera === "mesa") {
        if (zVista >= zMayor - 1e-6) setFija(true);
      } else setFija(false);
    }, ASENTAR_MS);
    return () => clearTimeout(t);
  }, [fuera, zVista, zMayor]);
  const medida = tam !== null;
  const sinLuces = dormida === "mesa" || dormida === "mesa-y-vu";
  const sinAgujas = dormida === "cinta" || dormida === "mesa-y-vu";

  // Los medidores, sin pasar por React: las entradas si la Mesa está encendida y las pistas siempre.
  // Van a unos 30 por segundo (de sobra para el ojo) y solo se escribe lo que cambia: pintarlos en
  // cada fotograma era, con la canción sonando, lo que más frenaba la Mesa en un móvil modesto (la
  // altura de 9 luces y 10 agujas, 60 o 120 veces por segundo).
  useEffect(() => {
    // (hasta que la consola se ha medido no hay grabadora ni mesa pintadas: no hay a quién mover)
    if (!medida || (!encendida && !conPistas)) return;
    // Las luces de nivel de la mesa (en la ranura de cada fader); ninguna si la mesa no está a la vista
    const luz = (id: string) => (sinLuces ? null : ((vista === "canal" ? enCanal : abajo).current?.querySelector<HTMLSpanElement>(`[data-medidor="${id}"]`) ?? null));
    const luces = Array.from({ length: 8 }, (_, i) => luz(String(i)));
    const general = luz("general");
    // Las agujas de los VU de la grabadora, con su inercia (suben deprisa y bajan despacio); ninguna
    // si no están a la vista
    const agujas = VUS.map((_, i) => (sinAgujas ? null : (cinta.current?.querySelector<SVGGElement>(`[data-vu="${i}"]`) ?? null)));
    const hayQuePintar = !sinLuces || !sinAgujas;
    const angulos = VUS.map(() => VU_REPOSO);
    const escritos = VUS.map(() => "");
    // `pasos`: los fotogramas de 1/60 s que han pasado (la inercia no depende de la pantalla)
    const aguja = (i: number, pico: number, pasos: number) => {
      const el = agujas[i];
      if (!el) return;
      const objetivo = anguloVu(pico);
      angulos[i] += (objetivo - angulos[i]) * (1 - Math.pow(objetivo > angulos[i] ? 0.65 : 0.9, pasos));
      const giro = angulos[i].toFixed(1);
      if (giro === escritos[i]) return;
      escritos[i] = giro;
      el.setAttribute("transform", `rotate(${giro} ${VUS[i].eje[0]} ${VUS[i].eje[1]})`);
    };
    let raf = 0;
    const pintados = new Map<HTMLSpanElement, number>();
    const pintar = (el: HTMLSpanElement | null | undefined, v: number) => {
      if (!el) return;
      // En tantos por ciento enteros, y con la saturación en el bit de arriba
      const nivel = Math.round(Math.min(1, Math.sqrt(v)) * 100) + (v > 0.97 ? 1000 : 0);
      if (pintados.get(el) === nivel) return;
      pintados.set(el, nivel);
      el.style.setProperty("--nivel", `${nivel % 1000}%`);
      el.classList.toggle("satura", nivel >= 1000);
    };
    let antes = 0;
    const bucle = (ahora: number) => {
      raf = requestAnimationFrame(bucle);
      if (antes && ahora - antes < 30) return;
      const pasos = antes ? Math.min(8, (ahora - antes) / (1000 / 60)) : 1;
      antes = ahora;
      const e = encendida ? mesa.niveles() : null;
      const p = ultimasPistas.current?.niveles();
      pintar(luces[0], e?.canales[0] ?? 0);
      pintar(luces[1], e?.canales[1] ?? 0);
      p?.pistas.forEach((v, i) => pintar(luces[2 + i], v));
      pintar(general, Math.max(e?.general ?? 0, p?.general ?? 0));
      aguja(0, e?.canales[0] ?? 0, pasos);
      aguja(1, e?.canales[1] ?? 0, pasos);
      PISTA_DE_CANAL.forEach((j, k) => aguja(2 + k, p?.pistas[j] ?? 0, pasos));
      aguja(8, Math.max(e?.izq ?? 0, p?.izq ?? 0), pasos);
      aguja(9, Math.max(e?.der ?? 0, p?.der ?? 0), pasos);
    };
    if (hayQuePintar) raf = requestAnimationFrame(bucle);
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
    // «medida»: en el ordenador la vista es la misma antes y después de medir, y sin esto las agujas
    // y las luces se buscaban cuando aún no estaban pintadas y ya no se movían (fallo desde la v109,
    // al entrar en la Mesa con la canción ya puesta)
  }, [encendida, conPistas, vista, sinLuces, sinAgujas, medida]);

  // Escape: en una parte en grande, vuelve a las dos (antes de que lo oiga el estudio)
  useEffect(() => {
    if (vista === "juntas" || vista === "las-dos") return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || document.querySelector(".hoja")) return;
      e.stopImmediatePropagation();
      if (vista === "canal") setCanalAbierto(null);
      else {
        setSuave(true);
        setParte(vista === "placa" ? "cinta" : "las-dos");
        setDormida(null);
        if (vista !== "placa") setFija(false);
      }
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
      : pistas?.transporte.error
      ? `No se ha podido abrir la canción · ${pistas.transporte.error}`
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
    toma: (tomas.length > 0 || anadidas.length > 0) && !grabando && cuenta === null ? () => setVerTomas(true) : null,
    metronomo: teclaMetro,
    onBucle: pistas ? () => setVerBucle(true) : undefined,
    onOrganizar: canciones ? () => setVerCarpetas(true) : undefined,
    alLeer: leer,
    canciones: canciones && {
      ...canciones,
      onElegir: (c: Cancion) => {
        seguirEn = parte === "cinta" || parte === "placa" ? parte : null;
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
  const alTeclear = (e: React.KeyboardEvent, p: "cinta" | "mesa") => {
    if (e.key !== "Enter" && e.key !== " ") return;
    e.preventDefault();
    irA(p);
  };
  // De lejos, las dos se tocan para acercarse: cada parte entera es un botón que lleva la vista a ella
  const tocar =
    parte === "las-dos"
      ? {
          cinta: {
            role: "button" as const,
            tabIndex: 0,
            "aria-label": "Ver la grabadora en grande",
            onClick: () => irA("cinta"),
            onKeyDown: (e: React.KeyboardEvent) => alTeclear(e, "cinta"),
          },
          mesa: {
            role: "button" as const,
            tabIndex: 0,
            "aria-label": "Ver la mesa de mezclas en grande",
            onClick: () => irA("mesa"),
            onKeyDown: (e: React.KeyboardEvent) => alTeclear(e, "mesa"),
          },
        }
      : undefined;
  // De cerca, la franja por la que asoma la otra. El toque y el deslizar los recoge la capa (gestos);
  // aquí, lo que hace de ella un botón para el teclado.
  const paso =
    otra && vista !== "canal"
      ? {
          role: "button" as const,
          tabIndex: 0,
          "aria-label": otra === "mesa" ? "Bajar a la mesa de mezclas" : "Subir a la grabadora",
          onKeyDown: (e: React.KeyboardEvent) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              irA(otra);
            }
          },
        }
      : undefined;

  return (
    <div className={`consola-foto vista-${vista}`} ref={raiz}>
      {tam && vista === "juntas" && (
        // La grabadora sobre la mesa, una sola pieza (se desliza si no cabe)
        <div className="cf-abajo">
          <Pieza escala={escala} cinta={cinta} abajo={abajo} propsCinta={propsCinta} propsMesa={propsMesa} />
        </div>
      )}

      {camara && encuadre && (
        // El móvil tumbado: el escritorio, la grabadora y la mesa en una sola capa (camaraDe). No se
        // desmonta al acercarse ni al abrir un canal: solo cambia desde dónde se mira
        <div className="cf-camara" style={camara.marco} inert={vista === "canal"} {...gestos}>
          <div
            ref={escena}
            className={`cf-escena${suave ? " suave" : ""}${fija ? " fija" : ""}`}
            style={{ width: camara.escena.w, height: camara.escena.h, transform: transformDe(encuadre) }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              className="cf-escritorio"
              src="/mesa/escritorio2.webp"
              alt=""
              draggable={false}
              style={{ left: camara.fondo.x, top: camara.fondo.y, width: camara.fondo.w, height: camara.fondo.h }}
            />
            <div className="cf-en-escena" style={{ left: camara.pieza.x, top: camara.pieza.y }}>
              <Pieza
                escala={camara.escala}
                cinta={cinta}
                abajo={abajo}
                propsCinta={parte === "cinta" ? { ...propsCinta, alAcercarPlaca: () => irA("placa") } : propsCinta}
                propsMesa={parte === "mesa" ? { ...propsMesa, alTocarCanal: abrirCanal } : propsMesa}
                tocar={tocar}
                paso={paso}
                cintaQuieta={dormida === "cinta"}
                activa={parte === "las-dos" ? undefined : parte === "mesa" ? "mesa" : "cinta"}
              />
            </div>
          </div>
        </div>
      )}
      {camara && (
        <p className="cf-ayuda-partes" aria-hidden={vista !== "las-dos"}>
          Toca la grabadora o la mesa para acercarte
        </p>
      )}

      {vista === "canal" && canalAbierto !== null && propsMesa.canales[canalAbierto] && (
        <div className="cf-grande" ref={enCanal} {...gestos}>
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
      {camara && (
        // Dónde asoma la otra parte: arriba con la mesa de cerca, abajo con la grabadora
        <>
          <span className="cf-marca arriba" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M6 15l6-6 6 6" />
            </svg>
          </span>
          <span className="cf-marca abajo" aria-hidden="true">
            <svg viewBox="0 0 24 24">
              <path d="M6 9l6 6 6-6" />
            </svg>
          </span>
        </>
      )}
      {vista === "canal" && (
        // Con un canal en grande, su panel llena la pantalla y no se ve por dónde volver: una flecha
        // (con cola, para que no se confunda con las de «canal anterior» y «siguiente»). Tocar fuera
        // de los mandos sigue valiendo.
        <button type="button" className="estudio-boton cf-volver" onClick={atras} aria-label="Volver a la mesa con todos los canales">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M19 12H6M11 6l-6 6 6 6" />
          </svg>
        </button>
      )}
      {camara && (
        <p className={`cf-ayuda-volver${verComoVolver && vista !== "las-dos" ? " visible" : ""}`} aria-hidden={!verComoVolver}>
          Toca fuera de los mandos para volver
        </p>
      )}
      {/* La canción no se ha podido abrir y la pantalla de la grabadora no está a la vista: se dice aquí */}
      {pistas?.transporte.error && (vista === "mesa" || vista === "canal" || vista === "placa") && !lectura && (
        <p className="cf-lectura cf-consejo" role="alert">
          No se ha podido abrir la canción · {pistas.transporte.error}
        </p>
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
        {hidratado && tumbada && puedeTumbarse() && (
          <button type="button" className="boton-principal cf-girar-boton" onClick={() => void tumbada.girar()}>
            Girar la pantalla
          </button>
        )}
        {tumbada?.fallo && <p className="cf-girar-nota">No se ha podido girar desde aquí. Activa el giro automático del móvil y gíralo.</p>}
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

      {verBucle && pistas && <BucleMesa t={pistas.transporte} onCerrar={() => setVerBucle(false)} />}

      {verMetro && (
        <MetronomoMesa
          cancion={metroCancion}
          posicion={pistas?.transporte.posicion ?? null}
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

      {verCalibrar && (
        <div className="hoja-fondo" onClick={() => !midiendo && setVerCalibrar(false)}>
          <div className="hoja" role="dialog" aria-modal="true" aria-label="Calibrar el retraso" onClick={(e) => e.stopPropagation()}>
            <div className="hoja-asa" aria-hidden="true" />
            <header className="hoja-cabecera">
              <h2>Calibrar el retraso</h2>
              <button type="button" className="boton-texto" onClick={() => setVerCalibrar(false)} disabled={midiendo}>
                Listo
              </button>
            </header>
            <div className="hoja-cuerpo cal-hoja">
              <p className="toma-ayuda">
                Para que lo que grabas caiga a tiempo con la canción, mido lo que tarda de verdad este aparato en sonar y en oírte. Suenan unos clics (unos 10 segundos) y el micrófono tiene que oírlos.
              </p>
              <ol className="cal-pasos">
                <li>Sube el volumen.</li>
                <li>Con cascos, acerca un auricular al micrófono. Con altavoz, déjalo como está.</li>
                <li>No hagas ruido mientras suenan.</li>
              </ol>
              <button type="button" className="boton-principal ancho" onClick={() => void empezarCalibrar()} disabled={midiendo}>
                {midiendo ? "Escuchando los clics…" : calibracion?.medido != null ? "Calibrar otra vez" : "Calibrar ahora"}
              </button>
              {avisoCal && (
                <p className="toma-estado" role="alert">
                  {avisoCal}
                </p>
              )}
              <section className="cal-resultado" aria-live="polite">
                {calibracion ? (
                  <p className="mm-estado">
                    <strong className="mm-bpm">
                      {ajusteMs > 0 ? "+" : ""}
                      {ajusteMs}
                    </strong>
                    <span>
                      milisegundos de ajuste.{" "}
                      {calibracion.medido !== null && calibracion.dicho !== null
                        ? `En la prueba, este aparato tardó ${Math.round(calibracion.medido * 1000)} ms; el navegador decía ${Math.round(calibracion.dicho * 1000)}.`
                        : "Puesto a mano."}
                      <br />
                      {ajusteMs === 0 ? "Lo que grabas ya cae en su sitio." : `Lo que grabes desde ahora se coloca ${Math.abs(ajusteMs)} ms ${ajusteMs > 0 ? "antes" : "después"}.`}
                    </span>
                  </p>
                ) : (
                  <p className="toma-ayuda">Sin calibrar: se usa el retraso que dice el navegador.</p>
                )}
                <div className="cal-mano">
                  <button type="button" className="boton-redondo" onClick={() => retocarCalibracion(-5)} disabled={midiendo} aria-label="5 milisegundos menos de ajuste">
                    −
                  </button>
                  <span>
                    Ajuste a mano
                    <br />
                    <small>de 5 en 5 ms</small>
                  </span>
                  <button type="button" className="boton-redondo" onClick={() => retocarCalibracion(5)} disabled={midiendo} aria-label="5 milisegundos más de ajuste">
                    +
                  </button>
                  {calibracion && (
                    <button type="button" className="boton-texto peligro" onClick={() => ponerCalibracion(null)} disabled={midiendo}>
                      Quitar el ajuste
                    </button>
                  )}
                </div>
              </section>
              <p className="toma-ayuda">
                A mano: si tu toma suena tarde respecto a la canción, sube el ajuste; si suena antes de tiempo, bájalo. Vale para lo que grabes a partir de ahora. Si cambias de cascos o de altavoz (sobre todo a Bluetooth), calibra otra vez.
              </p>
            </div>
          </div>
        </div>
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

      {verTomas && (tomas.length > 0 || anadidas.length > 0) && (
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
              {modo === "sin" && tomas.length > 0 && <p className="toma-ayuda toma-oir">Pulsa «Escuchar» para oír cómo ha quedado{pistas ? ", con la canción" : ""}.</p>}
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
                          <button type="button" className="boton-principal toma-boton" onClick={() => void anadirACancion(g)} disabled={ocupado || anadiendo !== null}>
                            Añadir a la canción
                          </button>
                        )}
                        {pistas && g.toma.desde !== null && (
                          <button type="button" className="boton-secundario toma-boton" onClick={() => void guardarToma(g, true)} disabled={ocupado}>
                            Exportar con la canción
                          </button>
                        )}
                        <button type="button" className="boton-secundario toma-boton" onClick={() => void guardarToma(g, false)} disabled={ocupado}>
                          {pistas ? "Exportar sola" : "Guardar"}
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
              {tomas.length > 0 && (
                <p className="toma-ayuda">
                  {pistas
                    ? `${tomas.length === 1 ? "Esta se guarda" : "Estas se guardan"} solo mientras estés en la Mesa (las ${MAX_TOMAS} últimas). «Añadir a la canción» la deja con la canción para siempre, como una pista más. «Exportar» saca un archivo: con la canción entera o la toma sola.`
                    : `Se guardan las ${MAX_TOMAS} últimas mientras estés en la Mesa. «Guardar» saca la toma en un archivo.`}
                </p>
              )}
              {tomas.length > 0 && <SelectorFormato />}
              {pistas && tomas.length > 0 && (
                <button type="button" className="boton-texto toma-calibrar" onClick={abrirCalibrar}>
                  ¿No cae a tiempo con la canción? Calibrar el retraso
                </button>
              )}
              {pistas && anadidas.length > 0 && (
                <section className="tomas-anadidas" aria-label="Tomas añadidas a la canción">
                  <h3>Añadidas a la canción</h3>
                  <ul className="tomas-lista">
                    {anadidas.map((t) => (
                      <li key={t.id} className={`toma-fila toma-anadida${t.silencio ? " callada" : ""}`}>
                        {nombrando?.id === t.id ? (
                          <input
                            className="toma-nombre-campo"
                            value={nombrando.texto}
                            maxLength={40}
                            autoFocus
                            aria-label="Nombre de la toma"
                            onChange={(e) => setNombrando({ id: t.id, texto: e.target.value })}
                            onBlur={guardarNombreToma}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") guardarNombreToma();
                              else if (e.key === "Escape") setNombrando(null);
                            }}
                          />
                        ) : (
                          <button type="button" className="toma-nombre toma-nombre-boton" onClick={() => setNombrando({ id: t.id, texto: t.nombre })} aria-label={`Cambiar el nombre de ${t.nombre}`}>
                            {t.nombre}
                            <svg viewBox="0 0 24 24" aria-hidden="true">
                              <path d="M4 20h4l10-10-4-4L4 16v4zM13 7l4 4" />
                            </svg>
                          </button>
                        )}
                        <span className="toma-dur">
                          desde {formatoTiempo(t.desde / FRECUENCIA)} · dura {formatoTiempo(t.frames / FRECUENCIA)}
                        </span>
                        <span className="toma-botones">
                          <button type="button" className="boton-secundario toma-boton" aria-pressed={t.silencio} onClick={() => pistas.tomas.onSilencio(t.id)}>
                            {t.silencio ? "Callada" : "Suena"}
                          </button>
                          <button
                            type="button"
                            className={`boton-texto peligro toma-boton${borrarArmado === t.id ? " armado" : ""}`}
                            onClick={() => borrarAnadida(t.id)}
                            aria-label={borrarArmado === t.id ? `Sí, borrar ${t.nombre} de la canción` : `Borrar ${t.nombre} de la canción`}
                          >
                            {borrarArmado === t.id ? "¿Seguro? Borrar" : "Borrar"}
                          </button>
                        </span>
                        <label className="toma-volumen">
                          <span>Volumen</span>
                          <input
                            type="range"
                            min={0}
                            max={1.5}
                            step={0.01}
                            value={Math.min(1.5, t.volumen)}
                            onChange={(e) => pistas.tomas.onVolumen(t.id, Number(e.target.value))}
                            aria-label={`Volumen de ${t.nombre}`}
                          />
                          <output>{Math.round(t.volumen * 100)} %</output>
                        </label>
                        <div className="toma-mover" role="group" aria-label={`Mover ${t.nombre}`}>
                          <span>A tiempo</span>
                          <button type="button" className="boton-secundario toma-boton" onClick={() => pistas.tomas.onMover(t.id, -10)} disabled={(t.movida ?? 0) <= -500} aria-label="Que suene 10 milisegundos antes">
                            ◀ Antes
                          </button>
                          <output>{t.movida ? `${t.movida > 0 ? "+" : "−"}${Math.abs(t.movida)} ms` : "en su sitio"}</output>
                          <button type="button" className="boton-secundario toma-boton" onClick={() => pistas.tomas.onMover(t.id, 10)} disabled={(t.movida ?? 0) >= 500} aria-label="Que suene 10 milisegundos después">
                            Después ▶
                          </button>
                          {!!t.movida && (
                            <button type="button" className="boton-texto toma-boton" onClick={() => pistas.tomas.onMover(t.id, 0)}>
                              Como estaba
                            </button>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                  <p className="toma-ayuda">
                    Suenan con la canción desde su sitio (también en Pistas y al exportar la mezcla). Caben {pistas.tomas.tope}. Llevan los efectos con que las grabaste. Si una se oye tarde, «◀ Antes»; si se adelanta, «Después ▶» (de 10 en 10 ms, con la canción sonando). Toca su nombre para cambiarlo.
                  </p>
                </section>
              )}
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
                  <button type="button" className="boton-secundario ancho" onClick={abrirCalibrar}>
                    {calibracion ? `Retraso de lo grabado: ${ajusteMs > 0 ? "+" : ""}${ajusteMs} ms de ajuste` : "Calibrar el retraso de lo grabado"}
                  </button>
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
