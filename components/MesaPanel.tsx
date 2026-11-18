"use client";

// La Mesa: dos canales (entradas 1 y 2 de la interfaz de audio) con sus efectos. Se enciende con
// un toque y sigue sonando con la hoja cerrada (lib/mesa/mesa). Los ajustes se recuerdan.

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { guardarAjustesMesa, leerAjustesMesa, AJUSTES_INICIALES, SONIDOS, type AjustesCanal, type AjustesMesa, type Efecto } from "@/lib/mesa/ajustes";
import { mesa } from "@/lib/mesa/mesa";
import { useEstadoMesa } from "@/lib/mesa/usarMesa";
import { useHidratado } from "@/lib/hidratado";

interface Mando {
  k: string;
  nombre: string;
  min: number;
  max: number;
  paso: number;
  ver: (v: number) => string;
}

const pct = (v: number) => `${Math.round(v * 100)} %`;
const dB = (v: number) => `${v > 0 ? "+" : ""}${Math.round(v)} dB`;

// En el orden en que pasa el sonido
const EFECTOS: { id: Efecto; nombre: string; mandos: Mando[] }[] = [
  { id: "puerta", nombre: "Puerta de ruido", mandos: [{ k: "umbral", nombre: "Umbral", min: -90, max: -20, paso: 1, ver: dB }] },
  { id: "compresor", nombre: "Compresor", mandos: [{ k: "cantidad", nombre: "Cantidad", min: 0, max: 1, paso: 0.01, ver: pct }] },
  {
    id: "distorsion",
    nombre: "Distorsión",
    mandos: [
      { k: "drive", nombre: "Saturación", min: 0, max: 1, paso: 0.01, ver: pct },
      { k: "tono", nombre: "Tono", min: 0, max: 1, paso: 0.01, ver: pct },
      { k: "nivel", nombre: "Nivel", min: 0, max: 1, paso: 0.01, ver: pct },
    ],
  },
  {
    id: "ecualizador",
    nombre: "Ecualizador",
    mandos: [
      { k: "graves", nombre: "Graves", min: -12, max: 12, paso: 1, ver: dB },
      { k: "medios", nombre: "Medios", min: -12, max: 12, paso: 1, ver: dB },
      { k: "agudos", nombre: "Agudos", min: -12, max: 12, paso: 1, ver: dB },
    ],
  },
  {
    id: "chorus",
    nombre: "Chorus",
    mandos: [
      { k: "velocidad", nombre: "Velocidad", min: 0, max: 1, paso: 0.01, ver: pct },
      { k: "profundidad", nombre: "Profundidad", min: 0, max: 1, paso: 0.01, ver: pct },
      { k: "mezcla", nombre: "Mezcla", min: 0, max: 1, paso: 0.01, ver: pct },
    ],
  },
  {
    id: "delay",
    nombre: "Delay (eco)",
    mandos: [
      { k: "tiempo", nombre: "Tiempo", min: 60, max: 1200, paso: 10, ver: (v) => `${Math.round(v)} ms` },
      { k: "repeticiones", nombre: "Repeticiones", min: 0, max: 0.85, paso: 0.01, ver: pct },
      { k: "mezcla", nombre: "Mezcla", min: 0, max: 1, paso: 0.01, ver: pct },
    ],
  },
  {
    id: "reverb",
    nombre: "Reverb",
    mandos: [
      { k: "tamano", nombre: "Sala", min: 0, max: 1, paso: 0.01, ver: pct },
      { k: "mezcla", nombre: "Mezcla", min: 0, max: 1, paso: 0.01, ver: pct },
    ],
  },
];

function Deslizador({ nombre, valor, min, max, paso, ver, onCambio }: { nombre: string; valor: number; min: number; max: number; paso: number; ver: (v: number) => string; onCambio: (v: number) => void }) {
  return (
    <label className="mesa-mando">
      <span className="mesa-mando-nombre">{nombre}</span>
      <input
        type="range"
        className="metro-barra"
        min={min}
        max={max}
        step={paso}
        value={valor}
        onChange={(e) => onCambio(Number(e.target.value))}
        style={{ "--hecho": `${((valor - min) / (max - min)) * 100}%` } as CSSProperties}
      />
      <output className="mesa-mando-valor">{ver(valor)}</output>
    </label>
  );
}

export default function MesaPanel() {
  const hidratado = useHidratado();
  const estado = useEstadoMesa();
  const [cambiados, setAjustes] = useState<AjustesMesa | null>(null);
  const [canal, setCanal] = useState<0 | 1>(0);
  const [retraso, setRetraso] = useState<number | null>(null);
  const ajustes = cambiados ?? (hidratado ? leerAjustesMesa() : AJUSTES_INICIALES);
  const medidores = useRef<(HTMLSpanElement | null)[]>([]);
  const encendida = estado === "encendida";

  const cambiar = (nuevo: AjustesMesa) => {
    setAjustes(nuevo);
    guardarAjustesMesa(nuevo);
    mesa.aplicar(nuevo);
  };
  const cambiarCanal = (f: (c: AjustesCanal) => AjustesCanal) => {
    const canales = [...ajustes.canales] as AjustesMesa["canales"];
    canales[canal] = f(canales[canal]);
    cambiar({ ...ajustes, canales });
  };

  const encender = async () => {
    if (encendida) return mesa.apagar();
    const r = await mesa.encender(ajustes);
    if (r === "encendida") setRetraso(mesa.retrasoMs());
  };

  // Los medidores (sin pasar por React: 30 veces por segundo)
  useEffect(() => {
    if (!encendida) return;
    let raf = 0;
    const bucle = () => {
      raf = requestAnimationFrame(bucle);
      const n = mesa.niveles();
      [n.canales[0] ?? 0, n.canales[1] ?? 0, n.general].forEach((v, i) => {
        const el = medidores.current[i];
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
    };
  }, [encendida]);

  const c = ajustes.canales[canal];
  const sinEntrada2 = encendida && mesa.entradas < 2 && canal === 1;

  return (
    <div className="mesa">
      <div className="mesa-arriba">
        <button type="button" className={`mesa-encender${encendida ? " on" : ""}`} onClick={() => void encender()} disabled={estado === "abriendo"} aria-pressed={encendida}>
          <span className="mesa-led" aria-hidden="true" />
          {encendida ? "Apagar" : estado === "abriendo" ? "Abriendo…" : "Encender"}
        </button>
        <div className="mesa-general">
          <Deslizador nombre="General" valor={ajustes.general} min={0} max={1.5} paso={0.01} ver={pct} onCambio={(general) => cambiar({ ...ajustes, general })} />
          <span className="medidor" ref={(el) => void (medidores.current[2] = el)} aria-hidden="true" />
        </div>
      </div>

      <p className="mesa-info">
        {encendida
          ? `${mesa.nombreEntrada || "Entrada"} · ${mesa.entradas === 1 ? "1 entrada" : "2 entradas"}${retraso !== null ? ` · retraso ≈ ${retraso} ms` : ""}`
          : estado === "denegada"
            ? "Sin permiso para el micrófono: actívalo en los ajustes del navegador."
            : estado === "error" || estado === "sin-soporte"
              ? "No se ha podido abrir la entrada de audio en este aparato."
              : "Con cascos en la interfaz: por el altavoz se acopla. La entrada se elige en Ajustes."}
      </p>

      <div className="mesa-canales" role="tablist" aria-label="Canales">
        {[0, 1].map((i) => (
          <button key={i} type="button" role="tab" aria-selected={canal === i} className={canal === i ? "activo" : ""} onClick={() => setCanal(i as 0 | 1)}>
            <span>Entrada {i + 1}</span>
            <span className="medidor" ref={(el) => void (medidores.current[i] = el)} aria-hidden="true" />
          </button>
        ))}
      </div>

      <section className="mesa-canal" aria-label={`Entrada ${canal + 1}`}>
        {sinEntrada2 && <p className="mesa-info">Esta entrada solo da un canal al navegador.</p>}
        <Deslizador nombre="Ganancia" valor={c.ganancia} min={0} max={30} paso={1} ver={dB} onCambio={(ganancia) => cambiarCanal((x) => ({ ...x, ganancia }))} />
        <Deslizador nombre="Volumen" valor={c.volumen} min={0} max={1.5} paso={0.01} ver={pct} onCambio={(volumen) => cambiarCanal((x) => ({ ...x, volumen }))} />
        <Deslizador
          nombre="Panorama"
          valor={c.panorama}
          min={-1}
          max={1}
          paso={0.05}
          ver={(v) => (Math.abs(v) < 0.03 ? "Centro" : v < 0 ? `Izq. ${Math.round(-v * 100)}` : `Der. ${Math.round(v * 100)}`)}
          onCambio={(panorama) => cambiarCanal((x) => ({ ...x, panorama }))}
        />
        <button type="button" className={`interruptor${c.silencio ? " on" : ""}`} role="switch" aria-checked={c.silencio} onClick={() => cambiarCanal((x) => ({ ...x, silencio: !x.silencio }))}>
          <span className="interruptor-pista" aria-hidden="true">
            <span className="interruptor-bola" />
          </span>
          <span>Silencio</span>
        </button>

        <div className="mesa-sonidos" aria-label="Sonidos">
          {SONIDOS.map((s) => (
            <button key={s.nombre} type="button" onClick={() => cambiarCanal((x) => ({ ...x, ...structuredClone(s.efectos) }))}>
              {s.nombre}
            </button>
          ))}
        </div>

        <ul className="mesa-efectos">
          {EFECTOS.map((e) => {
            const valores = c[e.id] as unknown as Record<string, number> & { activo: boolean };
            return (
              <li key={e.id} className={valores.activo ? "activo" : ""}>
                <button
                  type="button"
                  className={`interruptor${valores.activo ? " on" : ""}`}
                  role="switch"
                  aria-checked={valores.activo}
                  onClick={() => cambiarCanal((x) => ({ ...x, [e.id]: { ...x[e.id], activo: !x[e.id].activo } }))}
                >
                  <span className="interruptor-pista" aria-hidden="true">
                    <span className="interruptor-bola" />
                  </span>
                  <span>{e.nombre}</span>
                </button>
                {valores.activo &&
                  e.mandos.map((m) => (
                    <Deslizador
                      key={m.k}
                      nombre={m.nombre}
                      valor={valores[m.k]}
                      min={m.min}
                      max={m.max}
                      paso={m.paso}
                      ver={m.ver}
                      onCambio={(v) => cambiarCanal((x) => ({ ...x, [e.id]: { ...x[e.id], [m.k]: v } }))}
                    />
                  ))}
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
}
