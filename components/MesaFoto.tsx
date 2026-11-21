"use client";

// La mesa de mezclas de la foto (public/mesa/consola.webp, 1752×897), con sus mandos de verdad
// encima. De la foto se quitaron las ruedas de los canales y los faders: aquí se dibujan alineados
// con sus nombres (TRIM, LOW, HIGH, COMP, PAN, REV, DELAY) y con la escala en dB de la app.
// Las teclas (la roja, SOLO y SELECT) y las ruedas de la sección MASTER son las de la foto, con su
// estado pintado encima. Todo va en píxeles de la foto; la caja entera se escala (`escala`).
//
// Canales de la foto: INPUT 1 y 2 (las entradas de la interfaz) y VOCALS, DRUMS, BASS, GUITAR,
// PIANO y OTHER (las pistas de la canción, si se entra desde Pistas).

import type { CSSProperties, ReactNode } from "react";
import { pct, dB } from "./EfectosMesa";
import { accesible, useArrastre, type PropsMando } from "./MandosMesa";
import { amplitudDePos, MARCAS, POS_CERO, posDeAmplitud, posDeDb, verDb } from "@/lib/mesa/curva";
import { MAESTRO_DB, type AjustesCanal, type Maestros } from "@/lib/mesa/ajustes";

export const ANCHO_MESA = 1752;
export const ALTO_MESA = 897;
/** Lo útil de la mesa, sin el marco de madera: lo que la vista del móvil ajusta a la pantalla (ConsolaMesa) */
export const ZONA_MESA = { x: 60, w: 1640, h: 792 };
/** El bisel de arriba, sobre los rótulos: no tiene mandos */
export const BISEL_MESA = 38;

// ---------- Medidas de la foto ----------
/** Altura de cada nombre (TRIM … DELAY): ahí va su rueda */
const FILAS = [127, 175.7, 224.4, 273.1, 321.8, 370.5, 419.2];
const ALTO_FILA = 48.7;
/** Columna de las ruedas de cada canal, arriba (y = 119) y abajo (y = 398): la foto tiene perspectiva */
const COLUMNA_ARRIBA = [248.5, 411.3, 568.4, 729.1, 883.3, 1037.9, 1189.2, 1348.9];
const COLUMNA_ABAJO = [238.4, 404.7, 567.7, 730.4, 887.9, 1046.4, 1208.3, 1366.7];
const columna = (canal: number, y: number) => COLUMNA_ARRIBA[canal] + ((COLUMNA_ABAJO[canal] - COLUMNA_ARRIBA[canal]) * (y - 119)) / 279;
/** Diámetro de la tapa de las ruedas de los canales; la tapa va algo por encima del nombre */
const TAPA = 25;
const SUBE_TAPA = 5;

type Caja = [number, number, number, number];
const ROJAS: Caja[] = [
  [122, 465, 35, 38], [299, 465, 32, 38], [464, 465, 30, 38], [627, 465, 30, 38],
  [787, 465, 29, 38], [943, 465, 30, 38], [1103, 465, 30, 38], [1261, 465, 31, 38],
];
const SOLOS: Caja[] = [
  [161, 465, 52, 37], [336, 465, 46, 37], [500, 465, 45, 37], [662, 465, 46, 37],
  [822, 465, 44, 37], [979, 465, 44, 37], [1139, 465, 45, 37], [1297, 465, 46, 37],
];
const SELECTS: Caja[] = [
  [218, 465, 55, 37], [388, 465, 50, 37], [551, 465, 50, 37], [714, 465, 49, 37],
  [871, 465, 49, 37], [1029, 465, 49, 37], [1189, 465, 50, 37], [1347, 465, 50, 37],
];

/** Los faders: centro de la ranura, dónde empieza y acaba, y el recorrido del centro de la tapa */
interface Carril {
  x: number;
  ranura: [number, number];
  arriba: number;
  abajo: number;
}
const CARRILES: Carril[] = [195, 366, 529, 691, 848, 1009, 1170, 1329].map((x) => ({ x, ranura: [522, 756], arriba: 548, abajo: 728 }));
const CARRIL_MAESTRO: Carril = { x: 1543, ranura: [476, 756], arriba: 505, abajo: 728 };
const TAPA_FADER = { ancho: 48, alto: 74 };

/** Las ruedas de la sección general (las de la foto: se pinta encima una tapa que gira) */
const RUEDAS_MAESTRAS: { clave: keyof Maestros; x: number; y: number; d: number; color: Color; nombre: string; corto: string }[] = [
  { clave: "cancion", x: 1472.3, y: 151.5, d: 64, color: "plata", nombre: "Volumen de la canción (MASTER)", corto: "Canción" },
  { clave: "monitor", x: 1591.5, y: 151, d: 64, color: "plata", nombre: "Volumen de lo que tocas (MONITOR)", corto: "Lo que tocas" },
  { clave: "reverb", x: 1476.7, y: 257.3, d: 41, color: "azul", nombre: "Reverb de todos los canales (REV MASTER)", corto: "Reverb general" },
  { clave: "delay", x: 1596.7, y: 257.3, d: 41, color: "azul", nombre: "Delay de todos los canales (DELAY MASTER)", corto: "Delay general" },
];

/** Los rótulos INPUT 1 e INPUT 2: encienden las entradas de la interfaz */
const PLACAS: Caja[] = [
  [158, 46, 132, 40],
  [317, 46, 129, 40],
];

/** Cada tira, de su rótulo a sus ruedas: en el móvil, tocarla abre el canal en grande */
const TIRAS: Caja[] = [
  [76, 40, 222, 420], [300, 40, 156, 420], [458, 40, 155, 420], [615, 40, 158, 420],
  [775, 40, 154, 420], [931, 40, 158, 420], [1091, 40, 158, 420], [1251, 40, 157, 420],
];

/** Las tiras, para taparlas cuando no tienen nada (sin entrada 2, sin canción) */
const TIRA_2: Caja = [300, 40, 156, 745];
const TIRAS_PISTAS: Caja = [458, 40, 951, 745];

type Color = "plata" | "azul" | "rojo";

// ---------- Lo que no cambia: las marcas de las ruedas y las escalas de los faders ----------
/** 11 rayitas de −135° a +135° alrededor de cada rueda (como en la foto) */
function marcasRueda(cx: number, cy: number, r1: number, r2: number) {
  let d = "";
  for (let k = 0; k <= 10; k++) {
    const a = ((-135 + 27 * k) * Math.PI) / 180;
    const s = Math.sin(a);
    const c = -Math.cos(a) * 0.9;
    d += `M${(cx + r1 * s).toFixed(1)} ${(cy + r1 * c).toFixed(1)}L${(cx + r2 * s).toFixed(1)} ${(cy + r2 * c).toFixed(1)}`;
  }
  return d;
}
const MARCAS_RUEDAS = COLUMNA_ARRIBA.flatMap((_, canal) => FILAS.map((y) => marcasRueda(columna(canal, y), y, 23.5, 27.5))).join("");

const yDe = (c: Carril, pos: number) => c.abajo - pos * (c.abajo - c.arriba);
function escalaDe(c: Carril) {
  let rayas = "";
  const textos: { y: number; texto: string; cero: boolean }[] = [];
  for (const m of MARCAS) {
    const y = yDe(c, posDeDb(m.db));
    const cero = m.db === 0;
    rayas += `M${c.x - (cero ? 40 : 34)} ${y}H${c.x - 13}M${c.x + 13} ${y}H${c.x + (cero ? 32 : 26)}`;
    textos.push({ y, texto: m.texto, cero });
  }
  return { rayas, textos };
}
const ESCALAS = [...CARRILES, CARRIL_MAESTRO].map((c) => ({ c, ...escalaDe(c) }));

// ---------- Piezas ----------
function Rueda({ x, y, d, color, frac, falda }: { x: number; y: number; d: number; color: Color; frac: number; falda?: boolean }) {
  return (
    <span className={`mf-rueda mf-${color}`} style={{ left: x, top: y, "--d": `${d}px`, "--giro": `${-135 + 270 * frac}deg` } as CSSProperties} aria-hidden="true">
      {falda && <span className="mf-falda" />}
      <span className="mf-tapa">
        <span className="mf-raya" />
      </span>
    </span>
  );
}

/** Rueda de un canal: se coge por su nombre o por la rueda y se mueve arrastrando arriba y abajo */
function RuedaCanal({ canal, fila, color, p }: { canal: number; fila: number; color: Color; p: PropsMando }) {
  const manejo = useArrastre(p, () => 150);
  const y = FILAS[fila];
  const x = columna(canal, y);
  const frac = (p.valor - p.min) / (p.max - p.min);
  return (
    <div className="mf-mando mf-mando-rueda" style={{ left: x - 100, top: y - ALTO_FILA / 2, width: 136, height: ALTO_FILA, zIndex: 10 - fila }} {...accesible(p)} {...manejo}>
      <Rueda x={100} y={ALTO_FILA / 2 - SUBE_TAPA} d={TAPA} color={color} frac={frac} falda />
    </div>
  );
}

function RuedaMaestra({ r, p }: { r: (typeof RUEDAS_MAESTRAS)[number]; p: PropsMando }) {
  const manejo = useArrastre(p, () => 150);
  const caja = r.d + 30;
  const frac = (p.valor - p.min) / (p.max - p.min);
  return (
    <div className="mf-mando mf-mando-rueda" style={{ left: r.x - caja / 2, top: r.y - caja / 2, width: caja, height: caja }} {...accesible(p)} {...manejo}>
      <Rueda x={caja / 2} y={caja / 2} d={r.d} color={r.color} frac={frac} />
    </div>
  );
}

function FaderFoto({ c, nombre, valor, onCambio, medidor, desactivado }: { c: Carril; nombre: string; valor: number; onCambio: (v: number) => void; /** Para encontrar su luz de nivel (data-medidor) */ medidor: string; desactivado?: boolean }) {
  const pos = posDeAmplitud(valor);
  const p: PropsMando = {
    nombre,
    valor: pos,
    min: 0,
    max: 1,
    paso: 0.005,
    porDefecto: POS_CERO,
    ver: () => verDb(valor),
    onCambio: (v) => onCambio(amplitudDePos(v)),
    desactivado,
  };
  const arriba = c.ranura[0] - 14;
  const alto = c.ranura[1] - c.ranura[0] + 28;
  // El fader va pegado al dedo: el recorrido de la tapa tal como se ve en la pantalla (la mesa va
  // escalada y, en el móvil, además la vista se acerca y se aleja: se mide en el momento)
  const manejo = useArrastre(p, (el) => Math.max(40, (c.abajo - c.arriba) * (el.getBoundingClientRect().height / alto)));
  return (
    <div className="mf-mando mf-fader" style={{ left: c.x - 50, top: arriba, width: 128, height: alto }} {...accesible(p)} aria-valuetext={verDb(valor)} {...manejo}>
      <span className="mf-ranura" style={{ left: 50 - 7, top: 14, height: c.ranura[1] - c.ranura[0] }} aria-hidden="true">
        <span className="mf-luz" data-medidor={medidor} />
      </span>
      <span
        className="mf-tapa-fader"
        style={{ left: 50 - TAPA_FADER.ancho / 2, top: yDe(c, pos) - arriba - TAPA_FADER.alto / 2, width: TAPA_FADER.ancho, height: TAPA_FADER.alto }}
        aria-hidden="true"
      />
    </div>
  );
}

function Boton({ caja, clase, on, etiqueta, onClick, children }: { caja: Caja; clase: string; on: boolean; etiqueta: string; onClick: () => void; children?: ReactNode }) {
  const [x, y, w, h] = caja;
  return (
    <button type="button" className={`mf-boton ${clase}${on ? " on" : ""}`} style={{ left: x, top: y, width: w, height: h }} aria-pressed={on} aria-label={etiqueta} onClick={onClick}>
      {children}
    </button>
  );
}

// ---------- La mesa ----------
/** Un canal de la foto: sus 7 ruedas, sus tres teclas y su fader */
function CanalDeLaFoto({ i, k, leer }: { i: number; k: CanalFoto; leer: (donde: string, texto: string) => void }) {
  const leerAqui = (texto: string) => leer(k.nombre, texto);
  return (
    <div className="mf-canal" role="group" aria-label={k.nombre}>
      {ruedasDe(k, leerAqui).map((r, fila) => (
        <RuedaCanal key={fila} canal={i} fila={fila} color={r.color} p={r.p} />
      ))}
      <Boton
        caja={ROJAS[i]}
        clase="mf-roja"
        on={k.silencio}
        etiqueta={`Silenciar ${k.titulo}`}
        onClick={() => {
          k.onSilencio();
          leerAqui(k.silencio ? "Suena" : "En silencio");
        }}
      />
      <Boton
        caja={SOLOS[i]}
        clase="mf-ambar"
        on={k.solo}
        etiqueta={`Solo ${k.titulo}`}
        onClick={() => {
          k.onSolo();
          leerAqui(k.solo ? "Sin solo" : "Solo");
        }}
      />
      <Boton caja={SELECTS[i]} clase="mf-ambar" on={k.nFx > 0} etiqueta={`Efectos de ${k.titulo}: ${k.nFx} encendidos`} onClick={k.onEfectos} />
      <FaderFoto
        c={CARRILES[i]}
        nombre={`Volumen de ${k.titulo}`}
        valor={k.volumen}
        medidor={String(k.medidor)}
        onCambio={(v) => {
          k.onVolumen(v);
          leerAqui(`Volumen ${verDb(v)}`);
        }}
      />
    </div>
  );
}

export interface CanalFoto {
  /** «Entrada 1», «Voz»… */
  nombre: string;
  /** «la entrada 1», «la voz»… */
  titulo: string;
  c: AjustesCanal;
  ganancia: { min: number; max: number };
  volumen: number;
  silencio: boolean;
  solo: boolean;
  nFx: number;
  onCanal: (f: (c: AjustesCanal) => AjustesCanal) => void;
  onVolumen: (v: number) => void;
  onSilencio: () => void;
  onSolo: () => void;
  onEfectos: () => void;
  /** Su luz de nivel: 0 y 1 las entradas, 2… las pistas (orden de PISTAS) */
  medidor: number;
}

const panorama = (v: number) => (Math.abs(v) < 0.03 ? "Centro" : v < 0 ? `Izq. ${Math.round(-v * 100)}` : `Der. ${Math.round(v * 100)}`);
const conCero = (texto: string) => (v: number) => (v <= 0 ? texto : pct(v));

/** Las 7 ruedas de un canal, de arriba abajo, con lo que mueven (también las usa CanalGrande) */
export function ruedasDe(k: CanalFoto, leer: (texto: string) => void): { color: Color; p: PropsMando }[] {
  const c = k.c;
  const mando = (nombre: string, valor: number, min: number, max: number, paso: number, ver: (v: number) => string, poner: (x: AjustesCanal, v: number) => AjustesCanal): PropsMando => ({
    nombre: `${nombre} de ${k.titulo}`,
    valor,
    min,
    max,
    paso,
    porDefecto: Math.max(min, Math.min(max, 0)),
    ver,
    onCambio: (v) => {
      k.onCanal((x) => poner(x, v));
      leer(`${nombre} ${ver(v)}`);
    },
  });
  const efecto = (activo: boolean, v: number) => (activo ? v : 0);
  return [
    { color: "azul", p: mando("Ganancia", c.ganancia, k.ganancia.min, k.ganancia.max, 1, dB, (x, v) => ({ ...x, ganancia: v })) },
    { color: "plata", p: mando("Graves", c.ecualizador.graves, -12, 12, 1, dB, (x, v) => ({ ...x, ecualizador: { ...x.ecualizador, activo: true, graves: v } })) },
    { color: "plata", p: mando("Agudos", c.ecualizador.agudos, -12, 12, 1, dB, (x, v) => ({ ...x, ecualizador: { ...x.ecualizador, activo: true, agudos: v } })) },
    {
      color: "rojo",
      p: mando("Compresor", efecto(c.compresor.activo, c.compresor.cantidad), 0, 1, 0.05, conCero("apagado"), (x, v) => ({ ...x, compresor: { activo: v > 0, cantidad: v > 0 ? v : x.compresor.cantidad } })),
    },
    { color: "plata", p: mando("Panorama", c.panorama, -1, 1, 0.05, panorama, (x, v) => ({ ...x, panorama: v })) },
    {
      color: "plata",
      p: mando("Reverb", efecto(c.reverb.activo, c.reverb.mezcla), 0, 1, 0.02, conCero("apagada"), (x, v) => ({ ...x, reverb: { ...x.reverb, activo: v > 0, mezcla: v > 0 ? v : x.reverb.mezcla } })),
    },
    {
      color: "azul",
      p: mando("Delay", efecto(c.delay.activo, c.delay.mezcla), 0, 1, 0.02, conCero("apagado"), (x, v) => ({ ...x, delay: { ...x.delay, activo: v > 0, mezcla: v > 0 ? v : x.delay.mezcla } })),
    },
  ];
}

interface Props {
  escala: number;
  /** Los 8 canales de la foto, en su orden (los 6 de la canción llegan siempre: sin ella, en reposo) */
  canales: (CanalFoto | null)[];
  sinEntrada2: boolean;
  general: number;
  onGeneral: (v: number) => void;
  maestros: Maestros;
  onMaestros: (m: Maestros) => void;
  conCancion: boolean;
  /** Encender o apagar las entradas (los rótulos INPUT se iluminan) */
  entradas: { encendidas: boolean; ocupadas: boolean; onPulsar: () => void };
  /** En el móvil: tocar un canal (su rótulo o sus ruedas) lo abre en grande */
  alTocarCanal?: (i: number) => void;
  leer: (donde: string, texto: string) => void;
}

export default function MesaFoto({ escala, canales, sinEntrada2, general, onGeneral, maestros, onMaestros, conCancion, entradas, alTocarCanal, leer }: Props) {
  return (
    <div className="mf-caja" style={{ width: ANCHO_MESA * escala, height: ALTO_MESA * escala }}>
      <div className="mf" style={{ width: ANCHO_MESA, height: ALTO_MESA, transform: `scale(${escala})` }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="mf-foto" src="/mesa/consola.webp" alt="" width={ANCHO_MESA} height={ALTO_MESA} draggable={false} />
        <svg className="mf-dibujo" viewBox={`0 0 ${ANCHO_MESA} ${ALTO_MESA}`} aria-hidden="true">
          <path d={MARCAS_RUEDAS} className="mf-marcas" />
          {ESCALAS.map(({ c, rayas, textos }) => (
            <g key={c.x}>
              <path d={rayas} className="mf-marcas mf-marcas-fader" />
              {textos.map((t) => (
                <text key={t.texto} x={c.x + 36} y={t.y} className={`mf-numero${t.cero ? " cero" : ""}`} dominantBaseline="central">
                  {t.texto}
                </text>
              ))}
            </g>
          ))}
        </svg>

        {/* Las dos entradas */}
        {canales.slice(0, 2).map((k, i) => k && <CanalDeLaFoto key={i} i={i} k={k} leer={leer} />)}
        {/* Los seis canales de la canción están siempre (sin canción llegan en reposo): ocultos bajo su
            tapa y sin poder tocarse. Así, al poner la primera canción no hay que montarlos (salían los
            seis de golpe, en un solo fotograma): la tapa se va y ellos entran con un fundido. */}
        <div className={`mf-pistas${conCancion ? "" : " sin"}`} inert={!conCancion}>
          {canales.slice(2).map((k, j) => k && <CanalDeLaFoto key={j} i={j + 2} k={k} leer={leer} />)}
        </div>

        {PLACAS.map((c, i) => (
          <button
            key={i}
            type="button"
            className={`mf-placa${entradas.encendidas ? " on" : ""}`}
            style={enCaja(c)}
            aria-label={entradas.encendidas ? "Apagar las entradas de la interfaz" : "Encender las entradas de la interfaz"}
            aria-pressed={entradas.encendidas}
            disabled={entradas.ocupadas}
            onClick={entradas.onPulsar}
          />
        ))}

        {/* La sección general */}
        <div className="mf-canal" role="group" aria-label="General">
          {RUEDAS_MAESTRAS.map((r) => {
            const desactivado = r.clave === "cancion" && !conCancion;
            return (
              <RuedaMaestra
                key={r.clave}
                r={r}
                p={{
                  nombre: r.nombre,
                  valor: maestros[r.clave],
                  min: -MAESTRO_DB,
                  max: MAESTRO_DB,
                  paso: 1,
                  porDefecto: 0,
                  ver: dB,
                  desactivado,
                  onCambio: (v) => {
                    onMaestros({ ...maestros, [r.clave]: v });
                    leer("General", `${r.corto} ${dB(v)}`);
                  },
                }}
              />
            );
          })}
          <FaderFoto
            c={CARRIL_MAESTRO}
            nombre="Volumen general"
            valor={general}
            medidor="general"
            onCambio={(v) => {
              onGeneral(v);
              leer("General", `Volumen ${verDb(v)}`);
            }}
          />
        </div>

        {alTocarCanal &&
          canales.map((k, i) =>
            k && (i < 2 || conCancion) ? (
              <button key={i} type="button" className="mf-zona-canal" style={enCaja(TIRAS[i])} aria-label={`Abrir los mandos de ${k.titulo} en grande`} onClick={() => alTocarCanal(i)} />
            ) : null,
          )}

        {sinEntrada2 && (
          <div className="mf-tapado" style={enCaja(TIRA_2)}>
            <p>Sin entrada 2</p>
          </div>
        )}
        {/* La tapa de los canales de la canción: con canción se va con un fundido (y vuelve al quitarla) */}
        <div className={`mf-tapado de-pistas${conCancion ? " fuera" : ""}`} style={enCaja(TIRAS_PISTAS)} aria-hidden={conCancion}>
          <p>Aquí van las pistas de la canción: elígela en el selector de canciones de la grabadora</p>
        </div>
      </div>
    </div>
  );
}

const enCaja = ([x, y, w, h]: Caja): CSSProperties => ({ left: x, top: y, width: w, height: h });
