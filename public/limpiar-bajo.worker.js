// Clavija: «limpia» el bajo al abrir una canción. El separador deja parte del bajo
// metida en la guitarra, la voz, el piano y el resto (en «Something», un 28 % de los
// graves acababa en la guitarra). Aquí se pasan los graves de esas pistas (por debajo
// de `corte`) a la pista del bajo. La suma de todas queda igual (la canción completa
// suena idéntica), pero al quitar el bajo ya no se oye por las otras.
//
// El filtro va hacia delante y hacia atrás (sin desfase): así, restar los graves a
// una pista los quita de verdad. La batería no se toca: su bombo está en esos graves.
//
// Recibe: { pistas: Int16Array[] (estéreo intercalado), bajo, otras: number[], corte, frecuencia }
// Envía:  { pistas } (las mismas, cambiadas)

function coeficientes(f, sr) {
  const w = (2 * Math.PI * f) / sr;
  const al = Math.sin(w) / (2 * Math.SQRT1_2);
  const c = Math.cos(w);
  const a0 = 1 + al;
  return [(1 - c) / 2 / a0, (1 - c) / a0, (1 - c) / 2 / a0, (-2 * c) / a0, (1 - al) / a0];
}

/** Paso bajo de 2.º orden, en el sitio, hacia delante (dir 1) o hacia atrás (dir -1). */
function pasada(x, co, dir) {
  const [b0, b1, b2, a1, a2] = co;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  const n = x.length;
  for (let k = 0; k < n; k++) {
    const i = dir > 0 ? k : n - 1 - k;
    const v = x[i];
    const y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1;
    x1 = v;
    y2 = y1;
    y1 = y;
    x[i] = y;
  }
}

const recortar = (v) => (v > 32767 ? 32767 : v < -32768 ? -32768 : Math.round(v));

self.onmessage = (e) => {
  const { pistas, bajo, otras, corte, frecuencia } = e.data;
  try {
    const co = coeficientes(corte, frecuencia);
    const b = pistas[bajo];
    const n = b.length >> 1;
    const graves = new Float32Array(n);
    for (const s of otras) {
      const p = pistas[s];
      if (!p || p.length !== b.length) continue;
      for (let canal = 0; canal < 2; canal++) {
        for (let i = 0; i < n; i++) graves[i] = p[2 * i + canal];
        // Linkwitz-Riley de 4.º orden, ida y vuelta
        pasada(graves, co, 1);
        pasada(graves, co, 1);
        pasada(graves, co, -1);
        pasada(graves, co, -1);
        for (let i = 0; i < n; i++) {
          const j = 2 * i + canal;
          const g = graves[i];
          p[j] = recortar(p[j] - g);
          b[j] = recortar(b[j] + g);
        }
      }
    }
    self.postMessage({ pistas }, pistas.map((p) => p.buffer));
  } catch (err) {
    self.postMessage({ error: String(err?.message || err), pistas }, pistas.map((p) => p.buffer));
  }
};
