// El disco de Galileo («Mañana…»): sus canciones, ya separadas en 6 pistas. Se ven al tocar el
// estuche del escritorio de la Mesa (components/DiscoGalileo). Cada una vive fuera de la app, en una
// carpeta con sus 6 MP3 (como las de «Para tocar»): se baja al tocarla y se queda en el aparato, en la
// carpeta «Galileo» del selector de canciones.
// La lista va aquí dentro y no se pide a internet: el estuche se abre al instante, también sin
// conexión, y lo que ya tengas bajado suena igual.
// Con la lista vacía el estuche del escritorio no se toca: es solo la foto, como antes.

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
}

export const DISCO: { artista: string; titulo: string; base: string; motor?: string; temas: TemaDisco[] } = {
  artista: "Galileo",
  titulo: "Mañana…",
  /** Donde están las carpetas de las canciones (acaba en «/») */
  base: "",
  temas: [],
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
      credito: `«${t.titulo}», de ${DISCO.artista}. Del disco «${DISCO.titulo}».`,
      motor: DISCO.motor,
      frames: t.frames,
      duracion: t.duracion,
    },
    alProgreso,
  );
}
