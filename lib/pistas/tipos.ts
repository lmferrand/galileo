// Las 6 pistas que saca el separador, en el orden en que se muestran.

export type Pista = "voz" | "guitarra" | "bajo" | "bateria" | "piano" | "resto";

export const PISTAS: { id: Pista; nombre: string; /** «la voz», «el bajo»… */ conArticulo: string }[] = [
  { id: "voz", nombre: "Voz", conArticulo: "la voz" },
  { id: "guitarra", nombre: "Guitarra", conArticulo: "la guitarra" },
  { id: "bajo", nombre: "Bajo", conArticulo: "el bajo" },
  { id: "bateria", nombre: "Batería", conArticulo: "la batería" },
  { id: "piano", nombre: "Piano", conArticulo: "el piano" },
  { id: "resto", nombre: "Resto", conArticulo: "el resto" },
];

export const FRECUENCIA = 44100;

/** Una toma tuya añadida a la canción: suena con ella desde su sitio (lib/pistas/tomas) */
export interface TomaCancion {
  id: string;
  nombre: string;
  /** Fotograma de la canción (a FRECUENCIA) en que empieza */
  desde: number;
  /** Milisegundos que la has movido a mano desde donde se grabó (positivo: suena después) */
  movida?: number;
  frames: number;
  /** De 0 a 1,5 (1 = como se grabó) */
  volumen: number;
  silencio: boolean;
  creada: number;
}

export interface Cancion {
  id: string;
  nombre: string;
  /** segundos */
  duracion: number;
  frames: number;
  creada: number;
  /** bytes que ocupan sus pistas en el aparato */
  bytes: number;
  /** cómo se separó: con la gráfica (webgpu) o solo con el procesador (wasm) */
  motor?: string;
  segundosSeparando?: number;
  /** Autoría y licencia (la canción de ejemplo). */
  credito?: string;
  /** Ya está subida a la nube (para tenerla en el móvil). */
  nube?: boolean;
  /** Su grupo en el selector de pistas (artista, álbum, proyecto…); sin poner, uno automático (lib/pistas/grupos). */
  grupo?: string;
  /** Tus tomas añadidas a la canción (su audio va aparte, en el almacén del aparato) */
  tomas?: TomaCancion[];
}

export function formatoTiempo(segundos: number): string {
  if (!Number.isFinite(segundos) || segundos < 0) segundos = 0;
  const m = Math.floor(segundos / 60);
  const s = Math.floor(segundos % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function formatoMB(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toLocaleString("es-ES", { maximumFractionDigits: 1 })} GB`;
  return `${Math.round(bytes / 1e6).toLocaleString("es-ES")} MB`;
}
