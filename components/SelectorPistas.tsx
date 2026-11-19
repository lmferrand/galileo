"use client";

// El selector de pistas: el aparato «MIS GRABACIONES» del escritorio, en grande. Primero los grupos
// (artistas, álbumes, proyectos… lib/pistas/grupos) y, dentro de uno, sus canciones. Se elige con la
// rueda (girándola), las flechas, la rueda del ratón, el teclado o tocando una fila; «ABRIR» entra en
// el grupo o pone la canción en la Mesa. La foto (public/mesa/selector-pistas.webp, 1536×1024) va
// sin textos: las placas, las luces y el resaltado se pintan encima en sus píxeles.

import { useEffect, useRef, useState } from "react";
import type { Cancion } from "@/lib/pistas/tipos";
import { formatoTiempo } from "@/lib/pistas/tipos";
import { agrupar, grupoDe, guardarGrupos, leerGrupos, SIN_GRUPO, tituloEn, type Grupo } from "@/lib/pistas/grupos";
import { cambiarGrupo } from "@/lib/pistas/almacen";

const ANCHO = 1536;
const ALTO = 1024;
const FILAS = [309, 413, 519, 623, 728]; // arriba de cada placa
const ALTO_FILA = 83;
const PLACA = { x: 247, ancho: 795 };
const LUZ_X = 205;
const RUEDA = { x: 1245, y: 495, r: 136 };
const VISIBLES = FILAS.length;
const PASO_RUEDA = 28; // grados de giro por fila

type Fila = { tipo: "grupo"; grupo: Grupo } | { tipo: "nuevo" } | { tipo: "cancion"; c: Cancion };
type Editor = { modo: "nuevo" | "renombrar"; texto: string } | { modo: "anadir" } | null;

interface Props {
  canciones: Cancion[];
  /** La canción que suena en la Mesa */
  actual?: string;
  onElegir: (c: Cancion) => void;
  onCerrar: () => void;
  /** Han cambiado los grupos de las canciones: hay que volver a leerlas */
  onCambiadas: () => void;
}

export default function SelectorPistas({ canciones, actual, onElegir, onCerrar, onCambiadas }: Props) {
  const [guardados, setGuardados] = useState<string[]>(() => (typeof window === "undefined" ? [] : leerGrupos()));
  // Lo cambiado aquí, hasta que llegue la lista nueva
  const [cambios, setCambios] = useState<Record<string, string | null>>({});
  const lista = canciones.map((c) => (c.id in cambios ? { ...c, grupo: cambios[c.id] ?? undefined } : c));
  const grupos = agrupar(lista, guardados);
  const [abierto, setAbierto] = useState<string | null>(null);
  const grupoAbierto = abierto === null ? null : (grupos.find((g) => g.nombre === abierto) ?? { nombre: abierto, canciones: [] });
  const filas: Fila[] = grupoAbierto ? grupoAbierto.canciones.map((c) => ({ tipo: "cancion", c })) : [...grupos.map((g) => ({ tipo: "grupo" as const, grupo: g })), { tipo: "nuevo" }];
  const [cursor, setCursor] = useState(() => {
    const i = Math.max(0, grupos.findIndex((g) => g.canciones.some((c) => c.id === actual)));
    return { sel: i, primero: Math.max(0, i - VISIBLES + 1) };
  });
  const [editor, setEditor] = useState<Editor>(null);
  const [giro, setGiro] = useState(0);

  // El tamaño: el aparato lo más grande que quepa
  const caja = useRef<HTMLDivElement>(null);
  const [tam, setTam] = useState({ w: 900, h: 600 });
  useEffect(() => {
    const el = caja.current;
    if (!el) return;
    const medir = () => setTam({ w: el.clientWidth, h: el.clientHeight });
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const escala = Math.max(0.15, Math.min((tam.w - 24) / ANCHO, (tam.h - 8) / ALTO));

  const irA = (n: number) =>
    setCursor((c) => {
      const sel = Math.max(0, Math.min(filas.length - 1, n));
      const primero = sel < c.primero ? sel : sel > c.primero + VISIBLES - 1 ? sel - VISIBLES + 1 : c.primero;
      return { sel, primero };
    });
  const mover = (paso: number) => setCursor((c) => {
    const sel = Math.max(0, Math.min(filas.length - 1, c.sel + paso));
    const primero = sel < c.primero ? sel : sel > c.primero + VISIBLES - 1 ? sel - VISIBLES + 1 : c.primero;
    return { sel, primero };
  });
  const sel = Math.min(cursor.sel, Math.max(0, filas.length - 1));

  const entrar = (g: string) => {
    const dentro = grupos.find((x) => x.nombre === g)?.canciones ?? [];
    const i = Math.max(0, dentro.findIndex((c) => c.id === actual));
    setAbierto(g);
    setEditor(null);
    setCursor({ sel: i, primero: Math.max(0, i - VISIBLES + 1) });
  };
  const volver = () => {
    if (abierto === null) return onCerrar();
    const i = Math.max(0, grupos.findIndex((g) => g.nombre === abierto));
    setAbierto(null);
    setEditor(null);
    setCursor({ sel: i, primero: Math.max(0, i - VISIBLES + 1) });
  };
  const abrir = (i = sel) => {
    const f = filas[i];
    if (!f) return;
    if (f.tipo === "grupo") entrar(f.grupo.nombre);
    else if (f.tipo === "nuevo") setEditor({ modo: "nuevo", texto: "" });
    else onElegir(f.c);
  };

  // Mover canciones de grupo y cambiar los grupos
  const ponerGrupo = async (ids: string[], grupo: string | null) => {
    setCambios((c) => ({ ...c, ...Object.fromEntries(ids.map((id) => [id, grupo])) }));
    await Promise.all(ids.map((id) => cambiarGrupo(id, grupo).catch(() => undefined)));
    onCambiadas();
  };
  const cambiarGuardados = (gs: string[]) => {
    setGuardados(gs);
    guardarGrupos(gs);
  };
  const crear = (nombre: string) => {
    const n = nombre.trim().slice(0, 40);
    if (!n) return;
    if (!guardados.includes(n)) cambiarGuardados([...guardados, n]);
    setEditor(null);
    entrar(n);
  };
  const renombrar = (nombre: string) => {
    const n = nombre.trim().slice(0, 40);
    if (!n || !grupoAbierto) return setEditor(null);
    const viejo = grupoAbierto.nombre;
    cambiarGuardados(guardados.includes(viejo) ? guardados.map((g) => (g === viejo ? n : g)) : [...guardados, n]);
    void ponerGrupo(grupoAbierto.canciones.map((c) => c.id), n);
    setAbierto(n);
    setEditor(null);
  };
  const borrarGrupo = () => {
    if (!grupoAbierto) return;
    cambiarGuardados(guardados.filter((g) => g !== grupoAbierto.nombre));
    void ponerGrupo(grupoAbierto.canciones.filter((c) => c.grupo).map((c) => c.id), null);
    volver();
  };

  // Teclado (también el de un pedal): flechas, Intro, Escape
  const ultimas = useRef({ mover, abrir, volver, editor });
  useEffect(() => {
    ultimas.current = { mover, abrir, volver, editor };
  });
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const u = ultimas.current;
      if ((e.target as HTMLElement)?.closest?.("input, textarea")) {
        if (e.key === "Escape") {
          setEditor(null);
          e.stopPropagation();
        }
        return;
      }
      if (e.key === "ArrowDown") u.mover(1);
      else if (e.key === "ArrowUp") u.mover(-1);
      else if (e.key === "Enter") u.abrir();
      else if (e.key === "Escape" || e.key === "Backspace") u.volver();
      else return;
      e.preventDefault();
      e.stopPropagation();
    };
    document.addEventListener("keydown", tecla, true);
    return () => document.removeEventListener("keydown", tecla, true);
  }, []);

  // La rueda: se gira arrastrando; cada PASO_RUEDA grados, una fila
  const ruedaEl = useRef<HTMLDivElement>(null);
  const arrastre = useRef<{ ang: number; acum: number } | null>(null);
  const angulo = (e: React.PointerEvent) => {
    const r = ruedaEl.current!.getBoundingClientRect();
    return (Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180) / Math.PI;
  };
  const ruedaAbajo = (e: React.PointerEvent) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    arrastre.current = { ang: angulo(e), acum: 0 };
  };
  const ruedaMueve = (e: React.PointerEvent) => {
    const a = arrastre.current;
    if (!a) return;
    const ahora = angulo(e);
    let d = ahora - a.ang;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    a.ang = ahora;
    a.acum += d;
    setGiro((g) => g + d);
    while (a.acum >= PASO_RUEDA) {
      a.acum -= PASO_RUEDA;
      mover(1);
    }
    while (a.acum <= -PASO_RUEDA) {
      a.acum += PASO_RUEDA;
      mover(-1);
    }
  };
  const ruedaArriba = () => {
    arrastre.current = null;
  };
  // La rueda del ratón sobre el aparato también mueve (y gira la rueda)
  const rueditaAcum = useRef(0);
  const ruedita = (e: React.WheelEvent) => {
    rueditaAcum.current += e.deltaY;
    while (Math.abs(rueditaAcum.current) >= 60) {
      const paso = Math.sign(rueditaAcum.current);
      rueditaAcum.current -= paso * 60;
      mover(paso);
      setGiro((g) => g + paso * PASO_RUEDA);
    }
  };
  const flecha = (paso: number) => {
    mover(paso);
    setGiro((g) => g + paso * PASO_RUEDA);
  };

  const visibles = Array.from({ length: VISIBLES }, (_, k) => cursor.primero + k);
  const titulo = grupoAbierto ? grupoAbierto.nombre : "Mis grabaciones";
  const fueraDelGrupo = grupoAbierto ? lista.filter((c) => grupoDe(c) !== grupoAbierto.nombre) : [];
  const esPropio = !!grupoAbierto && (guardados.includes(grupoAbierto.nombre) || grupoAbierto.canciones.some((c) => c.grupo));

  return (
    <div className="sp-pistas" role="dialog" aria-modal="true" aria-label="Selector de pistas">
      <div className="sp-arriba">
        <button type="button" className="estudio-boton" onClick={volver}>
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M15 5l-7 7 7 7" />
          </svg>
          {abierto === null ? "Mesa" : "Grupos"}
        </button>
      </div>

      <div className="sp-caja" ref={caja} onWheel={ruedita}>
        <div className="sp-aparato" style={{ width: ANCHO * escala, height: ALTO * escala }}>
          <div className="sp-foto" style={{ width: ANCHO, height: ALTO, transform: `scale(${escala})` }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- la foto del aparato, a su tamaño */}
            <img src="/mesa/selector-pistas.webp" alt="" width={ANCHO} height={ALTO} draggable={false} />
            <div className="sp-titulo" aria-live="polite">
              {titulo}
            </div>

            {visibles.map((i, k) => {
              const f = filas[i];
              const top = FILAS[k];
              const on = !!f && i === sel;
              return (
                <div key={k}>
                  <span className={`sp-luz${on ? " on" : f ? "" : " apagada"}`} style={{ left: LUZ_X - 17, top: top + ALTO_FILA / 2 - 17 }} aria-hidden="true" />
                  {f ? (
                    <button
                      type="button"
                      className={`sp-fila${on ? " on" : ""}${f.tipo === "nuevo" ? " nuevo" : ""}`}
                      style={{ left: PLACA.x, top, width: PLACA.ancho, height: ALTO_FILA }}
                      onClick={() => (on ? abrir(i) : irA(i))}
                      aria-current={on ? "true" : undefined}
                    >
                      <span className="sp-num">{f.tipo === "nuevo" ? "＋" : String(i + 1).padStart(2, "0")}</span>
                      <span className="sp-raya" aria-hidden="true" />
                      <span className="sp-nombre">
                        {f.tipo === "grupo" ? f.grupo.nombre : f.tipo === "nuevo" ? "Nuevo grupo" : tituloEn(f.c, abierto ?? "")}
                      </span>
                      <span className="sp-dato">
                        {f.tipo === "grupo"
                          ? f.grupo.canciones.length
                          : f.tipo === "cancion"
                            ? f.c.id === actual
                              ? "SUENA"
                              : formatoTiempo(f.c.duracion)
                            : ""}
                      </span>
                    </button>
                  ) : (
                    k === 0 &&
                    grupoAbierto && (
                      <span className="sp-fila vacia" style={{ left: PLACA.x, top, width: PLACA.ancho, height: ALTO_FILA }}>
                        <span className="sp-nombre">Sin canciones todavía</span>
                      </span>
                    )
                  )}
                </div>
              );
            })}

            <button type="button" className="sp-flecha" style={{ left: 1192, top: 290 }} onClick={() => flecha(-1)} aria-label="Subir" />
            <button type="button" className="sp-flecha" style={{ left: 1192, top: 644 }} onClick={() => flecha(1)} aria-label="Bajar" />
            <div
              ref={ruedaEl}
              className="sp-rueda"
              style={{
                left: RUEDA.x - RUEDA.r,
                top: RUEDA.y - RUEDA.r,
                width: RUEDA.r * 2,
                height: RUEDA.r * 2,
                backgroundPosition: `${-(RUEDA.x - RUEDA.r)}px ${-(RUEDA.y - RUEDA.r)}px`,
                transform: `rotate(${giro}deg)`,
              }}
              role="slider"
              aria-label="Rueda para elegir"
              aria-valuemin={1}
              aria-valuemax={Math.max(1, filas.length)}
              aria-valuenow={sel + 1}
              tabIndex={0}
              onPointerDown={ruedaAbajo}
              onPointerMove={ruedaMueve}
              onPointerUp={ruedaArriba}
              onPointerCancel={ruedaArriba}
            />
            <button type="button" className="sp-abrir" style={{ left: 1113, top: 727, width: 266, height: 101 }} onClick={() => abrir()} aria-label="Abrir" />
          </div>
        </div>
      </div>

      <div className="sp-acciones">
        {editor && (editor.modo === "nuevo" || editor.modo === "renombrar") ? (
          <form
            className="sp-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (editor.modo === "nuevo") crear(editor.texto);
              else renombrar(editor.texto);
            }}
          >
            <input
              autoFocus
              type="text"
              maxLength={40}
              placeholder={editor.modo === "nuevo" ? "Artista, álbum, proyecto…" : "Nombre del grupo"}
              value={editor.texto}
              onChange={(e) => setEditor({ ...editor, texto: e.target.value })}
            />
            <button type="submit" className="boton-principal">
              {editor.modo === "nuevo" ? "Crear" : "Cambiar"}
            </button>
            <button type="button" className="boton-texto" onClick={() => setEditor(null)}>
              Cancelar
            </button>
          </form>
        ) : editor?.modo === "anadir" && grupoAbierto ? (
          <div className="sp-anadir">
            <span>Toca las que van en «{grupoAbierto.nombre}»:</span>
            {fueraDelGrupo.length === 0 ? (
              <em>Ya están todas.</em>
            ) : (
              fueraDelGrupo.map((c) => (
                <button key={c.id} type="button" className="chip" onClick={() => void ponerGrupo([c.id], grupoAbierto.nombre)}>
                  + {c.nombre}
                </button>
              ))
            )}
            <button type="button" className="boton-texto" onClick={() => setEditor(null)}>
              Listo
            </button>
          </div>
        ) : grupoAbierto ? (
          <>
            <button type="button" className="sp-accion" onClick={() => setEditor({ modo: "anadir" })}>
              Añadir canciones
            </button>
            {grupoAbierto.nombre !== SIN_GRUPO && (
              <button type="button" className="sp-accion" onClick={() => setEditor({ modo: "renombrar", texto: grupoAbierto.nombre })}>
                Cambiar el nombre
              </button>
            )}
            {esPropio && (
              <button type="button" className="sp-accion" onClick={borrarGrupo}>
                Quitar el grupo
              </button>
            )}
          </>
        ) : (
          <>
            <span className="sp-ayuda">Gira la rueda o toca una fila; ABRIR entra.</span>
            <button type="button" className="sp-accion" onClick={() => setEditor({ modo: "nuevo", texto: "" })}>
              ＋ Nuevo grupo
            </button>
          </>
        )}
      </div>
    </div>
  );
}
