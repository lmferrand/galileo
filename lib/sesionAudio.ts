// La «sesión de audio» del iPhone (navigator.audioSession, Safari 16.4 en adelante). Si la app no dice
// nada, lo que suena por aquí se calla con el interruptor de silencio del iPhone: el metrónomo, la nota
// de referencia, las lecciones… Hay que decir que es «reproducción». Pero con un micro abierto eso lo
// cortaría: ahí se deja elegir al iPhone, que con el micro en marcha ya no calla nada.
// (El reproductor de canciones y la Mesa ya lo hacían por su cuenta: lib/pistas/reproductor, lib/mesa/mesa.)
// Hecho según lo que documenta WebKit; sin comprobar en un iPhone de verdad (21-nov-2026).

type Sesion = { type: string };

const sesion = (): Sesion | null => (typeof navigator === "undefined" ? null : ((navigator as Navigator & { audioSession?: Sesion }).audioSession ?? null));

/** Los micros que ha abierto la app (cuentan mientras su pista siga viva) */
const micros = new Set<MediaStream>();

function hayMicro(): boolean {
  for (const f of micros) {
    if (f.getAudioTracks().some((p) => p.readyState === "live")) return true;
    micros.delete(f);
  }
  return false;
}

/** Antes de abrir un micro: si se venía de «reproducción» (una canción, el metrónomo), se suelta: con ella el iPhone no deja grabar */
export function antesDelMicro() {
  try {
    const s = sesion();
    if (s && s.type === "playback") s.type = "auto";
  } catch {
    /* navegador sin audioSession */
  }
}

/** Un micro recién abierto */
export function apuntarMicro(flujo: MediaStream | null) {
  if (flujo) micros.add(flujo);
}

/**
 * Antes de sonar algo (dentro del toque), y al cerrar un micro: que suene aunque el iPhone esté en
 * silencio. Con un micro abierto, o con las entradas de la Mesa encendidas, no se toca nada.
 */
export function sonarAunqueEnSilencio() {
  try {
    const s = sesion();
    if (s && s.type !== "playback" && s.type !== "play-and-record" && !hayMicro()) s.type = "playback";
  } catch {
    /* navegador sin audioSession */
  }
}
