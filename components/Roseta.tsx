"use client";

// La boca de la guitarra hace de medidor: el mosaico de la roseta se enciende
// desde arriba (afinado) hacia el lado al que se va la nota. Arco superior =
// de −50 a +50 cents. Una manecilla de latón gira con la nota: nace por debajo de
// la boca (como la de un manómetro bajo su tapa) y se ve del borde hacia fuera,
// así no tapa la nota. Cuando la cuerda está afinada, la roseta brilla como el nácar.
// El aro de fuera se colorea según lo cerca que estés: verde afinada, amarillo
// cerca, azul si está grave y rojo si está aguda. La manecilla, el aro y el
// mosaico siguen a la nota con suavidad (no a saltos).

import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";

const C = 200;
const TESELAS = 72; // 5° cada una
const GRADOS_POR_CENT = 1.8; // ±50 cents = ±90°
// Lo que tarda la manecilla en alcanzar la nota (constante de tiempo, ms).
const SUAVIDAD_MS = 110;

// Colores del aro, mezclados en OKLab para que los pasos sean limpios.
type Lab = [number, number, number];
function aLab(hex: string): Lab {
  const lin = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s2 = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s2, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s2, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s2];
}
function aRgb([L, A, B]: Lab): string {
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s2 = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  const gam = (v: number) => {
    const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
    return Math.round(Math.max(0, Math.min(1, c)) * 255);
  };
  return `rgb(${gam(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s2)} ${gam(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s2)} ${gam(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s2)})`;
}
const mezcla = (a: Lab, b: Lab, t: number): Lab => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const VERDE = aLab("#46e08a");
const AMARILLO = aLab("#ffd43b");
const ROJO = aLab("#ff4a3d");
const AZUL = aLab("#3f8cff");

/** Afinada (±4) verde; cerca, amarillo; lejos, azul si está grave y rojo si está aguda. */
export function colorDeCents(cents: number): string {
  const a = Math.abs(cents);
  if (a <= 4) return aRgb(VERDE);
  if (a <= 12) return aRgb(mezcla(VERDE, AMARILLO, (a - 4) / 8));
  const lejos = cents < 0 ? AZUL : ROJO;
  return aRgb(mezcla(AMARILLO, lejos, Math.min(1, (a - 12) / 12)));
}

function punto(r: number, grados: number) {
  const a = (grados * Math.PI) / 180;
  return [C + r * Math.sin(a), C - r * Math.cos(a)] as const;
}

function sector(r1: number, r2: number, desde: number, hasta: number) {
  const [x1, y1] = punto(r2, desde);
  const [x2, y2] = punto(r2, hasta);
  const [x3, y3] = punto(r1, hasta);
  const [x4, y4] = punto(r1, desde);
  return `M${x1.toFixed(2)} ${y1.toFixed(2)}A${r2} ${r2} 0 0 1 ${x2.toFixed(2)} ${y2.toFixed(2)}L${x3.toFixed(2)} ${y3.toFixed(2)}A${r1} ${r1} 0 0 0 ${x4.toFixed(2)} ${y4.toFixed(2)}Z`;
}

interface Props {
  /** Desviación en cents, o null si no suena nada. */
  cents: number | null;
  afinada: boolean;
  /** Celebración: todas las cuerdas afinadas. */
  brillo: boolean;
  apagada: boolean;
  children: ReactNode;
}

export default function Roseta({ cents, afinada, brillo, apagada, children }: Props) {
  const teselas = useMemo(
    () =>
      Array.from({ length: TESELAS }, (_, i) => {
        const centro = i * 5 > 180 ? i * 5 - 360 : i * 5; // −175…180, 0 arriba
        return {
          i,
          centro,
          d: sector(152, 178, centro - 2.5 + 0.35, centro + 2.5 - 0.35),
          // Mosaico: grupos de tres (oscura, clara, oscura) como una roseta de taracea.
          variante: i % 3 === 1 ? "b" : "a",
        };
      }),
    [],
  );

  const marcas = useMemo(
    () =>
      Array.from({ length: 11 }, (_, i) => {
        const c = -50 + i * 10;
        const g = c * GRADOS_POR_CENT;
        const largo = c === 0 ? 14 : c % 50 === 0 ? 10 : 6;
        const [x1, y1] = punto(140, g);
        const [x2, y2] = punto(140 - largo, g);
        return { c, x1, y1, x2, y2 };
      }),
    [],
  );

  const c = cents === null ? null : Math.max(-50, Math.min(50, cents));

  // La nota que se pinta va detrás de la que suena, con suavidad. La manecilla y el aro
  // se mueven en cada fotograma sin pasar por React; el mosaico solo cambia cuando
  // se enciende o se apaga una tesela.
  const objetivo = useRef<number | null>(c);
  useEffect(() => {
    objetivo.current = c;
  }, [c]);
  const mostrada = useRef(0);
  const aguja = useRef<SVGGElement>(null);
  const aro = useRef<SVGGElement>(null);
  const [angulo, setAngulo] = useState(0);
  // La entrada del mosaico (CSS) dura como mucho 1,4 s; luego se quita para que no se repita al
  // volver de otra pestaña (la pantalla se queda montada, oculta).
  const [entrando, setEntrando] = useState(true);
  useEffect(() => {
    if (!entrando) return;
    const t = setTimeout(() => setEntrando(false), 1500);
    return () => clearTimeout(t);
  }, [entrando]);
  const sonando = c !== null;

  useEffect(() => {
    let raf = 0;
    let antes = performance.now();
    let ultimoAngulo = Number.NaN;
    let pintada = Number.NaN;
    const paso = (ahora: number) => {
      const dt = Math.min(100, ahora - antes);
      antes = ahora;
      const meta = objetivo.current;
      if (meta !== null) {
        const k = 1 - Math.exp(-dt / SUAVIDAD_MS);
        mostrada.current += (meta - mostrada.current) * k;
        if (Math.abs(meta - mostrada.current) < 0.05) mostrada.current = meta;
      }
      const v = mostrada.current;
      if (v === pintada) {
        raf = requestAnimationFrame(paso);
        return;
      }
      pintada = v;
      const g = v * GRADOS_POR_CENT;
      aguja.current?.style.setProperty("transform", `rotate(${g.toFixed(2)}deg)`);
      aro.current?.style.setProperty("color", colorDeCents(v));
      // El mosaico se enciende de 5 en 5 grados: solo se repinta al cambiar de tesela.
      const redondeado = Math.round(g / 2.5) * 2.5;
      if (redondeado !== ultimoAngulo) {
        ultimoAngulo = redondeado;
        setAngulo(g);
      }
      raf = requestAnimationFrame(paso);
    };
    raf = requestAnimationFrame(paso);
    return () => cancelAnimationFrame(raf);
  }, []);

  const encendida = (centro: number) => {
    if (!sonando || Math.abs(centro) > 92) return false;
    if (Math.abs(centro) < 2.6) return true;
    return angulo > 0 ? centro > 0 && centro - 2.5 <= angulo : centro < 0 && centro + 2.5 >= angulo;
  };

  return (
    <div className={`roseta ${entrando ? "entrando" : ""} ${afinada ? "es-afinada" : ""} ${brillo ? "es-brillo" : ""} ${apagada ? "es-apagada" : ""}`}>
      <svg viewBox="0 0 400 400" aria-hidden="true" className="roseta-svg">
        <defs>
          <radialGradient id="boca" cx="50%" cy="42%" r="60%">
            <stop offset="0%" stopColor="var(--boca-centro)" />
            <stop offset="100%" stopColor="var(--boca-borde)" />
          </radialGradient>
          <filter id="halo-aro" x="-10%" y="-10%" width="120%" height="120%">
            <feGaussianBlur stdDeviation="5" />
          </filter>
        </defs>

        <circle cx={C} cy={C} r={193} className="roseta-filete" />
        <circle cx={C} cy={C} r={186} className="roseta-filete fino" />

        {/* Aro de color entre los dos filetes de fuera: dice lo afinada que está */}
        <g ref={aro} className={`roseta-aro ${sonando ? "on" : ""}`}>
          <circle cx={C} cy={C} r={189.5} className="roseta-aro-halo" filter="url(#halo-aro)" />
          <circle cx={C} cy={C} r={189.5} className="roseta-aro-linea" />
        </g>
        <circle cx={C} cy={C} r={148} className="roseta-filete fino" />

        {teselas.map((t) => (
          <path
            key={t.centro}
            d={t.d}
            className={`tesela ${t.variante} ${encendida(t.centro) ? "on" : ""} ${Math.abs(t.centro) > 92 ? "fuera" : ""}`}
            style={{ "--i": Math.abs(t.centro) / 5 } as CSSProperties}
          />
        ))}

        {marcas.map((m) => (
          <line key={m.c} x1={m.x1} y1={m.y1} x2={m.x2} y2={m.y2} className={`raya ${m.c === 0 ? "cero" : ""}`} />
        ))}

        {/* Muesca de latón arriba: ahí está la nota perfecta. */}
        <path d="M200 4 L209 18 L191 18 Z" className="muesca" />

        {/* Manecilla: varilla que se afina hacia la punta, anillo de reloj antiguo y la perla. Su base queda bajo la boca. */}
        <g ref={aguja} className="aguja" style={{ opacity: sonando ? 1 : 0 }}>
          <path d="M194.4 104 L205.6 104 L202.3 48 L197.7 48 Z" className="aguja-varilla" />
          <circle cx={C} cy={40} r={7.2} className="aguja-anillo" />
          <path d="M200 5 L208 19 L200 33 L192 19 Z" className="aguja-perla" />
        </g>

        <circle cx={C} cy={C} r={128} fill="url(#boca)" className="boca" />
      </svg>

      <div className="roseta-nacar" aria-hidden="true" />
      <div className="roseta-centro">{children}</div>
    </div>
  );
}
