// La cuenta antes de grabar en la Mesa: unos segundos de golpes al ritmo (de la canción o del
// metrónomo) para entrar a tiempo. Se puede quitar en el metrónomo de la Mesa; se recuerda.

export const SEGUNDOS_CUENTA = 3;

const CLAVE = "galileo:mesa:cuenta";

export function leerCuentaMesa(): boolean {
  try {
    return localStorage.getItem(CLAVE) !== "no";
  } catch {
    return true;
  }
}

export function guardarCuentaMesa(si: boolean) {
  try {
    localStorage.setItem(CLAVE, si ? "si" : "no");
  } catch {
    /* sin almacenamiento */
  }
}
