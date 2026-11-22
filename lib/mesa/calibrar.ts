// Calibrar el retraso del aparato: para que lo que grabas caiga a tiempo con la canción.
// Al grabar, a la toma se le quita del principio lo que tarda la canción en salir por los cascos y lo
// que tarda tu sonido en volver por el micro. Eso lo dice el navegador, pero a veces dice de menos
// (o nada: con cascos Bluetooth, o en el iPhone, que no dice la entrada) y la toma queda atrasada.
// La prueba lo mide de verdad, por el mismo camino que una grabación: se pone a grabar, suena una
// «canción» de 6 clics y se mira cuánto tarda cada clic en aparecer en lo grabado. La diferencia con
// lo que decía el navegador (el «ajuste») se guarda en el aparato y se suma en cada grabación.
// Se hace dos veces: de una grabación a otra el arranque baila unos milisegundos (casi siempre sale
// lo mismo y alguna vez ~10 ms más), así que se queda con la menor de las dos, que es la habitual.
// El micro tiene que oír los clics: con cascos, hay que acercarle un auricular.

import { AJUSTES_PISTA, leerAjustesMesa, MAESTROS_INICIALES, type AjustesMesa } from "./ajustes";
import { mesa } from "./mesa";
import { Reproductor } from "../pistas/reproductor";
import { FRECUENCIA } from "../pistas/tipos";

const CLAVE = "galileo:mesa:retraso";
/** Lo más que se deja ajustar (segundos): más que esto no es retraso, es que algo va mal */
export const AJUSTE_MAXIMO = 0.6;

export interface Calibracion {
  /** Segundos que se suman al retraso que dice el navegador (puede ser negativo) */
  ajuste: number;
  /** Lo que tardó de verdad en la prueba y lo que decía el navegador (segundos); sin prueba, null */
  medido: number | null;
  dicho: number | null;
  cuando: number;
}

export function leerCalibracion(): Calibracion | null {
  try {
    const c = JSON.parse(localStorage.getItem(CLAVE) ?? "null") as Partial<Calibracion> | null;
    if (!c || typeof c.ajuste !== "number" || !Number.isFinite(c.ajuste)) return null;
    return {
      ajuste: Math.max(-AJUSTE_MAXIMO, Math.min(AJUSTE_MAXIMO, c.ajuste)),
      medido: typeof c.medido === "number" ? c.medido : null,
      dicho: typeof c.dicho === "number" ? c.dicho : null,
      cuando: typeof c.cuando === "number" ? c.cuando : 0,
    };
  } catch {
    return null;
  }
}

export function guardarCalibracion(c: Calibracion | null) {
  try {
    if (c) localStorage.setItem(CLAVE, JSON.stringify(c));
    else localStorage.removeItem(CLAVE);
  } catch {
    /* sin almacenamiento */
  }
}

/** Lo que hay que sumar al retraso del navegador al cuadrar una toma (segundos; 0 sin calibrar). */
export const ajusteRetraso = (): number => leerCalibracion()?.ajuste ?? 0;

// ---------- La prueba ----------
/** Cuándo suena cada clic (segundos): a intervalos distintos, para no confundir uno con otro. El
 *  primero, casi un segundo después de arrancar: al empezar a sonar se puede perder el principio
 *  (los cascos Bluetooth, sobre todo, tardan en despertar). */
export const CLICS = [0.9, 1.25, 1.75, 2.1, 2.6, 3.05];
const DURACION = 3.5;
const CLIC_MS = 6;

/** La «canción» de la prueba: un tono corto y seco de 2 kHz en cada clic (Int16 estéreo intercalado). */
export function pistaDeClics(frecuencia = FRECUENCIA): Int16Array {
  const s = new Int16Array(Math.round(DURACION * frecuencia) * 2);
  const largo = Math.round((CLIC_MS / 1000) * frecuencia);
  for (const t of CLICS) {
    const a = Math.round(t * frecuencia);
    for (let i = 0; i < largo; i++) {
      // Entra de golpe (para ver bien dónde empieza) y se apaga suave
      const v = Math.round(26000 * Math.sin((2 * Math.PI * 2000 * i) / frecuencia) * (1 - i / largo));
      s[(a + i) * 2] = v;
      s[(a + i) * 2 + 1] = v;
    }
  }
  return s;
}

/**
 * Cuánto tardan los clics en aparecer en lo grabado (segundos), o null si no se oyen bien.
 * `muestras`: lo grabado, intercalado (izquierda, derecha…), desde que se empezó a grabar.
 *  1) Se deja solo lo que hay alrededor de los 2 kHz del clic (fuera zumbidos y casi todo el ruido)
 *     y se saca el volumen de cada milisegundo.
 *  2) Se busca el retraso (de 0 a 1 s) con el que mejor caen todos los clics a la vez.
 *  3) En cada clic se mira dónde empieza de verdad (muestra a muestra) y se queda la mediana.
 */
export function medirRetraso(muestras: Float32Array, frecuencia: number, clics: number[] = CLICS): { retraso: number; oidos: number } | null {
  const n = muestras.length >> 1;
  if (n < frecuencia) return null;
  // En mono, por un filtro paso banda en los 2 kHz del clic
  const x = new Float32Array(n);
  const w0 = (2 * Math.PI * 2000) / frecuencia;
  const alfa = Math.sin(w0) / (2 * 1.5);
  const b0 = alfa / (1 + alfa);
  const a1 = (-2 * Math.cos(w0)) / (1 + alfa);
  const a2 = (1 - alfa) / (1 + alfa);
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < n; i++) {
    const m = (muestras[2 * i] + muestras[2 * i + 1]) / 2;
    const y = b0 * (m - x2) - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = m;
    y2 = y1;
    y1 = y;
    x[i] = Math.abs(y);
  }
  const porMs = frecuencia / 1000;
  const M = Math.floor(n / porMs);
  const env = new Float32Array(M);
  for (let k = 0; k < M; k++) {
    let v = 0;
    const fin = Math.min(n, Math.floor((k + 1) * porMs));
    for (let i = Math.floor(k * porMs); i < fin; i++) if (x[i] > v) v = x[i];
    env[k] = v;
  }
  const orden = Float32Array.from(env).sort();
  const suelo = orden[M >> 1] + 1e-6;
  // 2) El retraso con el que mejor caen todos (cada clic, lo más fuerte de sus 8 ms)
  let mejor = -1;
  let valor = 0;
  for (let L = 0; L <= 1000; L++) {
    let suma = 0;
    for (const t of clics) {
      const k0 = Math.round(t * 1000) + L;
      let v = 0;
      for (let k = k0; k < k0 + 8 && k < M; k++) if (env[k] > v) v = env[k];
      // Que un solo golpe fuerte (una palmada) no gane a los clics flojos
      suma += Math.min(v, 30 * suelo);
    }
    if (suma > valor) {
      valor = suma;
      mejor = L;
    }
  }
  if (mejor < 0) return null;
  // 3) Dónde empieza cada clic: la primera muestra que llega a un tercio de su pico
  const retrasos: number[] = [];
  for (const t of clics) {
    const centro = Math.round((t + mejor / 1000) * frecuencia);
    const a = Math.max(0, centro - Math.round(0.015 * frecuencia));
    const b = Math.min(n, centro + Math.round(0.025 * frecuencia));
    let pico = 0;
    for (let i = a; i < b; i++) if (x[i] > pico) pico = x[i];
    if (pico < 6 * suelo) continue; // este no se oye sobre el ruido
    for (let i = a; i < b; i++) {
      if (x[i] >= pico / 3) {
        retrasos.push(i / frecuencia - t);
        break;
      }
    }
  }
  if (retrasos.length < 5) return null;
  retrasos.sort((p, q) => p - q);
  const mediana = retrasos[retrasos.length >> 1];
  // Que cuadren entre sí: si cada clic dice una cosa, no era la prueba lo que se oía
  const juntos = retrasos.filter((r) => Math.abs(r - mediana) < 0.006).length;
  if (juntos < 5) return null;
  return { retraso: mediana, oidos: juntos };
}

const esperar = (ms: number) => new Promise<void>((ok) => setTimeout(ok, ms));

/**
 * Hace la prueba (unos 10 s). Hay que llamarla desde un toque y con las entradas encendidas. Mientras
 * dura, las entradas van sin efectos y sin oírte (si no, con altavoz, se acoplaría); al acabar hay
 * que volver a poner los ajustes de la Mesa (`mesa.aplicar`). No guarda nada: devuelve lo medido.
 */
export async function calibrar(): Promise<Calibracion> {
  if (mesa.estado !== "encendida") throw new Error("Enciende antes las entradas.");
  if (mesa.grabando) throw new Error("Para antes la grabación.");
  const r = new Reproductor();
  r.desbloquear(); // el sonido se arranca dentro del toque (lo pide el iPhone)
  const oia = mesa.oyendose;
  const clics = pistaDeClics();
  const frames = clics.length >> 1;
  const neutro = { ...AJUSTES_PISTA, ganancia: 0, volumen: 1, panorama: 0, silencio: false };
  const sinEfectos: AjustesMesa = { ...leerAjustesMesa(), canales: [neutro, neutro], maestros: MAESTROS_INICIALES, equipos: [null, null] };
  try {
    mesa.oirse(false);
    mesa.aplicar(sinEfectos);
    await r.cargar([clics, ...Array.from({ length: 5 }, () => new Int16Array(frames * 2))], frames, [1, 0, 0, 0, 0, 0]);
    r.aplicarPista(0, AJUSTES_PISTA);
    r.volumenGeneral(1);
    // Una pasada, igual que al grabar con una canción: primero se pone a grabar y luego suena
    const pasada = async (): Promise<number | null> => {
      r.ir(0);
      if (!(await mesa.empezarToma())) throw new Error("No se ha podido empezar a grabar.");
      await r.tocar();
      await esperar(DURACION * 1000 + 800);
      r.pausar();
      const datos = await mesa.pararToma();
      return datos ? (medirRetraso(datos.muestras, datos.frecuencia)?.retraso ?? null) : null;
    };
    const sinOir = "No he oído bien los clics. Sube el volumen, acerca un auricular al micrófono (o usa el altavoz) y prueba otra vez en silencio.";
    // Dos pasadas que se oigan (una que no se oiga se repite; con dos seguidas sin oír nada, se deja)
    const medidas: number[] = [];
    for (let intento = 0; intento < 3 && medidas.length < 2; intento++) {
      const m = await pasada();
      if (m !== null) medidas.push(m);
      else if (intento === 1 && medidas.length === 0) break;
    }
    if (medidas.length === 0) throw new Error(sinOir);
    let medido = Math.min(...medidas);
    if (medidas.length === 2 && Math.abs(medidas[0] - medidas[1]) > 0.03) {
      // No cuadran entre sí: una más, y la de en medio
      const c = await pasada();
      if (c !== null) medido = [...medidas, c].sort((p, q) => p - q)[1];
    }
    const dicho = r.retrasoSalida() + mesa.retrasoEntrada();
    const ajuste = medido - dicho;
    if (Math.abs(ajuste) > AJUSTE_MAXIMO) throw new Error("La medida sale muy rara. Prueba otra vez en silencio.");
    return { ajuste, medido, dicho, cuando: Date.now() };
  } finally {
    if (mesa.grabando) await mesa.pararToma().catch(() => null);
    mesa.oirse(oia);
    await r.cerrar().catch(() => undefined);
  }
}
