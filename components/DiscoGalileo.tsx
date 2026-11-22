"use client";

// El disco de Galileo (lib/pistas/discoGalileo). El estuche que hay en el escritorio de la Mesa se
// toca y viene hacia ti; se abre por su bisagra, como uno de verdad, y dentro están el libreto con
// las canciones (a la izquierda, en la tapa) y el disco en su bandeja (a la derecha). Tocas una
// canción y se pone en la grabadora; si no la tienes en el aparato, antes se baja (el disco gira
// mientras tanto) y se queda en la carpeta «Galileo» del selector. Tocar fuera, Escape o «atrás»
// guardan el disco: el estuche se cierra y vuelve a su sitio.
//  - EstucheMesa: el botón del escritorio. En la foto del escritorio el estuche ya está pintado: el
//    botón va encima, transparente. Donde la foto no lo enseña (la tableta de pie) se pinta suelto.
//  - DiscoGalileo: el estuche abierto, a pantalla entera.
// La tapa gira en 3D mientras se abre y se cierra; ya abierta se deja plana: los toques sobre una
// cara girada fallan en algún iPhone. La canción elegida se entrega al acabar de cerrarse (poner
// otra canción puede volver a montar la Mesa, y el estuche se quedaría a medio camino).

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { preload } from "react-dom";
import type { CancionesPlaca } from "./PlacaCanciones";
import { pedirPersistencia } from "@/lib/pistas/almacen";
import { bajarTemaDisco, DISCO, idDisco, type TemaDisco } from "@/lib/pistas/discoGalileo";
import { formatoMB, formatoTiempo, type Cancion } from "@/lib/pistas/tipos";

/** El estuche cerrado, recortado de la foto del escritorio (528×468) */
const FOTO = "/mesa/disco-manana.webp";
/** Lo que tardan en abrirse y en cerrarse (como sus animaciones, en mesa.css) */
const ABRIR_MS = 820;
const CERRAR_MS = 520;

export interface Caja {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function EstucheMesa({
  sitio,
  entero,
  suelto,
  onAbrir,
}: {
  /** Lo que se toca (en píxeles de su capa): la parte del estuche que queda a la vista */
  sitio: Caja;
  /** El estuche entero, se vea o no: de ahí sale al abrirse */
  entero: Caja;
  /** La foto del escritorio no lo enseña: se pinta aquí */
  suelto: boolean;
  /** Dónde está en la pantalla en el momento de tocarlo */
  onAbrir: (origen: Caja) => void;
}) {
  preload(FOTO, { as: "image" });
  return (
    <button
      type="button"
      className={`estuche-mesa${suelto ? " suelto" : ""}`}
      style={{ left: sitio.x, top: sitio.y, width: sitio.w, height: sitio.h }}
      aria-label={`El disco «${DISCO.titulo}», de ${DISCO.artista}: ábrelo y elige una canción`}
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        const k = r.width / sitio.w;
        onAbrir({ x: r.left + (entero.x - sitio.x) * k, y: r.top + (entero.y - sitio.y) * k, w: entero.w * k, h: entero.h * k });
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {suelto && <img src={FOTO} alt="" draggable={false} />}
    </button>
  );
}

export default function DiscoGalileo({
  origen,
  canciones,
  onCerrar,
}: {
  /** El estuche del escritorio, en la pantalla: de ahí sale y ahí vuelve */
  origen: Caja;
  canciones: CancionesPlaca;
  /** Ya cerrado. Con canción: la que hay que poner en la grabadora */
  onCerrar: (poner?: Cancion) => void;
}) {
  const [fase, setFase] = useState<"abriendo" | "abierto" | "cerrando">("abriendo");
  const [bajando, setBajando] = useState<{ id: string; fraccion: number } | null>(null);
  const [fallo, setFallo] = useState<string | null>(null);
  const velo = useRef<HTMLDivElement>(null);
  const caja = useRef<HTMLDivElement>(null);
  const lista = useRef<HTMLOListElement>(null);
  const elegida = useRef<Cancion | undefined>(undefined);
  const vivo = useRef(true);
  useEffect(() => {
    vivo.current = true;
    return () => {
      vivo.current = false;
    };
  }, []);

  // De dónde sale (y a dónde vuelve): el estuche del escritorio, medido contra su sitio de abierto.
  // (Con offset*: sin contar lo que la animación lo tenga movido en ese momento.)
  useLayoutEffect(() => {
    const el = caja.current;
    const fondo = velo.current?.getBoundingClientRect();
    if (!el || !fondo) return;
    const dx = origen.x + origen.w / 2 - (fondo.left + el.offsetLeft + el.offsetWidth / 2);
    const dy = origen.y + origen.h / 2 - (fondo.top + el.offsetTop + el.offsetHeight / 2);
    el.style.setProperty("--dx", `${dx.toFixed(1)}px`);
    el.style.setProperty("--dy", `${dy.toFixed(1)}px`);
    el.style.setProperty("--s", (origen.w / el.offsetWidth).toFixed(4));
  }, [origen]);

  // Abierto del todo: la tapa queda plana y ya se puede tocar. Cerrado del todo: se avisa.
  useEffect(() => {
    if (fase === "abierto") {
      lista.current?.querySelector<HTMLButtonElement>("button:not(:disabled)")?.focus({ preventScroll: true });
      return;
    }
    const t = setTimeout(
      () => {
        if (fase === "abriendo") setFase("abierto");
        else onCerrar(elegida.current);
      },
      fase === "abriendo" ? ABRIR_MS : CERRAR_MS,
    );
    return () => clearTimeout(t);
    // (onCerrar cambia en cada pintado de la Mesa: el reloj no debe volver a empezar por eso)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fase]);

  const cerrar = (poner?: Cancion) => {
    if (fase !== "abierto") return;
    elegida.current = poner;
    setFase("cerrando");
  };
  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      setFase((f) => (f === "abierto" ? "cerrando" : f));
    };
    window.addEventListener("keydown", alTeclear, true);
    return () => window.removeEventListener("keydown", alTeclear, true);
  }, []);

  const tienes = useMemo(() => new Map(canciones.lista.map((c) => [c.id, c])), [canciones.lista]);
  const faltan = DISCO.temas.filter((t) => !t.pronto && !tienes.has(idDisco(t)));

  const poner = async (t: TemaDisco) => {
    const ya = tienes.get(idDisco(t));
    if (ya) return cerrar(ya.id === canciones.actual ? undefined : ya);
    if (bajando || t.pronto) return;
    setFallo(null);
    setBajando({ id: t.id, fraccion: 0 });
    try {
      const c = await bajarTemaDisco(t, (fraccion) => vivo.current && setBajando({ id: t.id, fraccion }));
      void pedirPersistencia();
      // (ya está en el aparato: que aparezca en su carpeta aunque el estuche se haya guardado entretanto)
      canciones.onCambiadas?.();
      if (!vivo.current) return;
      setBajando(null);
      elegida.current = c;
      setFase((f) => (f === "abierto" ? "cerrando" : f));
    } catch (e) {
      if (!vivo.current) return;
      const m = (e as Error).message || "";
      setBajando(null);
      setFallo(/quota|QuotaExceeded/i.test(m) ? "No cabe en el aparato. Borra alguna canción y vuelve a probar." : m || "No se ha podido bajar.");
    }
  };

  const temaBajando = bajando ? DISCO.temas.find((t) => t.id === bajando.id) : undefined;
  const pie =
    fallo ??
    (temaBajando
      ? `Bajando «${temaBajando.titulo}»: al acabar se pone sola en la grabadora.`
      : faltan.length > 0
        ? `Se baja al tocarla (unos ${formatoMB(Math.max(...faltan.map((t) => t.bytes)))}) y se queda en el aparato.`
        : null);

  return (
    <div
      ref={velo}
      className={`disco-velo ${fase}`}
      role="dialog"
      aria-modal="true"
      aria-label={`El disco «${DISCO.titulo}», de ${DISCO.artista}`}
      onClick={() => cerrar()}
    >
      <div className="disco-caja" ref={caja} onClick={(e) => e.stopPropagation()}>
        {/* La base: el lomo, la bandeja y el disco */}
        <div className="disco-base" aria-hidden="true">
          <div className="disco-bandeja">
            <div className={`disco-cd${bajando ? " gira" : ""}`}>
              <span className="disco-rotulo">{DISCO.artista}</span>
              <span className="disco-nombre">{DISCO.titulo}</span>
              <span className="disco-eje" />
            </div>
          </div>
        </div>
        {/* La tapa: por fuera, la portada; por dentro, el libreto con las canciones */}
        <div className="disco-tapa">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img className="disco-portada" src={FOTO} alt="" draggable={false} />
          <div className="disco-libreto">
            <div className="disco-papel">
              <header className="disco-cabecera">
                <span className="disco-rotulo">{DISCO.artista}</span>
                <h2>{DISCO.titulo}</h2>
              </header>
              <ol className="disco-temas" ref={lista}>
                {DISCO.temas.map((t, i) => {
                  const ya = tienes.get(idDisco(t));
                  const suena = !!ya && ya.id === canciones.actual;
                  const aqui = bajando?.id === t.id ? bajando : null;
                  // (aún sin subir: se ve, pero no se toca)
                  const pronto = !!t.pronto && !ya;
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        className={`disco-tema${suena ? " suena" : ""}`}
                        onClick={() => void poner(t)}
                        disabled={pronto || (bajando !== null && !aqui)}
                        aria-current={suena ? "true" : undefined}
                        aria-label={`${i + 1}. ${t.titulo}, ${formatoTiempo(t.duracion)}${suena ? ", suena ahora" : ya ? "" : pronto ? ", llega pronto" : ", se baja al tocarla"}`}
                      >
                        <span className="disco-n">{i + 1}</span>
                        <span className="disco-titulo">{t.titulo}</span>
                        <span className="disco-puntos" />
                        {!ya && !aqui && !pronto && (
                          <svg className="disco-baja" viewBox="0 0 24 24" aria-hidden="true">
                            <path d="M12 4v11M7 10.5l5 5 5-5M5.5 20h13" />
                          </svg>
                        )}
                        <span className="disco-dato">{aqui ? `${Math.round(aqui.fraccion * 100)} %` : suena ? "Suena" : pronto ? "Pronto" : formatoTiempo(t.duracion)}</span>
                        {aqui && (
                          <span className="disco-barra">
                            <span style={{ width: `${Math.max(4, aqui.fraccion * 100)}%` }} />
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ol>
              {/* Qué quiere decir la flecha (con todas ya bajadas no hace falta: más sitio para la lista) */}
              {pie && (
                <p className={`disco-pie${fallo ? " fallo" : ""}`} role={fallo ? "alert" : "status"}>
                  {!fallo && !temaBajando && (
                    <svg className="disco-baja" viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M12 4v11M7 10.5l5 5 5-5M5.5 20h13" />
                    </svg>
                  )}
                  {pie}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
      <p className="disco-fuera" aria-hidden="true">
        Toca una canción para ponerla en la grabadora · toca fuera para guardar el disco
      </p>
    </div>
  );
}
