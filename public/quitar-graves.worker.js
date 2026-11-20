// Galileo: «limpia» el bajo al abrir una canción. El separador deja parte del bajo metida en la
// guitarra, la voz, el piano y el resto (en «Something», un 28 % de los graves acababa en la
// guitarra). Aquí se quitan los graves de esas pistas (por debajo de `corte`) y se suman a la pista
// del bajo. La suma de todas queda igual (la canción completa suena idéntica), pero al quitar el
// bajo ya no se oye por las otras.
//
// El filtro va hacia delante y hacia atrás (sin desfase): así, restar los graves a una pista los
// quita de verdad. La batería no se toca: su bombo está en esos graves.
//
// Va por encargos, uno por pista, para repartirlos entre varios workers a la vez y empezar con cada
// pista en cuanto está descodificada (lib/pistas/limpiarBajo). Antes se hacía todo de una vez, al
// final, y la canción tardaba unos 2,5 s más en abrirse.
//   { tipo: "quitar", pista: Int16Array (estéreo intercalado), corte, frecuencia }
//       → { pista (ya sin sus graves), graves: Int16Array (lo quitado, estéreo intercalado) }
//   { tipo: "sumar", bajo: Int16Array, graves: Int16Array }
//       → { bajo } (con esos graves sumados)
// Si algo falla: { error }.

function coeficientes(f, sr) {
  const w = (2 * Math.PI * f) / sr;
  const al = Math.sin(w) / (2 * Math.SQRT1_2);
  const c = Math.cos(w);
  const a0 = 1 + al;
  return [(1 - c) / 2 / a0, (1 - c) / a0, (1 - c) / 2 / a0, (-2 * c) / a0, (1 - al) / a0];
}

self.onmessage = (e) => {
  const m = e.data;
  try {
    if (m.tipo === "sumar") {
      const b = m.bajo;
      const g = m.graves;
      const n = Math.min(b.length, g.length);
      for (let i = 0; i < n; i++) {
        const v = b[i] + g[i];
        b[i] = v > 32767 ? 32767 : v < -32768 ? -32768 : v;
      }
      self.postMessage({ bajo: b }, [b.buffer]);
      return;
    }

    const p = m.pista;
    const n = p.length >> 1;
    const [b0, b1, b2, a1, a2] = coeficientes(m.corte, m.frecuencia);
    const graves = new Int16Array(p.length);
    const ida = new Float32Array(n);
    for (let canal = 0; canal < 2; canal++) {
      // Ida: dos pasos bajos de 2.º orden seguidos (Linkwitz-Riley de 4.º orden)
      let x1 = 0;
      let x2 = 0;
      let y1 = 0;
      let y2 = 0;
      let u1 = 0;
      let u2 = 0;
      let v1 = 0;
      let v2 = 0;
      for (let i = 0, j = canal; i < n; i++, j += 2) {
        const x = p[j];
        const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1;
        x1 = x;
        y2 = y1;
        y1 = y;
        const v = b0 * y + b1 * u1 + b2 * u2 - a1 * v1 - a2 * v2;
        u2 = u1;
        u1 = y;
        v2 = v1;
        v1 = v;
        ida[i] = v;
      }
      // Vuelta (lo mismo, del final al principio: se anula el desfase) y, de paso, se resta
      x1 = x2 = y1 = y2 = u1 = u2 = v1 = v2 = 0;
      for (let i = n - 1, j = 2 * (n - 1) + canal; i >= 0; i--, j -= 2) {
        const x = ida[i];
        const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
        x2 = x1;
        x1 = x;
        y2 = y1;
        y1 = y;
        const v = b0 * y + b1 * u1 + b2 * u2 - a1 * v1 - a2 * v2;
        u2 = u1;
        u1 = y;
        v2 = v1;
        v1 = v;
        const r = Math.round(v);
        const g = r > 32767 ? 32767 : r < -32768 ? -32768 : r;
        const q = p[j] - g;
        p[j] = q > 32767 ? 32767 : q < -32768 ? -32768 : q;
        graves[j] = g;
      }
    }
    self.postMessage({ pista: p, graves }, [p.buffer, graves.buffer]);
  } catch (err) {
    self.postMessage({ error: String((err && err.message) || err) });
  }
};
