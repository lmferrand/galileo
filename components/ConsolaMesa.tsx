"use client";

// La consola de la Mesa: arriba, fija, la pantalla (encender las entradas y el mando que mueves)
// y, desde Pistas, el reproductor de la canción; abajo, la mesa de mezclas de la foto (MesaFoto),
// que se desliza con el dedo si no cabe. SELECT abre los efectos del canal en una hoja.
// Canales 1 y 2: las entradas de la interfaz (lib/mesa/mesa, sigue sonando con la consola
// cerrada). Desde Pistas, además, las 6 pistas de la canción (canales 3 a 8): su volumen y su
// silencio son los del reproductor; sus efectos, los de su canal en lib/pistas/reproductor.
// En el móvil de pie pide girarlo: la mesa necesita la pantalla tumbada.

import { useEffect, useRef, useState } from "react";
import EfectosMesa, { efectosActivos } from "./EfectosMesa";
import MesaFoto, { ALTO_MESA, ANCHO_MESA, type CanalFoto } from "./MesaFoto";
import TransporteMesa, { type Transporte } from "./TransporteMesa";
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
  const ultimasPistas = useRef(pistas);
  const ajustes =
    cambiados ?? (hidratado ? leerAjustesMesa() : AJUSTES_INICIALES);
  const ajustesPistas =
    pistasCambiadas ??
    (hidratado
      ? leerAjustesPistas(n)
      : Array.from({ length: n }, () => AJUSTES_PISTA));
  const encendida = estado === "encendida";

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
    if (encendida) return mesa.apagar();
    const r = await mesa.encender(conSolo(ajustes));
    if (r === "encendida") setRetraso(mesa.retrasoMs());
  };

  // Los medidores, sin pasar por React: las entradas si la Mesa está encendida y las pistas siempre
  const conPistas = n > 0;
  useEffect(() => {
    if (!encendida && !conPistas) return;
    // Las luces de nivel de la mesa (en la ranura de cada fader)
    const luz = (id: string) => abajo.current?.querySelector<HTMLSpanElement>(`[data-medidor="${id}"]`) ?? null;
    const luces = Array.from({ length: 8 }, (_, i) => luz(String(i)));
    const general = luz("general");
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
      [...luces, general].forEach((el) =>
        el?.style.setProperty("--nivel", "0%"),
      );
    };
  }, [encendida, conPistas]);

  // La mesa, lo más grande que quepa abajo; si así queda demasiado pequeña, más grande y se desliza
  const [escala, setEscala] = useState(0.5);
  useEffect(() => {
    const el = abajo.current;
    if (!el) return;
    const medir = () => {
      const cabe = Math.min(el.clientWidth / ANCHO_MESA, el.clientHeight / ALTO_MESA);
      const minimo = matchMedia("(pointer: coarse)").matches ? 0.5 : 0.42;
      setEscala(Math.min(1, Math.max(cabe, minimo)));
    };
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

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

  return (
    <div className="consola-foto">
      {/* Arriba, fija: la pantalla y, desde Pistas, el reproductor de la canción */}
      <div className="cf-arriba">
        <div className="cf-estado">
          <div className="pantalla cf-pantalla" role="status">
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
              {encendida ? "Apagar" : "Entradas"}
            </span>
          </div>
          {!encendida && <p className="cf-nota">Con cascos en la interfaz: por el altavoz se acopla. La entrada se elige en Ajustes.</p>}
        </div>
        {pistas && <TransporteMesa t={pistas.transporte} />}
      </div>

      {/* Abajo: la mesa de mezclas, que se desliza con el dedo */}
      <div className="cf-abajo" ref={abajo}>
        <MesaFoto
          escala={escala}
          canales={[entrada(0), entrada(1), ...PISTA_DE_CANAL.map(pista)]}
          sinEntrada2={encendida && mesa.entradas < 2}
          general={ajustes.general}
          onGeneral={(general) => cambiarGeneral({ ...ajustes, general })}
          maestros={ajustes.maestros}
          onMaestros={(maestros) => cambiarGeneral({ ...ajustes, maestros })}
          conCancion={conPistas}
          leer={leer}
        />
      </div>

      <div className="cf-girar" aria-live="polite">
        <svg viewBox="0 0 48 48" aria-hidden="true">
          <rect x="15" y="6" width="18" height="32" rx="3" />
          <path d="M8 30a16 16 0 0 0 16 12M40 18A16 16 0 0 0 24 6" />
        </svg>
        <p>Gira el móvil para usar la mesa</p>
      </div>

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
