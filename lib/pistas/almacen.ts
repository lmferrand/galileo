// Biblioteca de canciones en el propio aparato (IndexedDB). Nada sale a internet.
// Dos almacenes: «canciones» (datos ligeros para la lista) y «audios» (un WAV
// por pista, con clave "<id>:<pista>").

import type { Cancion, Pista } from "./tipos";

const BD = "clavija-pistas";
const VERSION = 1;

let abierta: Promise<IDBDatabase> | null = null;

function abrir(): Promise<IDBDatabase> {
  if (!abierta) {
    abierta = new Promise((ok, mal) => {
      const pet = indexedDB.open(BD, VERSION);
      pet.onupgradeneeded = () => {
        const db = pet.result;
        if (!db.objectStoreNames.contains("canciones")) db.createObjectStore("canciones", { keyPath: "id" });
        if (!db.objectStoreNames.contains("audios")) db.createObjectStore("audios");
      };
      pet.onsuccess = () => ok(pet.result);
      pet.onerror = () => {
        abierta = null;
        mal(pet.error ?? new Error("No se puede abrir el almacén del aparato."));
      };
    });
  }
  return abierta;
}

function hecho(tx: IDBTransaction): Promise<void> {
  return new Promise((ok, mal) => {
    tx.oncomplete = () => ok();
    tx.onerror = () => mal(tx.error);
    tx.onabort = () => mal(tx.error ?? new Error("No se ha podido guardar: puede que el aparato esté lleno."));
  });
}

export async function listarCanciones(): Promise<Cancion[]> {
  const db = await abrir();
  return new Promise((ok, mal) => {
    const pet = db.transaction("canciones").objectStore("canciones").getAll();
    pet.onsuccess = () => ok((pet.result as Cancion[]).sort((a, b) => b.creada - a.creada));
    pet.onerror = () => mal(pet.error);
  });
}

export async function guardarCancion(cancion: Cancion, audios: Record<Pista, Blob>) {
  const db = await abrir();
  const tx = db.transaction(["canciones", "audios"], "readwrite");
  const audiosStore = tx.objectStore("audios");
  for (const [pista, blob] of Object.entries(audios)) audiosStore.put(blob, `${cancion.id}:${pista}`);
  tx.objectStore("canciones").put(cancion);
  await hecho(tx);
}

export async function leerAudios(id: string, pistas: Pista[]): Promise<Record<Pista, Blob>> {
  const db = await abrir();
  const tx = db.transaction("audios");
  const store = tx.objectStore("audios");
  const resultado = {} as Record<Pista, Blob>;
  await Promise.all(
    pistas.map(
      (p) =>
        new Promise<void>((ok, mal) => {
          const pet = store.get(`${id}:${p}`);
          pet.onsuccess = () => {
            if (!pet.result) mal(new Error("Faltan pistas de esta canción en el aparato."));
            else {
              resultado[p] = pet.result as Blob;
              ok();
            }
          };
          pet.onerror = () => mal(pet.error);
        }),
    ),
  );
  return resultado;
}

export async function actualizarCancion(id: string, cambios: Partial<Cancion>) {
  const db = await abrir();
  const tx = db.transaction("canciones", "readwrite");
  const store = tx.objectStore("canciones");
  const pet = store.get(id);
  pet.onsuccess = () => {
    if (pet.result) store.put({ ...(pet.result as Cancion), ...cambios, id });
  };
  await hecho(tx);
}

export async function renombrarCancion(id: string, nombre: string) {
  await actualizarCancion(id, { nombre });
}

export async function borrarCancion(id: string, pistas: Pista[]) {
  const db = await abrir();
  const tx = db.transaction(["canciones", "audios"], "readwrite");
  tx.objectStore("canciones").delete(id);
  for (const p of pistas) tx.objectStore("audios").delete(`${id}:${p}`);
  await hecho(tx);
}

/** Pide al navegador que no borre la biblioteca cuando ande justo de espacio. */
export async function pedirPersistencia() {
  try {
    if (navigator.storage?.persisted && !(await navigator.storage.persisted())) await navigator.storage.persist?.();
  } catch {
    /* no pasa nada */
  }
}

export async function espacio(): Promise<{ usado: number; disponible: number } | null> {
  try {
    const e = await navigator.storage?.estimate?.();
    if (!e || e.quota === undefined || e.usage === undefined) return null;
    return { usado: e.usage, disponible: e.quota };
  } catch {
    return null;
  }
}
