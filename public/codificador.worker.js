// Clavija: comprime una pista (Int16 estéreo intercalado, 44,1 kHz) a MP3
// para subirla a la nube. Usa lamejs (LGPL) desde jsDelivr.
//
// Recibe: { datos: Int16Array, kbps }   Envía: { tipo: 'hecho', mp3: ArrayBuffer } | { tipo: 'error', mensaje }

import { Mp3Encoder } from "https://cdn.jsdelivr.net/npm/@breezystack/lamejs@1.2.7/+esm";

self.onmessage = (e) => {
  try {
    const { datos, kbps } = e.data;
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
    for (let i = 0; i < frames; i += 1152) {
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
