"use client";

// El equipo de una guitarra: su amplificador y, en el suelo, su pedalera. La eléctrica y la acústica
// tienen cada una el suyo (lib/ampli/ajustes). Se abre con el botón «Ampli» de abajo o tocando el
// ampli que hay al fondo del estudio mientras afinas (Afinador), y sube desde abajo como las palas. Todo se maneja como lo de verdad: la palanca enciende el ampli (y abre la entrada de sonido:
// tiene que ser en ese toque), las ruedas se giran arrastrando arriba y abajo (dos toques: a su
// sitio de serie; también con las flechas) y los pedales se pisan.
// Dibujado con estilos, sin fotos ni marcas: los amplis son «Galileo» (el de la eléctrica, forrado
// en negro; el de la acústica, de madera) y los pedales tienen nombre propio. El sonido es lib/ampli/cadena; quien lo enciende, lib/ampli/ampli.
// Lo que se mueve en cada fotograma (la luz de señal) va por fuera de React.

import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { accesible, useArrastre, type PropsMando } from "./MandosMesa";
import { ampli, type EstadoAmpli } from "@/lib/ampli/ampli";
import { EQUIPOS, MANDOS_AMPLI, enDiez, guardarEquipo, leerEquipo, type AjustesEquipo, type AjustesPedal, type EquipoId, type Pedal } from "@/lib/ampli/ajustes";
import { msDelEco } from "@/lib/ampli/cadena";
import { RETRASO_BLUETOOTH, RETRASO_QUE_SE_NOTA } from "@/lib/mesa/escucha";
import { usePasoAtras } from "@/lib/atras";

interface Bloqueo {
  release: () => Promise<void>;
}

/** Lo que tarda en irse por abajo (como su animación, en equipo.css) */
const MS_SALIR = 360;

const useEstadoAmpli = (): EstadoAmpli =>
  useSyncExternalStore(
    (f) => ampli.alCambiar(f),
    () => ampli.estado,
    () => "apagado",
  );

/** Una rueda: gira tres cuartos de vuelta, de 0 a 10. Mientras se mueve, enseña su valor encima. */
function Rueda({ p, etiqueta }: { p: PropsMando; etiqueta: string }) {
  const manejo = useArrastre(p, () => 150);
  const frac = (p.valor - p.min) / (p.max - p.min);
  return (
    <div className="eq-mando">
      <span className="eq-rueda" {...accesible(p)} {...manejo} style={{ "--giro": `${-135 + frac * 270}deg` } as CSSProperties}>
        <span className="eq-rueda-tapa" aria-hidden="true" />
      </span>
      <output className="eq-valor" aria-hidden="true">
        {p.ver(p.valor)}
      </output>
      <span className="eq-mando-nombre" aria-hidden="true">
        {etiqueta}
      </span>
    </div>
  );
}

function PedalVista({
  pedal,
  valores,
  onMando,
  onPisar,
}: {
  pedal: Pedal;
  valores: AjustesPedal;
  onMando: (k: string, v: number) => void;
  onPisar: () => void;
}) {
  return (
    <div className={`eq-pedal eq-${pedal.id}${valores.activo ? " pisado" : ""}`}>
      <div className="eq-pedal-mandos">
        {pedal.mandos.map((m) => (
          <Rueda
            key={m.k}
            etiqueta={m.nombre}
            p={{
              nombre: `${m.nombre} de ${pedal.nombre}`,
              valor: valores[m.k] as number,
              min: 0,
              max: 1,
              paso: 0.01,
              porDefecto: pedal.serie[m.k],
              ver: pedal.id === "eco" && m.k === "tiempo" ? (v) => `${msDelEco(v)} ms` : enDiez,
              onCambio: (v) => onMando(m.k, v),
            }}
          />
        ))}
      </div>
      <button type="button" className="eq-pisar" role="switch" aria-checked={valores.activo} aria-label={`${pedal.nombre}: ${pedal.tipo.toLowerCase()}`} onClick={onPisar}>
        <span className="eq-led" aria-hidden="true" />
        <span className="eq-pedal-nombre">{pedal.nombre}</span>
        <span className="eq-pedal-tipo">{pedal.tipo}</span>
        <span className="eq-boton-pie" aria-hidden="true" />
      </button>
    </div>
  );
}

export default function Equipo({ tipo, onCerrar }: { tipo: EquipoId; onCerrar: () => void }) {
  const equipo = EQUIPOS[tipo];
  const estado = useEstadoAmpli();
  const encendido = estado === "encendido";
  // (se monta al tocar el ampli, ya en el aparato: lo guardado se puede leer al empezar)
  const [ajustes, setAjustes] = useState<AjustesEquipo>(() => leerEquipo(tipo));
  const [saliendo, setSaliendo] = useState(false);
  // Lo que tarda en oírse lo que tocas (ms), cuando el navegador lo sabe
  const [retraso, setRetraso] = useState<number | null>(null);
  const piloto = useRef<HTMLSpanElement>(null);

  const cambiar = (nuevo: AjustesEquipo) => {
    setAjustes(nuevo);
    guardarEquipo(tipo, nuevo);
    ampli.aplicar(nuevo);
  };

  const cerrar = () => {
    if (saliendo) return;
    setSaliendo(true);
    ampli.apagar();
  };
  useEffect(() => {
    if (!saliendo) return;
    const t = setTimeout(onCerrar, MS_SALIR);
    return () => clearTimeout(t);
  }, [saliendo, onCerrar]);
  usePasoAtras(true, 1, cerrar);

  // Al irse (se cierra, o cambias de pestaña): el ampli se apaga y suelta la entrada
  useEffect(() => () => ampli.apagar(), []);

  // Al volver a la app, el iPhone ha suspendido el sonido
  useEffect(() => {
    const volver = () => {
      if (document.visibilityState === "visible") void ampli.reanudar();
    };
    document.addEventListener("visibilitychange", volver);
    return () => document.removeEventListener("visibilitychange", volver);
  }, []);

  // Encendido: la luz de señal sigue lo que llega de la guitarra, se mira el retraso (el navegador
  // tarda un momento en saberlo) y la pantalla no se apaga mientras tocas
  useEffect(() => {
    if (!encendido) return;
    let fuera = false;
    let bloqueo: Bloqueo | null = null;
    (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<Bloqueo> } }).wakeLock
      ?.request("screen")
      .then((b) => {
        if (fuera) void b.release().catch(() => undefined);
        else bloqueo = b;
      })
      .catch(() => undefined);
    let raf = 0;
    let luz = 0;
    const pintar = () => {
      raf = requestAnimationFrame(pintar);
      const { entrada } = ampli.niveles();
      // (sube al momento y baja despacio, como una bombilla)
      luz = Math.max(Math.min(1, Math.sqrt(entrada) * 1.6), luz * 0.9);
      const el = piloto.current;
      if (el) {
        el.style.setProperty("--senal", luz.toFixed(2));
        el.classList.toggle("satura", entrada > 0.97);
      }
    };
    raf = requestAnimationFrame(pintar);
    const t = setTimeout(() => setRetraso(ampli.retrasoMs()), 700);
    return () => {
      fuera = true;
      void bloqueo?.release().catch(() => undefined);
      cancelAnimationFrame(raf);
      clearTimeout(t);
      setRetraso(null);
    };
  }, [encendido]);

  const palanca = () => {
    if (saliendo) return;
    if (encendido || estado === "abriendo") ampli.apagar();
    else void ampli.encender(tipo, ajustes);
  };

  let aviso: string;
  if (estado === "apagado") aviso = "Sube la palanca para encenderlo y toca. Mejor con cascos: por el altavoz del aparato se acopla.";
  else if (estado === "abriendo") aviso = "Calentando las válvulas…";
  else if (estado === "denegado") aviso = "No hay permiso para el micrófono. Permítelo para esta página y vuelve a subir la palanca.";
  else if (estado === "sin-soporte") aviso = "Este navegador no deja usar el micrófono. Abre la página en Safari o en Chrome.";
  else if (estado === "error") aviso = "No se ha podido abrir la entrada de sonido. Comprueba que ninguna otra app la está usando.";
  else {
    aviso = ampli.nombreEntrada ? `Entra por «${ampli.nombreEntrada}» (se cambia en Ajustes).` : "Encendido.";
    if (retraso !== null && retraso >= RETRASO_BLUETOOTH) aviso += ` Te oyes con ${retraso} ms de retraso: parecen cascos Bluetooth; con cable va al momento.`;
    else if (retraso !== null && retraso >= RETRASO_QUE_SE_NOTA) aviso += ` Te oyes con unos ${retraso} ms de retraso.`;
  }

  return (
    <div
      className={`equipo es-${tipo}${saliendo ? " sale" : ""}${encendido ? " encendido" : ""}${estado === "abriendo" ? " abriendo" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={`Amplificador y pedalera ${equipo.de}`}
    >
      <button type="button" className="eq-volver" onClick={cerrar}>
        <svg viewBox="0 0 16 16" aria-hidden="true">
          <path d="M10 3 L5 8 L10 13" />
        </svg>
        Afinador
      </button>

      {encendido && ampli.entradas > 1 && (
        <div className="eq-entradas" role="group" aria-label="Entrada de la guitarra">
          {([0, 1] as const).map((i) => (
            <button key={i} type="button" aria-pressed={ajustes.entrada === i} onClick={() => cambiar({ ...ajustes, entrada: i })}>
              Entrada {i + 1}
            </button>
          ))}
        </div>
      )}

      <div className="eq-escena">
        <section className="eq-ampli" aria-label="Amplificador">
          <div className="eq-panel">
            <button type="button" className="eq-palanca" role="switch" aria-checked={encendido} aria-label="Encender el amplificador" onClick={palanca}>
              <span className="eq-palanca-base" aria-hidden="true">
                <span className="eq-palanca-vara" />
              </span>
              <span className="eq-mando-nombre" aria-hidden="true">
                {encendido ? "Encendido" : "Apagado"}
              </span>
            </button>
            <span className="eq-piloto" ref={piloto} aria-hidden="true" />
            <div className="eq-ruedas">
              {MANDOS_AMPLI.map((m) => (
                <Rueda
                  key={m.k}
                  etiqueta={m.nombre}
                  p={{
                    nombre: `${m.nombre} del amplificador`,
                    valor: ajustes.ampli[m.k],
                    min: 0,
                    max: 1,
                    paso: 0.01,
                    porDefecto: equipo.ampli[m.k],
                    ver: enDiez,
                    onCambio: (v) => cambiar({ ...ajustes, ampli: { ...ajustes.ampli, [m.k]: v } }),
                  }}
                />
              ))}
            </div>
          </div>
          <div className="eq-rejilla" aria-hidden="true">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="eq-logo" src="/logo-galileo-disco.webp" alt="" draggable={false} />
          </div>
        </section>

        <p className="eq-aviso" role="status">
          {aviso}
        </p>

        <section className="eq-pedalera" aria-label="Pedalera">
          {equipo.pedales.map((p) => (
            <PedalVista
              key={p.id}
              pedal={p}
              valores={ajustes.pedales[p.id]}
              onMando={(k, v) => cambiar({ ...ajustes, pedales: { ...ajustes.pedales, [p.id]: { ...ajustes.pedales[p.id], [k]: v } } })}
              onPisar={() => {
                try {
                  navigator.vibrate?.(10);
                } catch {
                  /* sin vibración */
                }
                cambiar({ ...ajustes, pedales: { ...ajustes.pedales, [p.id]: { ...ajustes.pedales[p.id], activo: !ajustes.pedales[p.id].activo } } });
              }}
            />
          ))}
        </section>
      </div>
    </div>
  );
}
