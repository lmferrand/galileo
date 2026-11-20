// Clavija: comprime una pista (Int16 estéreo intercalado, 44,1 kHz) a MP3: para subirla a la nube y
// para exportar la mezcla o una toma. Usa lamejs (LGPL), que va dentro de la app (public/lamejs, ver
// su LEEME.txt): así también funciona sin conexión.
//
// Recibe: { datos: Int16Array, kbps, progreso? }   Envía: { tipo: 'hecho', mp3: ArrayBuffer } | { tipo: 'error', mensaje }
// Con `progreso`, también { tipo: 'progreso', hecho: 0–1 } de vez en cuando (al exportar un MP3 largo).

import { Mp3Encoder } from "./lamejs/lamejs.js";

self.onmessage = (e) => {
  try {
    const { datos, kbps, progreso } = e.data;
    const frames = datos.length >> 1;
    const L = new Int16Array(frames);
    const R = new Int16Array(frames);
    for (let i = 0; i < frames; i++) {
      L[i] = datos[2 * i];
      R[i] = datos[2 * i + 1];
    }
    const enc = new Mp3Encoder(2, 44100, kbps || 112);
    const partes = [];
    let total = 0;
    for (let i = 0, vuelta = 0; i < frames; i += 1152, vuelta++) {
      if (progreso && vuelta % 150 === 0) self.postMessage({ tipo: "progreso", hecho: i / frames });
      const b = enc.encodeBuffer(L.subarray(i, i + 1152), R.subarray(i, i + 1152));
      if (b.length) {
        partes.push(b);
        total += b.length;
      }
    }
    const fin = enc.flush();
    if (fin.length) {
      partes.push(fin);
      total += fin.length;
    }
    const mp3 = new Uint8Array(total);
    let o = 0;
    for (const p of partes) {
      mp3.set(p, o);
      o += p.length;
    }
    self.postMessage({ tipo: "hecho", mp3: mp3.buffer }, [mp3.buffer]);
  } catch (err) {
    self.postMessage({ tipo: "error", mensaje: String(err?.message || err) });
  }
};
