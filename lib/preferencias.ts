// Lo que se recuerda en este aparato: instrumento, afinación elegida en cada
// uno, La de referencia, notación y las afinaciones propias. Si el navegador no
// deja guardar (modo privado, almacenamiento bloqueado), la app sigue igual.

import type { Afinacion } from "./afinaciones";
import { INSTRUMENTOS, type InstrumentoId } from "./instrumentos";
import type { Notacion } from "./notas";

export interface Preferencias {
  instrumento: InstrumentoId;
  /** Afinación de las guitarras. */
  afinacionId: string;
  afinacionBajoId: string;
  la4: number;
  notacion: Notacion;
  propias: Afinacion[];
}

export const PREFERENCIAS_INICIALES: Preferencias = {
  instrumento: "acustica",
  afinacionId: "estandar",
  afinacionBajoId: "bajo-estandar",
  la4: 440,
  notacion: "latina",
  propias: [],
};

const CLAVE = "clavija:preferencias:v1";

export function leerPreferencias(): Preferencias {
  try {
    const crudo = localStorage.getItem(CLAVE);
    if (!crudo) return PREFERENCIAS_INICIALES;
    const p = JSON.parse(crudo) as Partial<Preferencias>;
    const texto = (v: unknown, otro: string) => (typeof v === "string" ? v : otro);
    return {
      instrumento: INSTRUMENTOS.some((i) => i.id === p.instrumento) ? (p.instrumento as InstrumentoId) : PREFERENCIAS_INICIALES.instrumento,
      afinacionId: texto(p.afinacionId, PREFERENCIAS_INICIALES.afinacionId),
      afinacionBajoId: texto(p.afinacionBajoId, PREFERENCIAS_INICIALES.afinacionBajoId),
      la4: typeof p.la4 === "number" && p.la4 >= 415 && p.la4 <= 466 ? p.la4 : 440,
      notacion: p.notacion === "letras" ? "letras" : "latina",
      propias: Array.isArray(p.propias)
        ? p.propias
            .filter((a) => a && Array.isArray(a.notas) && a.notas.length === (a.familia === "bajo" ? 4 : 6))
            .map((a) => ({ ...a, grupo: "mias" as const }))
        : [],
    };
  } catch {
    return PREFERENCIAS_INICIALES;
  }
}

export function guardarPreferencias(p: Preferencias) {
  try {
    localStorage.setItem(CLAVE, JSON.stringify(p));
  } catch {
    /* sin almacenamiento: se queda solo para esta visita */
  }
}
