"use client";

// La consola de la Mesa, dibujada como la mesa de mezclas de la foto del estudio: una tira por
// entrada de la interfaz (ganancia en rojo, agudos y graves en azul, panorama en amarillo, la tecla
// naranja de silencio y el fader) y la sección general (pantalla, encender y fader rojo). La
// pantalla enseña el mando que mueves. Los efectos de cada canal se abren en una hoja.
// El sonido lo hace lib/mesa/mesa (sigue sonando con la consola cerrada).

import { useEffect, useRef, useState } from "react";
import EfectosMesa, { dB, efectosActivos, pct } from "./EfectosMesa";
import { Fader, Perilla } from "./MandosMesa";
import { AJUSTES_INICIALES, guardarAjustesMesa, leerAjustesMesa, type AjustesCanal, type AjustesMesa } from "@/lib/mesa/ajustes";
import { mesa } from "@/lib/mesa/mesa";
import { useEstadoMesa } from "@/lib/mesa/usarMesa";
import { useHidratado } from "@/lib/hidratado";

const panorama = (v: number) => (Math.abs(v) < 0.03 ? "Centro" : v < 0 ? `Izq. ${Math.round(-v * 100)}` : `Der. ${Math.round(v * 100)}`);
const LECTURA_MS = 1400;

export default function ConsolaMesa() {
  const hidratado = useHidratado();
  const estado = useEstadoMesa();
  const [cambiados, setAjustes] = useState<AjustesMesa | null>(null);
  const [retraso, setRetraso] = useState<number | null>(null);
  const [efectosDe, setEfectosDe] = useState<0 | 1 | null>(null);
  const [lectura, setLectura] = useState<{ donde: string; texto: string } | null>(null);
  const tLectura = useRef<ReturnType<typeof setTimeout> | null>(null);
  const medidores = useRef<(HTMLSpanElement | null)[]>([]);
  const ajustes = cambiados ?? (hidratado ? leerAjustesMesa() : AJUSTES_INICIALES);
  const encendida = estado === "encendida";

  const cambiar = (nuevo: AjustesMesa) => {
    setAjustes(nuevo);
    guardarAjustesMesa(nuevo);
    mesa.aplicar(nuevo);
  };
  const cambiarCanal = (i: 0 | 1, f: (c: AjustesCanal) => AjustesCanal) => {
    const canales = [...ajustes.canales] as AjustesMesa["canales"];
    canales[i] = f(canales[i]);
    cambiar({ ...ajustes, canales });
  };
  // La pantalla enseña el mando que se mueve y, al rato, vuelve a lo suyo
  const leer = (donde: string, texto: string) => {
    setLectura({ donde, texto });
    if (tLectura.current) clearTimeout(tLectura.current);
    tLectura.current = setTimeout(() => setLectura(null), LECTURA_MS);
  };
  useEffect(() => () => void (tLectura.current && clearTimeout(tLectura.current)), []);

  const encender = async () => {
    if (encendida) return mesa.apagar();
    const r = await mesa.encender(ajustes);
    if (r === "encendida") setRetraso(mesa.retrasoMs());
  };

  // Los medidores, sin pasar por React
  useEffect(() => {
    if (!encendida) return;
    const luces = medidores.current;
    let raf = 0;
    const bucle = () => {
      raf = requestAnimationFrame(bucle);
      const n = mesa.niveles();
      [n.canales[0] ?? 0, n.canales[1] ?? 0, n.general].forEach((v, i) => {
        const el = luces[i];
        if (!el) return;
        el.style.setProperty("--nivel", `${Math.min(1, Math.sqrt(v)) * 100}%`);
        el.classList.toggle("satura", v > 0.97);
      });
    };
    bucle();
    const volver = () => void mesa.reanudar();
    document.addEventListener("visibilitychange", volver);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", volver);
      luces.forEach((el) => el?.style.setProperty("--nivel", "0%"));
    };
  }, [encendida]);

  // Escape cierra primero la hoja de efectos (antes de que lo oiga el estudio)
  useEffect(() => {
    if (efectosDe === null) return;
    const tecla = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.stopImmediatePropagation();
      setEfectosDe(null);
    };
    document.addEventListener("keydown", tecla, true);
    return () => document.removeEventListener("keydown", tecla, true);
  }, [efectosDe]);

  const estadoTexto = encendida
    ? `${mesa.nombreEntrada || "Entrada"} · ${mesa.entradas === 1 ? "1 entrada" : "2 entradas"}`
    : estado === "abriendo"
      ? "Abriendo la entrada…"
      : estado === "denegada"
        ? "Sin permiso para el micro"
        : estado === "error" || estado === "sin-soporte"
          ? "Sin entrada de audio"
          : "Apagada";

  return (
    <div className="consola">
      <div className="consola-chasis">
        <span className="consola-madera" aria-hidden="true" />
        <div className="consola-panel">
          {([0, 1] as const).map((i) => {
            const c = ajustes.canales[i];
            const donde = `Entrada ${i + 1}`;
            const sinEntrada = encendida && mesa.entradas < 2 && i === 1;
            const nFx = efectosActivos(c);
            const ecualizar = (banda: "agudos" | "graves", v: number) => {
              cambiarCanal(i, (x) => ({ ...x, ecualizador: { ...x.ecualizador, activo: true, [banda]: v } }));
              leer(donde, `${banda === "agudos" ? "Agudos" : "Graves"} ${dB(v)}`);
            };
            return (
              <section key={i} className={`tira${sinEntrada ? " sin-entrada" : ""}`} aria-label={donde}>
                <div className="tira-cabeza">
                  <span className="tira-nombre">{sinEntrada ? "Sin entrada 2" : donde}</span>
                  <button type="button" className={`tira-fx${nFx ? " con" : ""}`} onClick={() => setEfectosDe(i)} aria-label={`Efectos de la entrada ${i + 1}: ${nFx} encendidos`}>
                    Efectos{nFx > 0 && <span className="tira-fx-n">{nFx}</span>}
                  </button>
                </div>
                <div className="tira-perillas">
                  <Perilla
                    color="rojo"
                    nombre="Ganancia"
                    valor={c.ganancia}
                    min={0}
                    max={30}
                    paso={1}
                    porDefecto={6}
                    ver={dB}
                    onCambio={(ganancia) => {
                      cambiarCanal(i, (x) => ({ ...x, ganancia }));
                      leer(donde, `Ganancia ${dB(ganancia)}`);
                    }}
                  />
                  <Perilla color="azul" nombre="Agudos" valor={c.ecualizador.agudos} min={-12} max={12} paso={1} porDefecto={0} ver={dB} onCambio={(v) => ecualizar("agudos", v)} />
                  <Perilla color="azul" nombre="Graves" valor={c.ecualizador.graves} min={-12} max={12} paso={1} porDefecto={0} ver={dB} onCambio={(v) => ecualizar("graves", v)} />
                  <Perilla
                    color="amarillo"
                    nombre="Panorama"
                    etiqueta="Pan"
                    valor={c.panorama}
                    min={-1}
                    max={1}
                    paso={0.05}
                    porDefecto={0}
                    ver={panorama}
                    onCambio={(p) => {
                      cambiarCanal(i, (x) => ({ ...x, panorama: p }));
                      leer(donde, `Panorama ${panorama(p)}`);
                    }}
                  />
                </div>
                <div className="tira-tecla">
                  <button
                    type="button"
                    className={`tecla${c.silencio ? " on" : ""}`}
                    aria-pressed={c.silencio}
                    aria-label={`Silenciar la entrada ${i + 1}`}
                    onClick={() => {
                      cambiarCanal(i, (x) => ({ ...x, silencio: !x.silencio }));
                      leer(donde, c.silencio ? "Suena" : "En silencio");
                    }}
                  />
                  <span className="mando-nombre" aria-hidden="true">
                    Silencio
                  </span>
                </div>
                <div className="tira-fader">
                  <Fader
                    nombre={`Volumen de la entrada ${i + 1}`}
                    valor={c.volumen}
                    min={0}
                    max={1.5}
                    paso={0.01}
                    porDefecto={1}
                    marca={1}
                    ver={pct}
                    onCambio={(volumen) => {
                      cambiarCanal(i, (x) => ({ ...x, volumen }));
                      leer(donde, `Volumen ${pct(volumen)}`);
                    }}
                  />
                  <span className="led" ref={(el) => void (medidores.current[i] = el)} aria-hidden="true" />
                </div>
              </section>
            );
          })}

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
            <span className="led led-general" ref={(el) => void (medidores.current[2] = el)} aria-hidden="true" />
            </div>
            <div className="tira-tecla">
              <button
                type="button"
                className={`tecla tecla-encender${encendida ? " on" : ""}`}
                aria-pressed={encendida}
                aria-label={encendida ? "Apagar la Mesa" : "Encender la Mesa"}
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
            <div className="tira-fader">
              <Fader
                rojo
                nombre="Volumen general"
                valor={ajustes.general}
                min={0}
                max={1.5}
                paso={0.01}
                porDefecto={1}
                marca={1}
                ver={pct}
                onCambio={(general) => {
                  cambiar({ ...ajustes, general });
                  leer("General", `Volumen ${pct(general)}`);
                }}
              />
            </div>
          </section>
        </div>
        <span className="consola-madera" aria-hidden="true" />
      </div>

      {!encendida && <p className="consola-nota">Con cascos en la interfaz: por el altavoz se acopla. La entrada se elige en Ajustes.</p>}

      {efectosDe !== null && (
        <div className="hoja-fondo" onClick={() => setEfectosDe(null)}>
          <div className="hoja" role="dialog" aria-modal="true" aria-label={`Efectos de la entrada ${efectosDe + 1}`} onClick={(e) => e.stopPropagation()}>
            <div className="hoja-asa" aria-hidden="true" />
            <header className="hoja-cabecera">
              <h2>Efectos de la entrada {efectosDe + 1}</h2>
              <button type="button" className="boton-texto" onClick={() => setEfectosDe(null)}>
                Listo
              </button>
            </header>
            <div className="hoja-cuerpo mesa">
              <EfectosMesa canal={ajustes.canales[efectosDe]} onCambio={(f) => cambiarCanal(efectosDe, f)} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
