// Sonido de cada instrumento al elegirlo. Son grabaciones de verdad que eligió
// Leonardo (18-nov-2026), recortadas a unos 2 s con final suave y el volumen igualado
// (herramientas/separador/preparar-sonido.mjs):
//  - acústica: «Guitar in D», de wkinton en Freesound (n.º 171501), dominio público (CC0);
//  - eléctrica: «Electric guitar distorted slide», de Mixkit (n.º 2340), licencia gratuita
//    de Mixkit (se puede usar en apps; no se reparte suelto);
//  - bajo: «Bass-guitar sliding down», de TheEndOfACycle en Freesound (n.º 660534), CC0.
// Si cambian, nombres nuevos: la caché sin conexión sirve primero lo que ya tiene.

import type { InstrumentoId } from "./instrumentos";
import { sonarAunqueEnSilencio } from "./sesionAudio";

const ARCHIVOS: Record<InstrumentoId, string> = {
  acustica: "/sonidos/acustica-1.mp3",
  electrica: "/sonidos/electrica-1.mp3",
  bajo: "/sonidos/bajo-1.mp3",
};

type CtxAudio = typeof AudioContext;

let ctx: AudioContext | null = null;
const buferes = new Map<InstrumentoId, Promise<AudioBuffer | null>>();

function contexto(): AudioContext | null {
  if (ctx) return ctx;
  const Ctor: CtxAudio | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: CtxAudio }).webkitAudioContext;
  if (!Ctor) return null;
  ctx = new Ctor({ latencyHint: "interactive" });
  return ctx;
}

function cargar(id: InstrumentoId): Promise<AudioBuffer | null> {
  let b = buferes.get(id);
  if (!b) {
    const c = contexto();
    b = c
      ? fetch(ARCHIVOS[id])
          .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(String(r.status)))))
          .then((datos) => c.decodeAudioData(datos))
          .catch(() => {
            buferes.delete(id);
            return null;
          })
      : Promise.resolve(null);
    buferes.set(id, b);
  }
  return b;
}

/** Deja los sonidos listos antes de tocar (en la pantalla de elegir instrumento). */
export function precargarSonidos() {
  for (const id of Object.keys(ARCHIVOS) as InstrumentoId[]) void cargar(id);
}

/** Suena el instrumento. Hay que llamarlo dentro del toque: el iPhone solo deja sonar así. */
export function sonarInstrumento(id: InstrumentoId) {
  const c = contexto();
  if (!c) return;
  // Se despierta el audio en el mismo toque; el sonido puede llegar un instante después.
  sonarAunqueEnSilencio();
  void c.resume().catch(() => undefined);
  void cargar(id).then((buffer) => {
    if (!buffer) return;
    const fuente = c.createBufferSource();
    fuente.buffer = buffer;
    const volumen = c.createGain();
    volumen.gain.value = 0.9;
    fuente.connect(volumen).connect(c.destination);
    fuente.start();
    fuente.onended = () => volumen.disconnect();
  });
}
