// WAV de 16 bits: es como se guarda cada pista en el aparato (y como se
// descargará el backing track más adelante).

export const CABECERA_WAV = 44;

export function crearWav(muestras: Int16Array, frecuencia: number, canales = 2): Blob {
  const cabecera = new ArrayBuffer(CABECERA_WAV);
  const v = new DataView(cabecera);
  const datos = muestras.byteLength;
  const escribir = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  escribir(0, "RIFF");
  v.setUint32(4, 36 + datos, true);
  escribir(8, "WAVE");
  escribir(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, canales, true);
  v.setUint32(24, frecuencia, true);
  v.setUint32(28, frecuencia * canales * 2, true);
  v.setUint16(32, canales * 2, true);
  v.setUint16(34, 16, true);
  escribir(36, "data");
  v.setUint32(40, datos, true);
  return new Blob([cabecera, muestras.buffer as ArrayBuffer], { type: "audio/wav" });
}

/** Las muestras de un WAV hecho con crearWav (sin copiar más de la cuenta). */
export async function leerWav(blob: Blob): Promise<Int16Array> {
  const buffer = await blob.arrayBuffer();
  return new Int16Array(buffer, CABECERA_WAV, (buffer.byteLength - CABECERA_WAV) >> 1);
}
