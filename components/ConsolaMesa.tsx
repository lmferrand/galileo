"use client";

// La consola de la Mesa, dibujada como la mesa de mezclas de la foto del estudio: una tira por
// canal (ganancia en rojo, agudos y graves en azul, panorama en amarillo, la tecla naranja de
// silencio y el fader) y la sección general (pantalla, encender y fader rojo). La pantalla enseña
// el mando que mueves. Los efectos de cada canal se abren en una hoja.
// Canales 1 y 2: las entradas de la interfaz (lib/mesa/mesa, sigue sonando con la consola
// cerrada). Desde Pistas, además, las 6 pistas de la canción (canales 3 a 8): su volumen y su
// silencio son los del reproductor; sus efectos, los de su canal en lib/pistas/reproductor.
// Si no caben, los canales se deslizan de lado y la sección general se queda a la derecha.

import { useEffect, useRef, useState, type CSSProperties } from "react";
import EfectosMesa, { dB, efectosActivos } from "./EfectosMesa";
import { verDb } from "@/lib/mesa/curva";
import { Fader, Perilla } from "./MandosMesa";
import TransporteMesa, { type Transporte } from "./TransporteMesa";
import {
  AJUSTES_INICIALES,
  AJUSTES_PISTA,
  guardarAjustesMesa,
  guardarAjustesPistas,
  leerAjustesMesa,
  leerAjustesPistas,
  type AjustesCanal,
  type AjustesMesa,
} from "@/lib/mesa/ajustes";
import { mesa } from "@/lib/mesa/mesa";
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
  /** Ecualizador, efectos y panorama de una pista */
  aplicar: (i: number, a: AjustesCanal) => void;
  volumenGeneral: (v: number) => void;
  niveles: () => { pistas: number[]; general: number };
}

const panorama = (v: number) => (Math.abs(v) < 0.03 ? "Centro" : v < 0 ? `Izq. ${Math.round(-v * 100)}` : `Der. ${Math.round(v * 100)}`);
const LECTURA_MS = 1400;

type Abierta = { tipo: "entrada" | "pista"; i: number };

interface PropsTira {
  nombre: string;
  /** «la entrada 1», «la voz»… */
  titulo: string;
  pista?: boolean;
  sinEntrada?: boolean;
  c: AjustesCanal;
  ganancia: { min: number; max: number; porDefecto: number };
  volumen: number;
  silencio: boolean;
  solo: boolean;
  nFx: number;
  onCanal: (f: (c: AjustesCanal) => AjustesCanal) => void;
  onVolumen: (v: number) => void;
  onSilencio: () => void;
  onSolo: () => void;
  onEfectos: () => void;
  leer: (texto: string) => void;
  medidor: (el: HTMLSpanElement | null) => void;
}

function Tira({ nombre, titulo, pista, sinEntrada, c, ganancia, volumen, silencio, solo, nFx, onCanal, onVolumen, onSilencio, onSolo, onEfectos, leer, medidor }: PropsTira) {
  const ecualizar = (banda: "agudos" | "graves", v: number) => {
    onCanal((x) => ({ ...x, ecualizador: { ...x.ecualizador, activo: true, [banda]: v } }));
    leer(`${banda === "agudos" ? "Agudos" : "Graves"} ${dB(v)}`);
  };
  return (
    <section className={`tira${pista ? " tira-pista" : ""}${sinEntrada ? " sin-entrada" : ""}`} aria-label={nombre}>
      <div className="tira-cabeza">
        <span className="tira-nombre">{sinEntrada ? "Sin entrada 2" : nombre}</span>
        <button type="button" className={`tira-fx${nFx ? " con" : ""}`} onClick={onEfectos} aria-label={`Efectos de ${titulo}: ${nFx} encendidos`}>
          Efectos{nFx > 0 && <span className="tira-fx-n">{nFx}</span>}
        </button>
      </div>
      <div className="tira-perillas">
        <Perilla
          color="rojo"
          nombre={`Ganancia de ${titulo}`}
          etiqueta="Ganancia"
          valor={c.ganancia}
          min={ganancia.min}
          max={ganancia.max}
          paso={1}
          porDefecto={ganancia.porDefecto}
          ver={dB}
          onCambio={(ganancia) => {
            onCanal((x) => ({ ...x, ganancia }));
            leer(`Ganancia ${dB(ganancia)}`);
          }}
        />
        <Perilla color="azul" nombre={`Agudos de ${titulo}`} etiqueta="Agudos" valor={c.ecualizador.agudos} min={-12} max={12} paso={1} porDefecto={0} ver={dB} onCambio={(v) => ecualizar("agudos", v)} />
        <Perilla color="azul" nombre={`Graves de ${titulo}`} etiqueta="Graves" valor={c.ecualizador.graves} min={-12} max={12} paso={1} porDefecto={0} ver={dB} onCambio={(v) => ecualizar("graves", v)} />
        <Perilla
          color="amarillo"
          nombre={`Panorama de ${titulo}`}
          etiqueta="Pan"
          valor={c.panorama}
          min={-1}
          max={1}
          paso={0.05}
          porDefecto={0}
          ver={panorama}
          onCambio={(v) => {
            onCanal((x) => ({ ...x, panorama: v }));
            leer(`Panorama ${panorama(v)}`);
          }}
        />
      </div>
      <div className="tira-tecla">
        <div className="tecla-con-nombre">
          <button
            type="button"
            className={`tecla${silencio ? " on" : ""}`}
            aria-pressed={silencio}
            aria-label={`Silenciar ${titulo}`}
            onClick={() => {
              onSilencio();
              leer(silencio ? "Suena" : "En silencio");
            }}
          />
          <span className="mando-nombre" aria-hidden="true">
            Silencio
          </span>
        </div>
        <div className="tecla-con-nombre">
          <button
            type="button"
            className={`tecla tecla-solo${solo ? " on" : ""}`}
            aria-pressed={solo}
            aria-label={`Solo ${titulo}`}
            onClick={() => {
              onSolo();
              leer(solo ? "Sin solo" : "Solo");
            }}
          />
          <span className="mando-nombre" aria-hidden="true">
            Solo
          </span>
        </div>
      </div>
      <div className="tira-fader">
        <Fader
          nombre={`Volumen de ${titulo}`}
          valor={volumen}
          onCambio={(v) => {
            onVolumen(v);
            leer(`Volumen ${verDb(v)}`);
          }}
        />
        <span className="led" ref={medidor} aria-hidden="true" />
      </div>
    </section>
  );
}

export default function ConsolaMesa({ pistas }: { pistas?: PistasMesa }) {
  const hidratado = useHidratado();
  const estado = useEstadoMesa();
  const n = pistas?.nombres.length ?? 0;
  const [cambiados, setAjustes] = useState<AjustesMesa | null>(null);
  const [pistasCambiadas, setAjustesPistas] = useState<AjustesCanal[] | null>(null);
  const [retraso, setRetraso] = useState<number | null>(null);
  const [abierta, setAbierta] = useState<Abierta | null>(null);
  // «Solo» de las entradas (el de las pistas es el del reproductor). No se guarda: es para oír algo un momento.
  const [soloEntradas, setSoloEntradas] = useState<[boolean, boolean]>([false, false]);
  const soloEnEntradas = soloEntradas[0] || soloEntradas[1];
  const algunSolo = soloEnEntradas || (pistas?.solo.some(Boolean) ?? false);
  const [lectura, setLectura] = useState<{ donde: string; texto: string } | null>(null);
  const tLectura = useRef<ReturnType<typeof setTimeout> | null>(null);
  const medidores = useRef<(HTMLSpanElement | null)[]>([]);
  const ledGeneral = useRef<HTMLSpanElement | null>(null);
  const ultimasPistas = useRef(pistas);
  const ajustes = cambiados ?? (hidratado ? leerAjustesMesa() : AJUSTES_INICIALES);
  const ajustesPistas = pistasCambiadas ?? (hidratado ? leerAjustesPistas(n) : Array.from({ length: n }, () => AJUSTES_PISTA));
  const encendida = estado === "encendida";

  useEffect(() => {
    ultimasPistas.current = pistas;
  });

  // A la Mesa le llega cada entrada callada si hay algún «Solo» y ella no lo tiene
  const conSolo = (a: AjustesMesa): AjustesMesa => ({
    ...a,
    canales: a.canales.map((c, i) => ({ ...c, silencio: c.silencio || (algunSolo && !soloEntradas[i]) })) as AjustesMesa["canales"],
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
    pistas?.aplicar(i, lista[i]);
  };
  // La pantalla enseña el mando que se mueve y, al rato, vuelve a lo suyo
  const leer = (donde: string, texto: string) => {
    setLectura({ donde, texto });
    if (tLectura.current) clearTimeout(tLectura.current);
    tLectura.current = setTimeout(() => setLectura(null), LECTURA_MS);
  };
  useEffect(() => () => void (tLectura.current && clearTimeout(tLectura.current)), []);

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
    if (encendida) return mesa.apagar();
    const r = await mesa.encender(conSolo(ajustes));
    if (r === "encendida") setRetraso(mesa.retrasoMs());
  };

  // Los medidores, sin pasar por React: las entradas si la Mesa está encendida y las pistas siempre
  const conPistas = n > 0;
  useEffect(() => {
    if (!encendida && !conPistas) return;
    const luces = medidores.current;
    const general = ledGeneral.current;
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
    };
    bucle();
    const volver = () => void mesa.reanudar();
    document.addEventListener("visibilitychange", volver);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", volver);
      [...luces, general].forEach((el) => el?.style.setProperty("--nivel", "0%"));
    };
  }, [encendida, conPistas]);

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

  const tituloHoja = abierta ? (abierta.tipo === "entrada" ? `la entrada ${abierta.i + 1}` : (pistas?.conArticulo[abierta.i] ?? "")) : "";

  return (
    <div className={`consola${pistas ? " con-transporte" : ""}`}>
      <div className="consola-chasis">
        <span className="consola-madera" aria-hidden="true" />
        <div className="consola-desliza">
          <div className="consola-panel" style={{ "--canales": 2 + n } as CSSProperties}>
            {([0, 1] as const).map((i) => {
              const c = ajustes.canales[i];
              const nombre = `Entrada ${i + 1}`;
              return (
                <Tira
                  key={`e${i}`}
                  nombre={nombre}
                  titulo={`la entrada ${i + 1}`}
                  sinEntrada={encendida && mesa.entradas < 2 && i === 1}
                  c={c}
                  ganancia={{ min: -20, max: 20, porDefecto: 0 }}
                  volumen={c.volumen}
                  silencio={c.silencio}
                  solo={soloEntradas[i]}
                  nFx={efectosActivos(c)}
                  onCanal={(f) => cambiarEntrada(i, f)}
                  onVolumen={(volumen) => cambiarEntrada(i, (x) => ({ ...x, volumen }))}
                  onSilencio={() => cambiarEntrada(i, (x) => ({ ...x, silencio: !x.silencio }))}
                  onSolo={() => setSoloEntradas((s) => (i === 0 ? [!s[0], s[1]] : [s[0], !s[1]]))}
                  onEfectos={() => setAbierta({ tipo: "entrada", i })}
                  leer={(t) => leer(nombre, t)}
                  medidor={(el) => void (medidores.current[i] = el)}
                />
              );
            })}

            {pistas?.nombres.map((nombre, i) => (
              <Tira
                key={`p${i}`}
                nombre={nombre}
                titulo={pistas.conArticulo[i]}
                pista
                c={ajustesPistas[i]}
                ganancia={{ min: -12, max: 12, porDefecto: 0 }}
                volumen={pistas.volumen[i] * pistas.volumen[i]}
                silencio={pistas.silencio[i]}
                solo={pistas.solo[i]}
                nFx={efectosActivos(ajustesPistas[i], true)}
                onCanal={(f) => cambiarPista(i, f)}
                onVolumen={(a) => pistas.onVolumen(i, Math.sqrt(a))}
                onSilencio={() => pistas.onSilencio(i)}
                onSolo={() => pistas.onSolo(i)}
                onEfectos={() => setAbierta({ tipo: "pista", i })}
                leer={(t) => leer(nombre, t)}
                medidor={(el) => void (medidores.current[2 + i] = el)}
              />
            ))}

            <section className="tira tira-general" aria-label="General">
              <div className="general-arriba">
                <div className="pantalla" role="status">
                  {lectura ? (
                    <>
                      <span className="pantalla-donde">{lectura.donde}</span>
                      <span className="pantalla-valor">{lectura.texto}</span>
                    </>
                  ) : (
                    <>
                      <span className="pantalla-marca">
                        <small>The</small> Clavija
                      </span>
                      <span className="pantalla-estado">{estadoTexto}</span>
                      {encendida && retraso !== null && <span className="pantalla-estado">Retraso ≈ {retraso} ms</span>}
                    </>
                  )}
                </div>
                <span className="led led-general" ref={ledGeneral} aria-hidden="true" />
              </div>
              <div className="tira-tecla">
                <div className="tecla-con-nombre">
                <button
                  type="button"
                  className={`tecla tecla-encender${encendida ? " on" : ""}`}
                  aria-pressed={encendida}
                  aria-label={encendida ? "Apagar las entradas de la Mesa" : "Encender las entradas de la Mesa"}
                  disabled={estado === "abriendo"}
                  onClick={() => void encender()}
                >
                  <svg viewBox="0 0 24 24" aria-hidden="true">
                    <path d="M12 3v8M7.1 6.3a7 7 0 1 0 9.8 0" />
                  </svg>
                </button>
                <span className="mando-nombre" aria-hidden="true">
                  {encendida ? "Apagar" : "Encender"}
                </span>
                </div>
              </div>
              <div className="tira-fader">
                <Fader
                  rojo
                  nombre="Volumen general"
                  valor={ajustes.general}
                  onCambio={(general) => {
                    cambiar({ ...ajustes, general });
                    pistas?.volumenGeneral(general);
                    leer("General", `Volumen ${verDb(general)}`);
                  }}
                />
              </div>
            </section>
          </div>
        </div>
        <span className="consola-madera" aria-hidden="true" />
      </div>

      {pistas && <TransporteMesa t={pistas.transporte} />}

      {!encendida && <p className="consola-nota">Con cascos en la interfaz: por el altavoz se acopla. La entrada se elige en Ajustes.</p>}

      {abierta !== null && (
        <div className="hoja-fondo" onClick={() => setAbierta(null)}>
          <div className="hoja" role="dialog" aria-modal="true" aria-label={`Efectos de ${tituloHoja}`} onClick={(e) => e.stopPropagation()}>
            <div className="hoja-asa" aria-hidden="true" />
            <header className="hoja-cabecera">
              <h2>Efectos de {tituloHoja}</h2>
              <button type="button" className="boton-texto" onClick={() => setAbierta(null)}>
                Listo
              </button>
            </header>
            <div className="hoja-cuerpo mesa-hoja">
              {abierta.tipo === "entrada" ? (
                <EfectosMesa canal={ajustes.canales[abierta.i]} onCambio={(f) => cambiarEntrada(abierta.i, f)} />
              ) : (
                <EfectosMesa canal={ajustesPistas[abierta.i]} onCambio={(f) => cambiarPista(abierta.i, f)} sinPuerta />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
