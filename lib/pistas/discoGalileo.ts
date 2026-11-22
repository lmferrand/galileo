// El disco de Galileo («Mañana…»): sus canciones, ya separadas en 6 pistas. Se ven al tocar el
// estuche del escritorio de la Mesa (components/DiscoGalileo). Cada una vive fuera de la app, en una
// carpeta con sus 6 MP3 (como las de «Para tocar»): se baja al tocarla y se queda en el aparato, en la
// carpeta «Galileo» del selector de canciones.
// La lista va aquí dentro y no se pide a internet: el estuche se abre al instante, también sin
// conexión, y lo que ya tengas bajado suena igual.
// Con la lista vacía el estuche del escritorio no se toca: es solo la foto, como antes.
// Las sube herramientas/disco-galileo/subir.mjs (TheClavija/galileo-manana, en Hugging Face), que
// también escribe las líneas de `temas`.

import { importarPistas } from "./importar";
import { PISTAS, type Cancion, type Pista } from "./tipos";

export interface TemaDisco {
  /** También es el nombre de su carpeta */
  id: string;
  titulo: string;
  /** segundos */
  duracion: number;
  frames: number;
  /** lo que ocupan sus 6 pistas */
  bytes: number;
  /** Aún no está subida: se ve en el libreto, pero no se puede poner */
  pronto?: boolean;
}

export const DISCO: { artista: string; titulo: string; base: string; motor?: string; temas: TemaDisco[] } = {
  artista: "Galileo",
  titulo: "Mañana…",
  /** Donde están las carpetas de las canciones (acaba en «/») */
  base: "https://huggingface.co/datasets/TheClavija/galileo-manana/resolve/main/",
  // (separadas con BS-RoFormer: no se les limpia el bajo al reproducir)
  motor: "roformer",
  temas: [
    { id: "loco", titulo: "Loco", duracion: 178.91, frames: 7890048, bytes: 15030858 },
    { id: "un-segundo-mas", titulo: "Un segundo más", duracion: 264.1, frames: 11646720, bytes: 22186422 },
    { id: "manana", titulo: "Mañana", duracion: 250, frames: 0, bytes: 0, pronto: true },
    { id: "no-mirar-atras", titulo: "No mirar atrás", duracion: 214, frames: 0, bytes: 0, pronto: true },
    { id: "ultimo-cafe", titulo: "Último café", duracion: 243, frames: 0, bytes: 0, pronto: true },
    { id: "descuido", titulo: "Descuido", duracion: 217, frames: 0, bytes: 0, pronto: true },
    { id: "barco-de-papel", titulo: "Barco de Papel", duracion: 229, frames: 0, bytes: 0, pronto: true },
    { id: "me-escape", titulo: "Me escapé", duracion: 227.37, frames: 10027008, bytes: 19101258 },
    { id: "confundido", titulo: "Confundido", duracion: 231.26, frames: 10198656, bytes: 19428204 },
  ],
};

/** El id con que se guarda en el aparato (así se sabe cuáles ya tienes). */
export const idDisco = (t: TemaDisco) => `galileo-${t.id}`;

export function bajarTemaDisco(t: TemaDisco, alProgreso: (fraccion: number) => void): Promise<Cancion> {
  const urls = Object.fromEntries(PISTAS.map((p) => [p.id, `${DISCO.base}${encodeURIComponent(t.id)}/${p.id}.mp3`])) as Record<Pista, string>;
  return importarPistas(
    urls,
    {
      id: idDisco(t),
      // («Galileo - Título»: en la lista de Pistas se sabe de quién es; en su carpeta se ve solo el título)
      nombre: `${DISCO.artista} - ${t.titulo}`,
      grupo: DISCO.artista,
      creada: Date.now(),
      credito: `«${t.titulo}», de ${DISCO.artista}. Del disco «${DISCO.titulo}». Separada en pistas con BS-RoFormer SW (jarredou).`,
      motor: DISCO.motor,
      frames: t.frames,
      duracion: t.duracion,
    },
    alProgreso,
  );
}
