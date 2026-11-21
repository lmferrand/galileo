// Galileo: pasa una pista recién descodificada (sus dos canales en coma flotante) a Int16 estéreo
// intercalado, que es como la guarda el reproductor.
//
// Se hace en otro hilo por la memoria: una pista descodificada ocupa 8 bytes por fotograma (85 MB una
// de 4 minutos) y, convertida, la mitad. Hecho en la página, el navegador soltaba lo descodificado
// cuando quería: al abrir una canción llegaban a estar las seis pistas descodificadas a la vez, unos
// 500 MB de golpe con una de 2:36 (medido el 21-nov-2026), y en el móvil el sistema cerraba la app.
// Aquí los canales llegan sin copiar (se transfieren) y este hilo se cierra al acabar: esa memoria
// se devuelve en el acto.
//   { l: Float32Array, r: Float32Array | null (mono), n: fotogramas de salida, m: fotogramas que hay }
//       → { s: Int16Array } o { error }

self.onmessage = (e) => {
  try {
    const { l, n, m } = e.data;
    const r = e.data.r || l;
    const s = new Int16Array(n * 2);
    for (let k = 0; k < m; k++) {
      const a = l[k] > 1 ? 1 : l[k] < -1 ? -1 : l[k];
      const b = r[k] > 1 ? 1 : r[k] < -1 ? -1 : r[k];
      s[2 * k] = a < 0 ? a * 32768 : a * 32767;
      s[2 * k + 1] = b < 0 ? b * 32768 : b * 32767;
    }
    self.postMessage({ s }, [s.buffer]);
  } catch (err) {
    self.postMessage({ error: String((err && err.message) || err) });
  }
  self.close();
};
