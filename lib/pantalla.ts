// Mantener la pantalla encendida (mientras separa o suena). Si el navegador
// no lo permite, no pasa nada: la pantalla se apagará a su hora.

export interface BloqueoPantalla {
  release: () => Promise<void>;
}

export async function mantenerPantalla(): Promise<BloqueoPantalla | null> {
  try {
    const wl = (navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<BloqueoPantalla> } }).wakeLock;
    return wl && document.visibilityState === "visible" ? await wl.request("screen") : null;
  } catch {
    return null;
  }
}
