"use client";

// Reproductor de una canción separada: las 6 pistas a la vez, con mezclas
// rápidas, velocidad sin cambiar el tono, repetir un trozo y guardar la mezcla.

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import Navegacion from "./Navegacion";
import Escenario from "./Escenario";
import EstudioMesa from "./EstudioMesa";
import type { PistasMesa } from "./ConsolaMesa";
import { useHorizontal } from "@/lib/horizontal";
import { actualizarCancion, borrarTomaCancion, renombrarCancion } from "@/lib/pistas/almacen";
import { anadirTomaACancion, gananciaDeToma, leerTomasDeCancion, MAX_TOMAS_CANCION } from "@/lib/pistas/tomas";
import { Reproductor } from "@/lib/pistas/reproductor";
import { separadaConRoformer } from "@/lib/pistas/importar";
import { describirMezcla, guardarArchivo, mezclarCancion, nombreArchivo } from "@/lib/pistas/exportar";
import { formatoTiempo, FRECUENCIA, PISTAS, type Cancion, type Pista, type TomaCancion } from "@/lib/pistas/tipos";
import { tomaA, type Toma } from "@/lib/mesa/toma";
import { ondaDe } from "@/lib/pistas/onda";
import { leerPistasDeCancion, pulsoDeCancion } from "@/lib/pistas/cargar";
import { ajustesPorDefecto, guardarAjustesCancion, leerAjustesCancion, moverUno, nombreNuevo, NOMBRES_PARTES, ponerCompas, pulsoAnticuado, pulsoDoble, pulsoMitad, type ClickCancion, type Marca } from "@/lib/pistas/ajustesCancion";
import { VERSION_PULSO } from "@/lib/pistas/pulso";
import { Posicion, usePosicion } from "@/lib/pistas/posicion";
import { bucleDeCompases, compasesDe, moverBucle, type Bucle } from "@/lib/pistas/compases";
import PracticaBucle, { type Practica } from "./PracticaBucle";
import SelectorFormato from "./SelectorFormato";
import { leerFormato, useFormato, type Formato } from "@/lib/pistas/formato";
import { mantenerPantalla, type BloqueoPantalla } from "@/lib/pantalla";


const MEZCLAS: { nombre: string; sin: Pista | null }[] = [
  { nombre: "Todo", sin: null },
  { nombre: "Sin guitarra", sin: "guitarra" },
  { nombre: "Sin voz", sin: "voz" },
  { nombre: "Sin batería", sin: "bateria" },
  { nombre: "Sin bajo", sin: "bajo" },
  { nombre: "Sin piano", sin: "piano" },
];

const VEL_MIN = 0.5;
const VEL_MAX = 1;
const TROZO_MINIMO = 1; // segundos

type Guardado =
  | { estado: "preparando"; pct?: number }
  | { estado: "listo"; blob: Blob; nombre: string; aviso?: string }
  | { estado: "hecho"; texto: string }
  | { estado: "error"; texto: string };

const esMovil = () => typeof navigator !== "undefined" && /iPhone|iPad|Android/i.test(navigator.userAgent);

interface Props {
  cancion: Cancion;
  onVolver: () => void;
  onRenombrada: () => void;
  /** Abrir con la Mesa ya en la consola (se ha elegido desde el selector de pistas) */
  mesaAlEntrar?: boolean;
  /** Para el selector de pistas de la Mesa: todas las canciones y abrir otra */
  canciones?: Cancion[];
  onAbrirOtra?: (c: Cancion) => void;
  /** Han cambiado las carpetas de las canciones (se organizan en la Mesa): hay que volver a leerlas */
  onCambiadas?: () => void;
  /** Solo la Mesa, sin la pantalla del reproductor (la pestaña «Mesa»): su ✕ es `onVolver` */
  soloMesa?: boolean;
}

/** La barra de la posición: se repinta ella sola mientras la canción avanza (lib/pistas/posicion) */
function BarraTiempo({ posicion, duracion, cargando, onIr }: { posicion: Posicion; duracion: number; cargando: boolean; onIr: (s: number) => void }) {
  const segundo = usePosicion(posicion);
  return (
    <input
      type="range"
      className="barra-tiempo"
      min={0}
      max={duracion}
      step={0.1}
      value={Math.min(segundo, duracion)}
      onChange={(e) => onIr(Number(e.target.value))}
      disabled={cargando}
      aria-label="Posición en la canción"
      aria-valuetext={`${formatoTiempo(segundo)} de ${formatoTiempo(duracion)}`}
      style={{ "--hecho": `${(Math.min(segundo, duracion) / Math.max(1, duracion)) * 100}%` } as CSSProperties}
    />
  );
}

/** Por dónde va la canción, en texto (se repinta una vez por segundo) */
function TiempoAhora({ posicion }: { posicion: Posicion }) {
  return usePosicion(posicion, formatoTiempo);
}

export default function Reproduccion({ cancion, onVolver, onRenombrada, mesaAlEntrar = false, canciones, onAbrirOtra, onCambiadas, soloMesa = false }: Props) {
  const rep = useRef<Reproductor | null>(null);
  const [cargando, setCargando] = useState(true);
  // Separada en el PC con BS-RoFormer: ya reparte bien los graves, no se limpia el bajo
  const sinLimpiar = separadaConRoformer(cancion);
  const [error, setError] = useState<string | null>(null);
  const [tocando, setTocando] = useState(false);
  // Por dónde va la canción: no es estado de esta pantalla (se repintaría entera 10 veces por
  // segundo, con la Mesa dentro); la leen de aquí las piezas que la enseñan (lib/pistas/posicion)
  const [posicion] = useState(() => new Posicion());
  // Tus tomas añadidas a la canción (lib/pistas/tomas): suenan con ella, como una pista más
  const [tomasCancion, setTomasCancion] = useState<TomaCancion[]>([]);
  /** La lista al día, para los mandos (el estado va un paso por detrás dentro de un mismo toque) */
  const tomasAhora = useRef<TomaCancion[]>([]);
  /** El guardado de sus fichas que espera (mover un volumen no escribe en cada paso) */
  const fichasPendientes = useRef<{ t: ReturnType<typeof setTimeout>; escribir: () => void } | null>(null);
  // Lo que la canción recuerda de la última vez (mezcla, velocidad, marcas de sus partes)
  const [inicial] = useState(() => (typeof window === "undefined" ? ajustesPorDefecto(PISTAS.length) : leerAjustesCancion(cancion.id, PISTAS.length)));
  const [volumen, setVolumen] = useState<number[]>(() => inicial.volumen);
  const [silencio, setSilencio] = useState<boolean[]>(() => inicial.silencio);
  const [solo, setSolo] = useState<boolean[]>(() => PISTAS.map(() => false));
  const [velocidad, setVelocidad] = useState(inicial.velocidad);
  const [tono, setTono] = useState(inicial.tono);
  const [marcas, setMarcas] = useState<Marca[]>(inicial.marcas);
  const [click, setClick] = useState<ClickCancion | null>(inicial.click);
  const [oirClick, setOirClick] = useState(false);
  const [buscandoPulso, setBuscandoPulso] = useState<"no" | "buscando" | "sin">("no");
  const [desde, setDesde] = useState<number | null>(null);
  const [hasta, setHasta] = useState<number | null>(null);
  const [repetir, setRepetir] = useState(false);
  // El entrenador de velocidad: en cada vuelta del trozo que se repite, un poco más rápido
  const [entrenar, setEntrenar] = useState(false);
  const [cadaVueltas, setCadaVueltas] = useState(2);
  const [vueltasAqui, setVueltasAqui] = useState(0);
  /** Lo mismo, al día para el aviso de vuelta del reproductor (`n`: vueltas dadas a esta velocidad) */
  const entrenador = useRef({ activo: false, cada: 2, n: 0 });
  const [nombre, setNombre] = useState(cancion.nombre);
  const [editando, setEditando] = useState(false);
  const [borrador, setBorrador] = useState(cancion.nombre);
  // El crédito (autoría y licencia) va en un globo que abre la «i» junto al título
  const [verCredito, setVerCredito] = useState(false);
  useEffect(() => {
    if (!verCredito) return;
    const cerrar = (e: PointerEvent) => {
      if (!(e.target as Element).closest?.(".credito-i")) setVerCredito(false);
    };
    document.addEventListener("pointerdown", cerrar);
    return () => document.removeEventListener("pointerdown", cerrar);
  }, [verCredito]);
  const [guardado, setGuardado] = useState<Guardado | null>(null);
  // La Mesa (estudio y consola) con las 6 pistas como canales 3 a 8
  const [verMesa, setVerMesa] = useState(mesaAlEntrar);
  // Venir del selector: la Mesa se abre ya en la consola (solo esa vez)
  const [mesaDirecta, setMesaDirecta] = useState(mesaAlEntrar);
  // La onda de la canción, para la pantalla de la Mesa
  const [onda, setOnda] = useState<Float32Array | null>(null);
  // Un «Solo» en una entrada de la Mesa: las pistas sin «Solo» se callan
  const [soloFuera, setSoloFuera] = useState(false);
  // Otra canción sin desmontar (elegida en la placa de la Mesa): la Mesa se queda montada y lo de la
  // canción se pone como lo dejó la última vez. Desmontar la Mesa entera daba un tirón y un fogonazo
  // oscuro. (Se cambia aquí mismo, al pintar: así nada llega a guardarse con la canción equivocada.)
  // Play pulsado mientras la canción aún carga: se queda apuntado y suena en cuanto esté lista
  // (antes la tecla estaba desactivada sin que se notara: «le doy al play y no funciona»)
  const [esperaTocar, setEsperaTocar] = useState(false);
  const tocarAlCargar = useRef(false);
  const [idActual, setIdActual] = useState(cancion.id);
  if (cancion.id !== idActual) {
    setEsperaTocar(false);
    const a = leerAjustesCancion(cancion.id, PISTAS.length);
    setIdActual(cancion.id);
    setCargando(true);
    setError(null);
    setTocando(false);
    setEntrenar(false);
    setVueltasAqui(0);
    setTomasCancion([]);
    setVolumen(a.volumen);
    setSilencio(a.silencio);
    setSolo(PISTAS.map(() => false));
    setVelocidad(a.velocidad);
    setTono(a.tono);
    setMarcas(a.marcas);
    setClick(a.click);
    setBuscandoPulso("no");
    setDesde(null);
    setHasta(null);
    setRepetir(false);
    setNombre(cancion.nombre);
    setEditando(false);
    setBorrador(cancion.nombre);
    setVerCredito(false);
    setGuardado(null);
    setOnda(null);
  }
  const cerrarMesa = useCallback(() => {
    setVerMesa(false);
    setMesaDirecta(false);
    setSoloFuera(false);
  }, [setVerMesa, setSoloFuera]);
  const ultimo = useRef({ segundo: -1, tocando: false });
  // Dónde acaban los instrumentos del escenario y lo de arriba: el panel de mandos empieza debajo.
  const [pie, setPie] = useState(0);
  const [finArriba, setFinArriba] = useState(0);
  const arriba = useRef<HTMLDivElement>(null);
  // PC e iPad tumbado: el estudio entero a la izquierda y los mandos en una columna a la derecha.
  const horizontal = useHorizontal() === true;
  const bloqueo = useRef<BloqueoPantalla | null>(null);

  const algunSolo = solo.some(Boolean);
  const efectivas = PISTAS.map((_, i) => (silencio[i] || ((algunSolo || soloFuera) && !solo[i]) ? 0 : volumen[i] * volumen[i]));
  const claveGanancias = efectivas.join(",");
  const trozoValido = desde !== null && hasta !== null && hasta - desde >= TROZO_MINIMO;
  // Luz de cada foco del escenario: apagado si la pista no suena, y más tenue con menos volumen.
  const luces = PISTAS.map((_, i) => (efectivas[i] === 0 ? 0 : 0.35 + 0.65 * Math.min(1, volumen[i])));

  useEffect(() => {
    const el = arriba.current;
    if (!el) return;
    const medir = () => setFinArriba(el.offsetTop + el.offsetHeight);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Cargar las pistas del aparato y montar el reproductor.
  useEffect(() => {
    const r = new Reproductor();
    rep.current = r;
    tocarAlCargar.current = false;
    posicion.poner(0);
    tomasAhora.current = [];
    entrenador.current = { ...entrenador.current, activo: false, n: 0 };
    let vivo = true;
    // El entrenador: cada tantas vueltas del trozo, un 5 % más rápido, hasta la velocidad de la canción
    r.alDarVuelta = () => {
      const e = entrenador.current;
      if (!e.activo) return;
      e.n += 1;
      if (e.n >= e.cada) {
        e.n = 0;
        setVelocidad((v) => Math.round(Math.min(VEL_MAX, v + 0.05) * 100) / 100);
      }
      setVueltasAqui(e.n);
    };
    r.alCambiar = ({ tocando: t, segundo: s }) => {
      if (t !== ultimo.current.tocando || Math.abs(s - ultimo.current.segundo) >= 0.1) {
        ultimo.current = { tocando: t, segundo: s };
        setTocando(t);
        posicion.poner(s);
      }
    };
    (async () => {
      try {
        const datos = await leerPistasDeCancion(cancion, () => vivo);
        if (!datos || !vivo) return;
        // Antes de cargar: al reproductor las pistas pasan al hilo de audio y dejan de valer aquí
        setOnda(ondaDe(datos, cancion.frames));
        await r.cargar(datos, cancion.frames, efectivas);
        if (!vivo) return;
        // Tus tomas añadidas: al reproductor, después de las pistas (si alguna falla, sin ella)
        const guardadas = await leerTomasDeCancion(cancion.id).catch(() => []);
        if (!vivo) return;
        if (guardadas.length) r.ponerTomas(guardadas.map(({ ficha, datos: d }) => ({ id: ficha.id, datos: d, desde: ficha.desde, ganancia: gananciaDeToma(ficha) })));
        tomasAhora.current = guardadas.map((g) => g.ficha);
        setTomasCancion(tomasAhora.current);
        setCargando(false);
        if (tocarAlCargar.current) {
          tocarAlCargar.current = false;
          setEsperaTocar(false);
          void r.tocar();
        }
      } catch (e) {
        if (vivo) setError((e as Error).message || "No se han podido abrir las pistas.");
      }
    })();
    return () => {
      vivo = false;
      // Lo que quedara por guardar de las tomas de esta canción, ya
      if (fichasPendientes.current) {
        clearTimeout(fichasPendientes.current.t);
        fichasPendientes.current.escribir();
      }
      r.cerrar();
      rep.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancion.id, cancion.frames, sinLimpiar]);

  useEffect(() => {
    rep.current?.ganancias(claveGanancias.split(",").map(Number));
  }, [claveGanancias]);

  useEffect(() => {
    if (!cargando) rep.current?.velocidad(velocidad);
  }, [velocidad, cargando]);

  useEffect(() => {
    if (!cargando) rep.current?.tono(tono);
  }, [tono, cargando]);

  useEffect(() => {
    if (!cargando) rep.current?.tempoClick(click);
  }, [click, cargando]);

  useEffect(() => {
    if (!cargando) rep.current?.rutaClick(oirClick && click ? "juntos" : "no");
  }, [oirClick, click, cargando]);

  useEffect(() => {
    if (cargando) return;
    if (repetir && trozoValido) rep.current?.bucle(desde, hasta as number);
    else rep.current?.bucle(null);
  }, [repetir, trozoValido, desde, hasta, cargando]);

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

  // Al parar la canción se para también la toma que estuvieras escuchando
  useEffect(() => {
    if (!tocando) rep.current?.pararToma();
  }, [tocando]);

  // Se guarda lo de esta canción (para la próxima vez y para el repertorio)
  useEffect(() => {
    guardarAjustesCancion(cancion.id, { volumen, silencio, velocidad, tono, marcas, click });
  }, [cancion.id, volumen, silencio, velocidad, tono, marcas, click]);

  // ---- El click: el pulso sale de la batería (los golpes y el compás) y del bajo (el 1) ----
  // La canción que hay ahora: si se cambia mientras se busca el pulso de otra, ese ya no vale
  const idVivo = useRef(cancion.id);
  useEffect(() => {
    idVivo.current = cancion.id;
  }, [cancion.id]);
  // `oir`: que suene ya (al pedirlo con el botón); el que busca solo la Mesa no lo enciende.
  const sacarElPulso = async (oir = true) => {
    const id = cancion.id;
    const habia = click;
    setBuscandoPulso("buscando");
    await new Promise((r) => setTimeout(r, 40)); // que se vea «Buscando…» antes de la cuenta
    let p: ClickCancion | null = null;
    try {
      p = await pulsoDeCancion(cancion);
    } catch {
      /* sin pulso */
    }
    if (idVivo.current !== id) return;
    if (p) {
      setClick(p);
      if (oir) setOirClick(true);
      setBuscandoPulso("no");
    } else if (habia) {
      // No sale otro: se queda el que había (apuntado como visto, para no buscarlo cada vez)
      setClick({ ...habia, v: VERSION_PULSO });
      setBuscandoPulso("no");
    } else setBuscandoPulso("sin");
  };
  // En la Mesa, el metrónomo va con el ritmo y el compás de la canción: si aún no los tiene (o los
  // sacó un análisis anterior, que no miraba el compás ni el bajo), se buscan solos (en otro hilo, un
  // momento después de abrirla para no estorbar a la entrada)
  const faltaPulso = !click || pulsoAnticuado(click, VERSION_PULSO);
  useEffect(() => {
    if (!verMesa || cargando || !faltaPulso || buscandoPulso !== "no") return;
    const t = setTimeout(() => void sacarElPulso(false), 1200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [verMesa, cargando, faltaPulso, buscandoPulso]);
  const SIGUIENTE_COMPAS: Record<number, number> = { 4: 3, 3: 2, 2: 6, 6: 4 };
  // ---- Tus tomas añadidas a la canción ----
  const ponerTomas = (lista: TomaCancion[]) => {
    tomasAhora.current = lista;
    setTomasCancion(lista);
  };
  /** Guarda las fichas (volumen, silencio) en el aparato; con `espera`, cuando dejes de mover el mando. */
  const apuntarFichas = (lista: TomaCancion[], espera = 0) => {
    const id = cancion.id;
    if (fichasPendientes.current) clearTimeout(fichasPendientes.current.t);
    const escribir = () => {
      fichasPendientes.current = null;
      void actualizarCancion(id, { tomas: lista }).catch(() => undefined);
    };
    if (!espera) return escribir();
    fichasPendientes.current = { t: setTimeout(escribir, espera), escribir };
  };
  /** Antes de añadir o borrar: que lo pendiente quede escrito (y no pise después la lista nueva) */
  const soltarFichas = () => {
    const p = fichasPendientes.current;
    if (!p) return;
    clearTimeout(p.t);
    p.escribir();
  };
  const cambiarToma = (idToma: string, cambio: (t: TomaCancion) => TomaCancion, espera = 0) => {
    const lista = tomasAhora.current.map((t) => (t.id === idToma ? cambio(t) : t));
    ponerTomas(lista);
    const t = lista.find((x) => x.id === idToma);
    if (t) rep.current?.gananciaToma(idToma, gananciaDeToma(t));
    apuntarFichas(lista, espera);
  };
  const volumenToma = (idToma: string, v: number) => cambiarToma(idToma, (t) => ({ ...t, volumen: Math.max(0, Math.min(1.5, v)) }), 400);
  const silencioToma = (idToma: string) => cambiarToma(idToma, (t) => ({ ...t, silencio: !t.silencio }));
  const nombreToma = (idToma: string, nombreNuevoToma: string) => {
    const limpio = nombreNuevoToma.trim().slice(0, 40);
    if (limpio) cambiarToma(idToma, (t) => ({ ...t, nombre: limpio }));
  };
  /** Mueve la toma `ms` milisegundos (positivo: suena después); con 0, vuelve a donde se grabó. */
  const moverToma = (idToma: string, ms: number) => {
    const antes = tomasAhora.current.find((t) => t.id === idToma);
    if (!antes) return;
    const movida = ms === 0 ? 0 : Math.max(-500, Math.min(500, (antes.movida ?? 0) + ms));
    const paso = Math.round(((movida - (antes.movida ?? 0)) / 1000) * FRECUENCIA);
    const desde = Math.max(0, antes.desde + paso);
    cambiarToma(idToma, (t) => ({ ...t, desde, movida }), 400);
    rep.current?.moverToma(idToma, desde);
  };
  /** Añade a la canción una toma grabada con ella. Devuelve el motivo si no se puede. */
  const anadirToma = async (toma: Toma, nombreToma: string): Promise<string | null> => {
    if (tomasAhora.current.length >= MAX_TOMAS_CANCION) return `Ya hay ${MAX_TOMAS_CANCION} tomas añadidas a esta canción: borra alguna para añadir otra.`;
    const id = cancion.id;
    soltarFichas();
    try {
      const { ficha, datos } = await anadirTomaACancion(id, toma, nombreToma);
      if (idVivo.current !== id) return null;
      rep.current?.ponerToma({ id: ficha.id, datos, desde: ficha.desde, ganancia: gananciaDeToma(ficha) });
      ponerTomas([...tomasAhora.current, ficha]);
      return null;
    } catch (e) {
      return (e as Error).message || "No se ha podido añadir la toma.";
    }
  };
  const borrarTomaAnadida = async (idToma: string) => {
    const id = cancion.id;
    soltarFichas();
    rep.current?.quitarToma(idToma);
    ponerTomas(tomasAhora.current.filter((t) => t.id !== idToma));
    await borrarTomaCancion(id, idToma).catch(() => undefined);
  };

  const cambiarCompas = () => setClick((c) => (c ? ponerCompas(c, SIGUIENTE_COMPAS[c.compas] ?? 4) : c));
  const puedeDoble = !!click && click.bpm * 2 <= 260;
  const puedeMitad = !!click && click.bpm / 2 >= 40 && click.golpes.length >= 8;

  // ---- Partes de la canción (marcas) ----
  const marcar = (nombre: string) => {
    const s = Math.round(posicion.leer() * 10) / 10;
    setMarcas((ms) => [...ms.filter((m) => Math.abs(m.segundo - s) > 0.5), { segundo: s, nombre: nombreNuevo(ms, nombre) }].sort((a, b) => a.segundo - b.segundo));
  };
  const quitarMarca = (i: number) => setMarcas((ms) => ms.filter((_, j) => j !== i));
  const repetirParte = (i: number) => {
    const ini = marcas[i].segundo;
    const fin = marcas[i + 1]?.segundo ?? cancion.duracion;
    setDesde(ini);
    setHasta(fin);
    setRepetir(true);
    ir(ini);
  };

  // Si cambias la mezcla, el archivo preparado ya no vale.
  useEffect(() => {
    setGuardado((g) => (g && g.estado !== "preparando" ? null : g));
  }, [claveGanancias]);

  const alternar = () => {
    const r = rep.current;
    if (!r) return;
    if (cargando) {
      // Aún carga: se apunta (otro toque lo quita) y el sonido se desbloquea ya, con este toque
      const apuntar = !tocarAlCargar.current;
      tocarAlCargar.current = apuntar;
      setEsperaTocar(apuntar);
      if (apuntar) r.desbloquear();
      return;
    }
    if (tocando) r.pausar();
    else void r.tocar();
  };

  const ir = (s: number) => {
    const v = Math.max(0, Math.min(cancion.duracion, s));
    rep.current?.ir(v);
    posicion.poner(v);
  };

  const aplicarMezcla = (sin: Pista | null) => {
    setSolo(PISTAS.map(() => false));
    setSilencio(PISTAS.map((p) => p.id === sin));
    setVolumen(PISTAS.map(() => 1));
  };
  const mezclaActiva = (sin: Pista | null) =>
    !algunSolo && volumen.every((v) => v === 1) && PISTAS.every((p, i) => silencio[i] === (p.id === sin));
  const cambiar = (lista: boolean[], i: number) => lista.map((v, j) => (j === i ? !v : v));
  // Tocar un instrumento del escenario: lo quita o lo vuelve a poner (con algún «Solo», lo añade o lo saca del solo).
  const tocarInstrumento = (pista: Pista) => {
    const i = PISTAS.findIndex((p) => p.id === pista);
    if (algunSolo) setSolo((s) => cambiar(s, i));
    else setSilencio((s) => cambiar(s, i));
  };

  // ---- Repetir un trozo ----
  const marcarInicio = () => {
    const s = Math.round(posicion.leer() * 10) / 10;
    setDesde(s);
    if (hasta !== null && hasta - s < TROZO_MINIMO) setHasta(null);
  };
  const marcarFin = () => {
    const s = Math.round(posicion.leer() * 10) / 10;
    const ini = desde ?? 0;
    if (s - ini < TROZO_MINIMO) return;
    if (desde === null) setDesde(0);
    setHasta(s);
    setRepetir(true);
  };
  const quitarTrozo = () => {
    setDesde(null);
    setHasta(null);
    setRepetir(false);
  };

  // ---- El bucle por compases y el entrenador de velocidad (lib/pistas/compases, PracticaBucle) ----
  const ponerBucle = (b: Bucle | null) => {
    if (!b || b.hasta - b.desde < TROZO_MINIMO) return;
    setDesde(b.desde);
    setHasta(b.hasta);
    setRepetir(true);
  };
  const ponerEntrenador = (activo: boolean, cada: number) => {
    entrenador.current = { activo, cada, n: 0 };
    setEntrenar(activo);
    setCadaVueltas(cada);
    setVueltasAqui(0);
  };
  const practica: Practica = {
    conCompases: !!click,
    buscando: buscandoPulso === "buscando",
    compasesDelBucle: click && desde !== null && hasta !== null ? (compasesDe(click, desde, hasta, cancion.duracion)?.cuantos ?? null) : null,
    onCompases: (n) => {
      if (click) ponerBucle(bucleDeCompases(click, posicion.leer(), n, cancion.duracion));
    },
    onMover: (pasos) => {
      if (click && desde !== null && hasta !== null) ponerBucle(moverBucle(click, desde, hasta, pasos, cancion.duracion));
    },
    entrenar,
    cada: cadaVueltas,
    vuelta: vueltasAqui,
    onEntrenar: (si) => ponerEntrenador(si, cadaVueltas),
    onCada: (n) => ponerEntrenador(entrenar, n),
  };

  // ---- Velocidad ----
  const cambiarVelocidad = (delta: number) =>
    setVelocidad((v) => Math.round(Math.max(VEL_MIN, Math.min(VEL_MAX, v + delta)) * 100) / 100);

  // ---- Guardar la mezcla ----
  const prepararMezcla = async () => {
    setGuardado({ estado: "preparando" });
    try {
      const { blob, formato: salio, aviso } = await mezclarCancion(cancion, efectivas, undefined, leerFormato(), (hecho) => setGuardado({ estado: "preparando", pct: Math.round(hecho * 100) }));
      const archivo = nombreArchivo({ ...cancion, nombre }, efectivas, salio);
      if (esMovil()) {
        // En el móvil el menú de compartir necesita un toque nuevo.
        setGuardado({ estado: "listo", blob, nombre: archivo, aviso });
      } else {
        const r = await guardarArchivo(blob, archivo);
        setGuardado({ estado: "hecho", texto: `${r === "descargado" ? `Descargado: ${archivo}` : `Listo: ${archivo}`}${aviso ? ` · ${aviso}` : ""}` });
      }
    } catch (e) {
      setGuardado({ estado: "error", texto: (e as Error).message || "No se ha podido preparar la mezcla." });
    }
  };
  const entregar = async () => {
    if (guardado?.estado !== "listo") return;
    const r = await guardarArchivo(guardado.blob, guardado.nombre);
    if (r !== "cancelado") setGuardado({ estado: "hecho", texto: r === "compartido" ? "Guardado." : `Descargado: ${guardado.nombre}` });
  };

  // ---- Cambiar el nombre ----
  const guardarNombre = async () => {
    const limpio = borrador.trim();
    setEditando(false);
    if (!limpio || limpio === nombre) {
      setBorrador(nombre);
      return;
    }
    setNombre(limpio);
    await renombrarCancion(cancion.id, limpio);
    onRenombrada();
  };

  const pct = (s: number) => `${(Math.min(s, cancion.duracion) / Math.max(1, cancion.duracion)) * 100}%`;
  const pistasMesa: PistasMesa = {
    id: cancion.id,
    nombres: PISTAS.map((p) => p.nombre),
    conArticulo: PISTAS.map((p) => p.conArticulo),
    volumen,
    silencio,
    solo,
    onVolumen: (i, v) => setVolumen((vs) => vs.map((x, j) => (j === i ? v : x))),
    onSilencio: (i) => setSilencio((s) => cambiar(s, i)),
    onSolo: (i) => setSolo((s) => cambiar(s, i)),
    onSoloFuera: setSoloFuera,
    transporte: {
      tocando,
      cargando,
      esperaTocar,
      posicion,
      duracion: cancion.duracion,
      onda,
      desde,
      hasta,
      repetir,
      onAlternar: alternar,
      onIr: ir,
      onTrozo: (d, h) => {
        setDesde(d);
        setHasta(h);
        if (d === null || h === null) setRepetir(false);
      },
      onRepetir: setRepetir,
      velocidad,
      velocidadMin: VEL_MIN,
      velocidadMax: VEL_MAX,
      onVelocidad: (v) => setVelocidad(Math.round(Math.max(VEL_MIN, Math.min(VEL_MAX, v)) * 100) / 100),
      practica,
    },
    retrasoSalida: () => rep.current?.retrasoSalida() ?? 0,
    escucharToma: async (toma: Toma) => {
      const r = rep.current;
      if (!r || cargando || toma.desde === null) return;
      ir(toma.desde);
      if (!tocando) await r.tocar();
      r.tocarToma(tomaA(toma, FRECUENCIA), FRECUENCIA);
    },
    pararToma: () => rep.current?.pararToma(),
    tomas: { lista: tomasCancion, tope: MAX_TOMAS_CANCION, anadir: anadirToma, onVolumen: volumenToma, onSilencio: silencioToma, onMover: moverToma, onNombre: nombreToma, borrar: borrarTomaAnadida },
    mezclaConToma: async (toma: Toma, formato: Formato, alProgreso?: (hecho: number) => void) => {
      const a = await mezclarCancion(cancion, efectivas, { muestras: tomaA(toma, FRECUENCIA), desde: (toma.desde ?? 0) * FRECUENCIA }, formato, alProgreso);
      return { ...a, nombre: nombreArchivo({ ...cancion, nombre }, efectivas, a.formato).replace(/\.(\w+)$/, " + mi toma.$1") };
    },
    aplicar: (i, a) => rep.current?.aplicarPista(i, a),
    volumenGeneral: (v) => rep.current?.volumenGeneral(v),
    niveles: () => rep.current?.niveles() ?? { pistas: [], general: 0 },
    espectros: () => rep.current?.espectros() ?? null,
    metronomo: {
      pulso: click,
      buscando: buscandoPulso === "buscando",
      sinPulso: buscandoPulso === "sin",
      oir: oirClick,
      onOir: setOirClick,
      onBuscar: () => void sacarElPulso(false),
      onCompas: (compas) => setClick((c) => (c ? ponerCompas(c, compas) : c)),
      onMoverUno: () => setClick((c) => (c ? moverUno(c) : c)),
      onDoble: () => setClick((c) => (c && puedeDoble ? pulsoDoble(c) : c)),
      onMitad: () => setClick((c) => (c && puedeMitad ? pulsoMitad(c) : c)),
      puedeDoble,
      puedeMitad,
      tocarConCuenta: async (segundos) => {
        const r = rep.current;
        if (!r || cargando) return 0;
        return r.tocar({ cuenta: true, segundosCuenta: segundos, forzarCuenta: true });
      },
    },
  };
  const queda = describirMezcla(efectivas);
  const formato = useFormato();

  if (soloMesa) {
    return (
      <EstudioMesa
        pagina
        onCerrar={onVolver}
        pistas={pistasMesa}
        enConsola={mesaDirecta}
        selector={canciones && onAbrirOtra ? { canciones, actual: cancion.id, onElegir: onAbrirOtra, onCambiadas: onCambiadas ?? (() => undefined) } : undefined}
      />
    );
  }

  return (
    <main className="app app-pistas con-escenario">
      <Escenario luces={luces} onTocar={tocarInstrumento} onMedir={setPie} horizontal={horizontal} />

      <div className="reproductor-arriba" ref={arriba}>
        <header className="cabecera">
          <Navegacion actual="pistas" sobreOscuro />
        </header>

        <button type="button" className="volver" onClick={onVolver}>
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <path d="M10 3 L5 8 L10 13" />
          </svg>
          Tus pistas
        </button>

        {editando ? (
          <form
            className="renombrar"
            onSubmit={(e) => {
              e.preventDefault();
              guardarNombre();
            }}
          >
            <input
              autoFocus
              value={borrador}
              onChange={(e) => setBorrador(e.target.value)}
              maxLength={80}
              aria-label="Nombre de la canción"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  setBorrador(nombre);
                  setEditando(false);
                }
              }}
            />
            <button type="submit" className="boton-texto">
              Guardar
            </button>
          </form>
        ) : (
          <div className="titulo-fila">
            <h1 className="reproductor-titulo">{nombre}</h1>
            <button type="button" className="boton-lapiz" onClick={() => setEditando(true)} aria-label="Cambiar el nombre">
              <svg viewBox="0 0 24 24" className="icono" aria-hidden="true">
                <path d="M4 20h4L19 9l-4-4L4 16v4zM14 6l4 4" />
              </svg>
            </button>
            {cancion.credito && (
              <button
                type="button"
                className="credito-i"
                onClick={() => setVerCredito((v) => !v)}
                aria-expanded={verCredito}
                aria-label="Autoría y licencia de la canción"
              >
                i
              </button>
            )}
            {verCredito && cancion.credito && (
              <p className="credito-globo" role="note">
                {cancion.credito}
              </p>
            )}
          </div>
        )}

        {!error && (
          <section className="transporte" aria-label="Reproducción">
            <div className="barra-envoltura">
              {desde !== null && (
                <span
                  className={`barra-trozo ${repetir && trozoValido ? "activo" : ""}`}
                  style={{ left: pct(desde), width: hasta !== null ? `calc(${pct(hasta)} - ${pct(desde)})` : "2px" }}
                  aria-hidden="true"
                />
              )}
              <BarraTiempo posicion={posicion} duracion={cancion.duracion} cargando={cargando} onIr={ir} />
            </div>
            <div className="tiempos">
              <span>
                <TiempoAhora posicion={posicion} />
              </span>
              <span>{formatoTiempo(cancion.duracion)}</span>
            </div>
            <div className="mandos">
              <button type="button" className="boton-salto" onClick={() => ir(posicion.leer() - 10)} disabled={cargando} aria-label="Atrás 10 segundos">
                <IconoSalto atras />
              </button>
              <button
                type="button"
                className={`boton-tocar${esperaTocar ? " espera" : ""}`}
                onClick={alternar}
                aria-label={cargando ? (esperaTocar ? "Cargando: sonará en cuanto esté lista (toca para quitarlo)" : "Tocar en cuanto cargue") : tocando ? "Pausa" : "Tocar"}
              >
                {cargando ? <span className="girando" aria-hidden="true" /> : tocando ? <IconoPausa /> : <IconoTocar />}
              </button>
              <button type="button" className="boton-salto" onClick={() => ir(posicion.leer() + 10)} disabled={cargando} aria-label="Adelante 10 segundos">
                <IconoSalto />
              </button>
            </div>
          </section>
        )}
      </div>

      <div className="reproductor-panel" style={horizontal ? undefined : { top: Math.max(pie, finArriba + 8) }}>
        {error ? (
          <div className="tarjeta tarjeta-error" role="alert">
            <p>{error}</p>
          </div>
        ) : (
          <>
            <section aria-label="Mezclas rápidas">
              <div className="mezclas">
                {MEZCLAS.map((m) => (
                  <button key={m.nombre} type="button" className="chip" aria-pressed={mezclaActiva(m.sin)} onClick={() => aplicarMezcla(m.sin)}>
                    {m.nombre}
                  </button>
                ))}
              </div>
            </section>

            <p className="escenario-ayuda">Toca un instrumento del estudio para quitarlo o volver a ponerlo.</p>

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
                      value={Math.min(1, volumen[i])}
                      onChange={(e) => {
                        const v = Number(e.target.value);
                        setVolumen((vs) => vs.map((x, j) => (j === i ? v : x)));
                      }}
                      aria-label={`Volumen de ${p.nombre}`}
                      style={{ "--hecho": `${Math.min(1, volumen[i]) * 100}%` } as CSSProperties}
                    />
                  </div>
                );
              })}
              {/* Tus tomas añadidas en la Mesa: suenan con la canción, como una pista más */}
              {tomasCancion.map((t) => (
                <div key={t.id} className={`canal canal-toma ${t.silencio || t.volumen < 0.005 ? "apagado" : ""}`}>
                  <div className="canal-cabeza">
                    <span className="canal-nombre">
                      {t.nombre} <small>desde {formatoTiempo(t.desde / FRECUENCIA)}</small>
                    </span>
                    <button
                      type="button"
                      className="canal-boton silencio"
                      aria-pressed={t.silencio}
                      onClick={() => silencioToma(t.id)}
                      aria-label={t.silencio ? `Volver a oír ${t.nombre}` : `Quitar ${t.nombre}`}
                    >
                      {t.silencio ? <IconoMudo /> : <IconoSuena />}
                    </button>
                  </div>
                  <input
                    type="range"
                    className="cuerda-volumen"
                    min={0}
                    max={1.5}
                    step={0.01}
                    value={Math.min(1.5, t.volumen)}
                    onChange={(e) => volumenToma(t.id, Number(e.target.value))}
                    aria-label={`Volumen de ${t.nombre}`}
                    style={{ "--hecho": `${(Math.min(1.5, t.volumen) / 1.5) * 100}%` } as CSSProperties}
                  />
                </div>
              ))}
            </section>

            <button type="button" className="boton-mesa-pistas" onClick={() => setVerMesa(true)}>
              <IconoMesa />
              <span>Entrar en la Mesa</span>
            </button>

            <section className="practica" aria-label="Para practicar">
              <div className="practica-fila">
                <span className="practica-titulo">Velocidad</span>
                <div className="paso-a-paso">
                  <button type="button" className="boton-redondo" onClick={() => cambiarVelocidad(-0.05)} disabled={velocidad <= VEL_MIN} aria-label="Más lento">
                    −
                  </button>
                  <output className="paso-valor" aria-live="polite">
                    {Math.round(velocidad * 100)} %
                  </output>
                  <button type="button" className="boton-redondo" onClick={() => cambiarVelocidad(0.05)} disabled={velocidad >= VEL_MAX} aria-label="Más rápido">
                    +
                  </button>
                </div>
                {velocidad !== 1 && (
                  <button type="button" className="boton-texto" onClick={() => setVelocidad(1)}>
                    Normal
                  </button>
                )}
              </div>
              {velocidad !== 1 && <p className="practica-ayuda">Más lenta pero en el mismo tono, para sacarla con calma.</p>}

              <div className="practica-fila">
                <span className="practica-titulo">Tono</span>
                <div className="paso-a-paso">
                  <button type="button" className="boton-redondo" onClick={() => setTono((t) => Math.max(-6, t - 1))} disabled={tono <= -6} aria-label="Bajar un semitono">
                    −
                  </button>
                  <output className="paso-valor tono-valor" aria-live="polite">
                    {tono === 0 ? "Original" : `${tono > 0 ? "+" : "−"}${Math.abs(tono)}`}
                  </output>
                  <button type="button" className="boton-redondo" onClick={() => setTono((t) => Math.min(6, t + 1))} disabled={tono >= 6} aria-label="Subir un semitono">
                    +
                  </button>
                </div>
                {tono !== 0 && (
                  <button type="button" className="boton-texto" onClick={() => setTono(0)}>
                    Original
                  </button>
                )}
              </div>
              {tono !== 0 && (
                <p className="practica-ayuda">
                  {Math.abs(tono)} {Math.abs(tono) === 1 ? "semitono" : "semitonos"} más {tono > 0 ? "agudo" : "grave"}, a la misma velocidad: para que el cantante llegue cómodo.
                </p>
              )}

              <div className="practica-fila partes">
                <span className="practica-titulo">Partes</span>
                {marcas.length > 0 ? (
                  <ul className="partes-lista">
                    {marcas.map((m, i) => (
                      <li key={`${m.segundo}-${m.nombre}`} className="parte">
                        <button type="button" className="chip" onClick={() => ir(m.segundo)} disabled={cargando} aria-label={`Ir a ${m.nombre} (${formatoTiempo(m.segundo)})`}>
                          {m.nombre} <small>{formatoTiempo(m.segundo)}</small>
                        </button>
                        <button type="button" className="boton-texto suave parte-boton" onClick={() => repetirParte(i)} disabled={cargando} aria-label={`Repetir ${m.nombre}`}>
                          ↻
                        </button>
                        <button type="button" className="boton-texto suave parte-boton" onClick={() => quitarMarca(i)} aria-label={`Quitar la marca ${m.nombre}`}>
                          ✕
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="practica-ayuda">Sin marcas todavía</span>
                )}
              </div>
              <div className="partes-nueva">
                <span>
                  Marcar aquí (<TiempoAhora posicion={posicion} />
                  ):
                </span>
                {NOMBRES_PARTES.map((n) => (
                  <button key={n} type="button" className="chip" onClick={() => marcar(n)} disabled={cargando}>
                    {n}
                  </button>
                ))}
              </div>
              <p className="practica-ayuda">Pon la canción donde empieza cada parte y toca su nombre. Luego, tocar la parte va a ella y ↻ la repite. Esta canción lo recuerda, igual que su mezcla y su velocidad.</p>

              <div className="practica-fila click-cancion">
                <span className="practica-titulo">Click</span>
                {click ? (
                  <div className="click-botones">
                    <output className="click-tempo">{Math.round(click.bpm)} BPM</output>
                    <button type="button" className="chip" onClick={() => setClick(moverUno(click))}>
                      Mover el 1
                    </button>
                    <button type="button" className="chip" onClick={cambiarCompas}>
                      Compás de {click.compas}
                    </button>
                    <button type="button" className="chip" onClick={() => setClick(pulsoDoble(click))} disabled={!puedeDoble} aria-label="Pulso al doble de rápido">
                      Al doble
                    </button>
                    <button type="button" className="chip" onClick={() => setClick(pulsoMitad(click))} disabled={!puedeMitad} aria-label="Pulso a la mitad">
                      A la mitad
                    </button>
                    <button type="button" className={`interruptor-mini ${oirClick ? "on" : ""}`} role="switch" aria-checked={oirClick} onClick={() => setOirClick((o) => !o)} disabled={cargando}>
                      <span className="interruptor-pista" aria-hidden="true">
                        <span className="interruptor-bola" />
                      </span>
                      <span>Oírlo</span>
                    </button>
                    <button
                      type="button"
                      className="boton-texto suave"
                      onClick={() => {
                        setClick(null);
                        setOirClick(false);
                      }}
                    >
                      Quitar
                    </button>
                  </div>
                ) : (
                  <button type="button" className="chip" onClick={() => void sacarElPulso()} disabled={cargando || buscandoPulso === "buscando"}>
                    {buscandoPulso === "buscando" ? "Buscando el pulso…" : "Sacar el pulso de la batería"}
                  </button>
                )}
              </div>
              <p className="practica-ayuda">
                {click
                  ? "Suena en cada golpe de la batería; el agudo es el 1 del compás. Si va el doble de rápido (o de lento) de lo que cuentas, «A la mitad» (o «Al doble»); si el 1 no cae donde debe, «Mover el 1». En el directo puede ir solo a tus cascos."
                  : buscandoPulso === "sin"
                    ? "No he encontrado un pulso claro en la batería de esta canción."
                    : "Para tocar en directo con click: lo saca de la batería y esta canción lo recuerda."}
              </p>

              <div className="practica-fila trozo">
                <span className="practica-titulo">Repetir un trozo</span>
                <div className="trozo-botones">
                  <button type="button" className="chip" onClick={marcarInicio} disabled={cargando}>
                    {desde !== null ? `Desde ${formatoTiempo(desde)}` : "Empieza aquí"}
                  </button>
                  <button type="button" className="chip" onClick={marcarFin} disabled={cargando}>
                    {hasta !== null ? `Hasta ${formatoTiempo(hasta)}` : "Acaba aquí"}
                  </button>
                  {trozoValido && (
                    <button
                      type="button"
                      className={`interruptor-mini ${repetir ? "on" : ""}`}
                      role="switch"
                      aria-checked={repetir}
                      onClick={() => setRepetir((r) => !r)}
                    >
                      <span className="interruptor-pista" aria-hidden="true">
                        <span className="interruptor-bola" />
                      </span>
                      <span>Repetir</span>
                    </button>
                  )}
                  {desde !== null && (
                    <button type="button" className="boton-texto suave" onClick={quitarTrozo}>
                      Quitar
                    </button>
                  )}
                </div>
              </div>
              <p className="practica-ayuda">
                {desde === null
                  ? "Pon la canción donde empieza el trozo y toca «Empieza aquí»; luego, donde acaba, «Acaba aquí»."
                  : hasta === null
                    ? "Ahora llévala a donde acaba el trozo y toca «Acaba aquí»."
                    : repetir
                      ? `Se repite de ${formatoTiempo(desde)} a ${formatoTiempo(hasta)}.`
                      : "Activa «Repetir» para que suene en bucle."}
              </p>
              <PracticaBucle p={practica} hayTrozo={trozoValido} repitiendo={repetir && trozoValido} velocidad={velocidad} />
            </section>

            <section className="guardar" aria-label="Guardar la mezcla">
              {guardado?.estado === "listo" ? (
                <button type="button" className="boton-principal ancho" onClick={entregar}>
                  Guardar o compartir el archivo
                </button>
              ) : (
                <button type="button" className="boton-principal ancho" onClick={prepararMezcla} disabled={cargando || guardado?.estado === "preparando"}>
                  {guardado?.estado === "preparando" ? (formato === "mp3" ? `Preparando el MP3…${guardado.pct ? ` ${guardado.pct} %` : ""}` : "Preparando la mezcla…") : "Guardar mi mezcla"}
                </button>
              )}
              <p className="practica-ayuda">
                {guardado?.estado === "hecho" || guardado?.estado === "error"
                  ? guardado.texto
                  : guardado?.estado === "listo" && guardado.aviso
                    ? guardado.aviso
                    : `Se guarda como está ahora (${queda}), a velocidad normal, en un archivo ${formato === "mp3" ? "MP3" : "WAV"}.`}
              </p>
              <SelectorFormato />
            </section>
          </>
        )}
      </div>

      {verMesa && (
        <EstudioMesa
          onCerrar={cerrarMesa}
          pistas={pistasMesa}
          enConsola={mesaDirecta}
          selector={canciones && onAbrirOtra ? { canciones, actual: cancion.id, onElegir: onAbrirOtra, onCambiadas: onCambiadas ?? (() => undefined) } : undefined}
        />
      )}
    </main>
  );
}

function IconoMesa() {
  return (
    <svg className="icono" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
      <path d="M6 4v16M12 4v16M18 4v16" opacity="0.55" />
      <rect x="3.6" y="12.5" width="4.8" height="3.4" rx="1" fill="currentColor" stroke="none" />
      <rect x="9.6" y="6.5" width="4.8" height="3.4" rx="1" fill="currentColor" stroke="none" />
      <rect x="15.6" y="10" width="4.8" height="3.4" rx="1" fill="currentColor" stroke="none" />
    </svg>
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
