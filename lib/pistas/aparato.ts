// ¿Es un móvil o una tableta? (para ajustar límites y textos)

export function esMovil(): boolean {
  if (typeof navigator === "undefined") return false;
  const ipadComoMac = /Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1;
  return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || ipadComoMac;
}
