// Oírse en los cascos: lo que tocas o cantas vuelve por los cascos pasando por la Mesa (con sus
// efectos), pero con el retraso del aparato. Para cantar o tocar a tiempo se puede apagar y oírse
// sin retraso: con la escucha directa de la interfaz («direct monitor») o apartando un poco un
// auricular. Apagado, REC sigue grabando lo que entra. Se recuerda en este aparato.

const CLAVE = "galileo:mesa:escucha";

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
