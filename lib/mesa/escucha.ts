// Oírse en los cascos: lo que tocas o cantas vuelve por los cascos pasando por la Mesa (con sus
// efectos), pero con el retraso del aparato. Para cantar o tocar a tiempo se puede apagar y oírse
// sin retraso: con la escucha directa de la interfaz («direct monitor») o apartando un poco un
// auricular. Apagado, REC sigue grabando lo que entra. Se recuerda en este aparato.

// Dos maneras de grabar en la Mesa (se elige al encender las entradas la primera vez):
//  - «interfaz»: el instrumento o el micro van enchufados a una interfaz de audio. Te oyes mientras
//    tocas, con tus efectos (es la manera principal).
//  - «sin»: con el micrófono del móvil o del ordenador. No te oyes mientras grabas (tu voz llega
//    tarde y complica cantar a tiempo; sin cascos, además, se acopla): grabas y, al parar, escuchas
//    la toma con la canción.
// El modo decide cómo viene puesto «Oírme en los cascos», que sigue pudiéndose cambiar aparte.

const CLAVE = "galileo:mesa:escucha";
const CLAVE_MODO = "galileo:mesa:modo";

export type ModoGrabar = "interfaz" | "sin";

/** Cómo se graba en este aparato, o null si aún no se ha elegido. */
export function leerModoGrabar(): ModoGrabar | null {
  try {
    const m = localStorage.getItem(CLAVE_MODO);
    return m === "interfaz" || m === "sin" ? m : null;
  } catch {
    return null;
  }
}

/** Guarda el modo y, con él, si te oyes en los cascos (con interfaz, sí; sin ella, no). */
export function guardarModoGrabar(m: ModoGrabar) {
  try {
    localStorage.setItem(CLAVE_MODO, m);
  } catch {
    /* sin almacenamiento */
  }
  guardarEscucha(m === "interfaz");
}

export function leerEscucha(): boolean {
  try {
    return localStorage.getItem(CLAVE) !== "no";
  } catch {
    return true;
  }
}

export function guardarEscucha(si: boolean) {
  try {
    localStorage.setItem(CLAVE, si ? "si" : "no");
  } catch {
    /* sin almacenamiento */
  }
}

/** A partir de este retraso (ms) se nota al cantar o tocar */
export const RETRASO_QUE_SE_NOTA = 30;
/** Y a partir de este, casi seguro son cascos Bluetooth */
export const RETRASO_BLUETOOTH = 120;
