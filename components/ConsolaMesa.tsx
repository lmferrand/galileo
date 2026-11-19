"use client";

// La consola de la Mesa: arriba, fija, la grabadora de bobinas (GrabadoraMesa: teclas, contador,
// los VU de cada canal, la onda de la canción para elegir un trozo, los avisos y REC, que enciende
// las entradas); abajo, la mesa de mezclas de la foto (MesaFoto), que se desliza con el dedo si no
// cabe. SELECT abre los efectos del canal en una hoja.
// Canales 1 y 2: las entradas de la interfaz (lib/mesa/mesa, sigue sonando con la consola
// cerrada). Desde Pistas, además, las 6 pistas de la canción (canales 3 a 8): su volumen y su
// silencio son los del reproductor; sus efectos, los de su canal en lib/pistas/reproductor.
// En el móvil de pie pide girarlo: la mesa necesita la pantalla tumbada.

import { useEffect, useRef, useState } from "react";
import EfectosMesa, { efectosActivos } from "./EfectosMesa";
import MesaFoto, { ALTO_MESA, ANCHO_MESA, type CanalFoto } from "./MesaFoto";
import CanalGrande from "./CanalGrande";
import GrabadoraMesa, { ALTO_CINTA, ANCHO_CINTA, anguloVu, VU_REPOSO, VUS } from "./GrabadoraMesa";
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
import { useEstadoMesa } from "@/lib/mesa/usarMesa";
import { useHidratado } from "@/lib/hidratado";

/** Las pistas de la canción que suena en Pistas, para tenerlas como canales 3 a 8. */
export interface PistasMesa {
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
}

type Abierta = { tipo: "entrada" | "pista"; i: number };

const LECTURA_MS = 1400;
/** Canales 3 a 8 de la foto (VOCALS, DRUMS, BASS, GUITAR, PIANO, OTHER) → su pista (orden de PISTAS) */
const PISTA_DE_CANAL = [0, 3, 2, 1, 4, 5];

export default function ConsolaMesa({ pistas }: { pistas?: PistasMesa }) {
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

  const encender = async () => {
    if (mesa.grabando) await parar();
    if (encendida) return mesa.apagar();
    const r = await mesa.encender(conSolo(ajustes));
    if (r === "encendida") setRetraso(mesa.retrasoMs());
  };

  // ---------- REC: grabar lo que tocas ----------
  // La toma empieza donde esté la canción (y la pone a sonar); se para con REC, con la pausa o
  // cuando la canción acaba. Sin canción, graba lo que toques hasta volver a pulsar REC.
  const [grabando, setGrabando] = useState<{ desde: number | null } | null>(null);
  const [transcurrido, setTranscurrido] = useState(0);
  const [toma, setToma] = useState<Toma | null>(null);
  const [verToma, setVerToma] = useState(false);
  const [preparada, setPreparada] = useState<{ blob: Blob; nombre: string } | null>(null);
  const [estadoToma, setEstadoToma] = useState<string | null>(null);
  const sonoGrabando = useRef(false);
  const sonandoSola = useRef<AudioContext | null>(null);
  const tocandoCancion = pistas?.transporte.tocando ?? false;

  const parar = async () => {
    const g = grabando;
    setGrabando(null);
    sonoGrabando.current = false;
    const datos = await mesa.pararToma();
    const t = ultimasPistas.current?.transporte;
    if (t?.tocando) t.onAlternar();
    if (!g || !datos || datos.muestras.length < datos.frecuencia * 2 * 0.3) return;
    // Lo que tardó la canción en salir y lo que tardó tu sonido en volver: eso sobra al principio
    const retrasoTotal = g.desde === null ? 0 : (ultimasPistas.current?.retrasoSalida() ?? 0) + mesa.retrasoEntrada();
    setToma({ ...datos, desde: g.desde, recorte: Math.round(retrasoTotal * datos.frecuencia) });
    setPreparada(null);
    setEstadoToma(null);
    setVerToma(true);
  };
  const pulsarRec = async () => {
    if (grabando) return parar();
    if (mesa.estado !== "encendida") {
      const r = await mesa.encender(conSolo(ajustes));
      if (r !== "encendida") return;
      setRetraso(mesa.retrasoMs());
    }
    if (!(await mesa.empezarToma())) return;
    const t = ultimasPistas.current?.transporte;
    setTranscurrido(0);
    setGrabando({ desde: t ? t.segundo : null });
    if (t && !t.tocando) t.onAlternar();
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
  // Al salir de la consola: deja de grabar y de sonar
  useEffect(
    () => () => {
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
  const escucharToma = () => {
    if (!toma) return;
    pararEscucha();
    setVerToma(false);
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
  const guardarToma = async (conCancion: boolean) => {
    if (!toma) return;
    setEstadoToma(conCancion ? "Preparando la canción con tu toma…" : "Preparando tu toma…");
    try {
      const archivo =
        conCancion && pistas ? await pistas.mezclaConToma(toma) : { blob: wavDeToma(toma), nombre: "Mi toma.wav" };
      if (esMovil()) {
        // En el móvil el menú de compartir necesita un toque nuevo
        setPreparada(archivo);
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
  const borrarToma = () => {
    pararEscucha();
    setToma(null);
    setVerToma(false);
  };

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
  const [parte, setParte] = useState<"las-dos" | "cinta" | "mesa">("las-dos");
  // En la mesa en grande, tocar un canal lo abre a toda pantalla (CanalGrande)
  const [canalAbierto, setCanalAbierto] = useState<number | null>(null);
  const vista = partido ? (parte === "mesa" && canalAbierto !== null ? "canal" : parte) : "juntas";
  const atras = () => (canalAbierto !== null ? setCanalAbierto(null) : setParte("las-dos"));
  // Juntas: la grabadora arriba (sin tapar «Estudio» ni la ✕) y la mesa debajo, que se desliza si no cabe
  const altoCinta = Math.max(110, Math.min(0.46 * H, 380));
  const escalaCinta = Math.max(0.1, Math.min((W - 240) / ANCHO_CINTA, altoCinta / ALTO_CINTA, 1));
  const escala = Math.min(1, Math.max(Math.min(W / ANCHO_MESA, (H - altoCinta - 8) / ALTO_MESA), tam?.tactil ? 0.5 : 0.42));
  // Por separado: cada una lo más grande que quepa; las dos juntas, en pequeño una encima de otra
  const escalaCintaGrande = Math.min((W - 16) / ANCHO_CINTA, (H - 8) / ALTO_CINTA);
  const escalaMesaGrande = Math.min((W - 8) / ANCHO_MESA, (H - 4) / ALTO_MESA);
  const anchoResumen = Math.min(W * 0.92, (H - 34) / (ALTO_CINTA / ANCHO_CINTA + ALTO_MESA / ANCHO_MESA));

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
    : grabando
      ? "● Grabando lo que tocas (REC para parar)"
      : encendida
      ? `${estadoTexto}${retraso !== null ? ` · retraso ≈ ${retraso} ms` : ""}`
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
    rec: { grabando: !!grabando, ocupado: estado === "abriendo", onPulsar: () => void pulsarRec() },
    toma: toma && !grabando ? () => setVerToma(true) : null,
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
        <>
          {/* Arriba, fija: la grabadora de bobinas (VU, teclas, la onda de la canción y REC) */}
          <div className="cf-cinta" ref={cinta} style={{ height: altoCinta }}>
            <GrabadoraMesa escala={escalaCinta} {...propsCinta} />
          </div>
          {/* Abajo: la mesa de mezclas, que se desliza con el dedo */}
          <div className="cf-abajo" ref={abajo}>
            <MesaFoto escala={escala} {...propsMesa} />
          </div>
        </>
      )}

      {vista === "las-dos" && (
        <div className="cf-resumen">
          <div className="cf-parte" aria-label="Ver la grabadora en grande" {...elegir("cinta")}>
            <div inert ref={cinta}>
              <GrabadoraMesa escala={anchoResumen / ANCHO_CINTA} {...propsCinta} />
            </div>
          </div>
          <div className="cf-parte" aria-label="Ver la mesa de mezclas en grande" {...elegir("mesa")}>
            <div inert ref={abajo}>
              <MesaFoto escala={anchoResumen / ANCHO_MESA} {...propsMesa} />
            </div>
          </div>
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
      {vista === "mesa" && lectura && (
        <p className="cf-lectura" role="status">
          {lectura.donde} · {lectura.texto}
        </p>
      )}

      <div className="cf-girar" aria-live="polite">
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <rect x="15" y="6" width="18" height="32" rx="3" />
          <path d="M8 30a16 16 0 0 0 16 12M40 18A16 16 0 0 0 24 6" />
        </svg>
        <p>Gira el móvil para usar la mesa</p>
      </div>

      {verToma && toma && (
        <div className="hoja-fondo" onClick={() => setVerToma(false)}>
          <div className="hoja" role="dialog" aria-modal="true" aria-label="Tu toma" onClick={(e) => e.stopPropagation()}>
            <div className="hoja-asa" aria-hidden="true" />
            <header className="hoja-cabecera">
              <h2>Tu toma · {formatoTiempo(duracionToma(toma))}</h2>
              <button type="button" className="boton-texto" onClick={() => setVerToma(false)}>
                Listo
              </button>
            </header>
            <div className="hoja-cuerpo toma-hoja">
              <button type="button" className="boton-principal ancho" onClick={escucharToma}>
                {pistas && toma.desde !== null ? "Escucharla con la canción" : "Escucharla"}
              </button>
              {preparada ? (
                <button type="button" className="boton-principal ancho" onClick={entregarToma}>
                  Guardar o compartir el archivo
                </button>
              ) : (
                <>
                  {pistas && toma.desde !== null && (
                    <button type="button" className="boton-secundario ancho" onClick={() => void guardarToma(true)} disabled={!!estadoToma?.startsWith("Preparando")}>
                      Guardar la canción con tu toma
                    </button>
                  )}
                  <button type="button" className="boton-secundario ancho" onClick={() => void guardarToma(false)} disabled={!!estadoToma?.startsWith("Preparando")}>
                    Guardar solo tu toma
                  </button>
                </>
              )}
              {estadoToma && <p className="toma-estado">{estadoToma}</p>}
              <p className="toma-ayuda">Se guarda en un archivo WAV. Si grabas otra, esta se sustituye.</p>
              <button type="button" className="boton-texto peligro" onClick={borrarToma}>
                Borrar la toma
              </button>
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
