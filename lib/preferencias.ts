// Lo que se recuerda en este aparato: afinación elegida, La de referencia,
// notación y las afinaciones propias. Si el navegador no deja guardar
// (modo privado, almacenamiento bloqueado), la app sigue funcionando igual.

import type { Afinacion } from "./afinaciones";
import type { Notacion } from "./notas";

export interface Preferencias {
  afinacionId: string;
  la4: number;
  notacion: Notacion;
  propias: Afinacion[];
}

export const PREFERENCIAS_INICIALES: Preferencias = {
  afinacionId: "estandar",
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
    return {
      afinacionId: typeof p.afinacionId === "string" ? p.afinacionId : PREFERENCIAS_INICIALES.afinacionId,
      la4: typeof p.la4 === "number" && p.la4 >= 415 && p.la4 <= 466 ? p.la4 : 440,
      notacion: p.notacion === "letras" ? "letras" : "latina",
      propias: Array.isArray(p.propias)
        ? p.propias.filter((a) => a && Array.isArray(a.notas) && a.notas.length === 6).map((a) => ({ ...a, grupo: "mias" as const }))
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
