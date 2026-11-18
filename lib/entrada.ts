// De qué entrada de sonido escucha Clavija: el micrófono del aparato o una interfaz
// de audio (la guitarra enchufada). Se recuerda en este aparato. Lo usan el
// afinador, el looper y la grabadora.

const CLAVE = "clavija:entrada:v1";

export function leerEntrada(): string {
  try {
    return localStorage.getItem(CLAVE) ?? "";
  } catch {
    return "";
  }
}

export function guardarEntrada(id: string) {
  try {
    if (id) localStorage.setItem(CLAVE, id);
    else localStorage.removeItem(CLAVE);
  } catch {
    /* sin almacenamiento */
  }
}

/** Lo que se pide al abrir el micro: sin procesar (para afinar y grabar instrumentos) y de la entrada elegida. */
export function pedirAudio(): MediaStreamConstraints {
  const id = leerEntrada();
  return {
    audio: {
      echoCancellation: false,
      noiseSuppression: false,
      autoGainControl: false,
      ...(id ? { deviceId: { ideal: id } } : {}),
    },
  };
}

export interface Entrada {
  id: string;
  nombre: string;
}

/** Las entradas del aparato. Sin permiso del micro, el navegador no da sus nombres. */
export async function listarEntradas(): Promise<Entrada[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  const todas = await navigator.mediaDevices.enumerateDevices();
  return todas
    .filter((d) => d.kind === "audioinput" && d.deviceId !== "default" && d.deviceId !== "communications")
    .map((d, i) => ({ id: d.deviceId, nombre: d.label || `Entrada ${i + 1}` }));
}
