// Biblioteca de canciones en el propio aparato (IndexedDB). Nada sale a internet.
// Dos almacenes: «canciones» (datos ligeros para la lista) y «audios» (un WAV
// por pista, con clave "<id>:<pista>"). Tus tomas añadidas a una canción (lib/pistas/tomas) van
// igual: su audio en «audios» con clave "<id>:toma:<toma>" y su ficha en la de la canción.

import type { Cancion, Pista, TomaCancion } from "./tipos";

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

/** Guarda una pista suelta (al separar se van guardando de una en una). */
export async function guardarAudio(id: string, pista: Pista, blob: Blob) {
  const db = await abrir();
  const tx = db.transaction("audios", "readwrite");
  tx.objectStore("audios").put(blob, `${id}:${pista}`);
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

/** La ficha de una canción tal como está ahora en el aparato. */
export async function leerCancion(id: string): Promise<Cancion | null> {
  const db = await abrir();
  return new Promise((ok, mal) => {
    const pet = db.transaction("canciones").objectStore("canciones").get(id);
    pet.onsuccess = () => ok((pet.result as Cancion | undefined) ?? null);
    pet.onerror = () => mal(pet.error);
  });
}

const claveToma = (id: string, toma: string) => `${id}:toma:${toma}`;

/** Añade una toma a la canción: su audio y su ficha, de una vez. Con `tope`, falla si ya hay tantas. */
export async function guardarTomaCancion(id: string, toma: TomaCancion, audio: Blob, tope = Infinity) {
  const db = await abrir();
  const tx = db.transaction(["canciones", "audios"], "readwrite");
  const store = tx.objectStore("canciones");
  const pet = store.get(id);
  let fallo: Error | null = null;
  pet.onsuccess = () => {
    const cancion = pet.result as Cancion | undefined;
    const antes = (cancion?.tomas ?? []).filter((t) => t.id !== toma.id);
    if (!cancion) fallo = new Error("Esta canción ya no está en el aparato.");
    else if (antes.length >= tope) fallo = new Error(`Ya hay ${tope} tomas añadidas a esta canción: borra alguna para añadir otra.`);
    if (fallo) return tx.abort();
    tx.objectStore("audios").put(audio, claveToma(id, toma.id));
    store.put({ ...cancion, tomas: [...antes, toma], id });
  };
  try {
    await hecho(tx);
  } catch (e) {
    throw fallo ?? e;
  }
}

export async function leerAudioToma(id: string, toma: string): Promise<Blob | null> {
  const db = await abrir();
  return new Promise((ok, mal) => {
    const pet = db.transaction("audios").objectStore("audios").get(claveToma(id, toma));
    pet.onsuccess = () => ok((pet.result as Blob | undefined) ?? null);
    pet.onerror = () => mal(pet.error);
  });
}

/** Quita una toma de la canción (su audio y su ficha). */
export async function borrarTomaCancion(id: string, toma: string) {
  const db = await abrir();
  const tx = db.transaction(["canciones", "audios"], "readwrite");
  const store = tx.objectStore("canciones");
  tx.objectStore("audios").delete(claveToma(id, toma));
  const pet = store.get(id);
  pet.onsuccess = () => {
    const cancion = pet.result as Cancion | undefined;
    if (cancion?.tomas) store.put({ ...cancion, tomas: cancion.tomas.filter((t) => t.id !== toma), id });
  };
  await hecho(tx);
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

/** El grupo de la canción en el selector de pistas (null: el automático). */
export async function cambiarGrupo(id: string, grupo: string | null) {
  await actualizarCancion(id, { grupo: grupo ?? undefined });
}

export async function borrarCancion(id: string, pistas: Pista[]) {
  const db = await abrir();
  const tx = db.transaction(["canciones", "audios"], "readwrite");
  tx.objectStore("canciones").delete(id);
  for (const p of pistas) tx.objectStore("audios").delete(`${id}:${p}`);
  // Y sus tomas añadidas
  tx.objectStore("audios").delete(IDBKeyRange.bound(`${id}:toma:`, `${id}:toma:\uffff`));
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
