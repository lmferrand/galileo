// Trozos de pistas mientras se separa una canción: se guardan en el aparato
// según salen, para no tener la canción entera en memoria (en el móvil no
// cabría). Al acabar se juntan en un WAV por pista y se borran.

const BD = "clavija-temporal";

let abierta: Promise<IDBDatabase> | null = null;

function abrir(): Promise<IDBDatabase> {
  if (!abierta) {
    abierta = new Promise((ok, mal) => {
      const pet = indexedDB.open(BD, 1);
      pet.onupgradeneeded = () => pet.result.createObjectStore("bloques");
      pet.onsuccess = () => ok(pet.result);
      pet.onerror = () => {
        abierta = null;
        mal(pet.error ?? new Error("No se puede abrir el almacén del aparato."));
      };
    });
  }
  return abierta;
}

function terminar(tx: IDBTransaction): Promise<void> {
  return new Promise((ok, mal) => {
    tx.oncomplete = () => ok();
    tx.onerror = () => mal(tx.error);
    tx.onabort = () => mal(tx.error ?? new Error("No se ha podido guardar: puede que el aparato esté lleno."));
  });
}

const clave = (pista: string, indice: number) => `${pista}:${String(indice).padStart(5, "0")}`;

export async function guardarBloque(pistas: Record<string, Int16Array>, indice: number) {
  const db = await abrir();
  const tx = db.transaction("bloques", "readwrite");
  const store = tx.objectStore("bloques");
  for (const [pista, datos] of Object.entries(pistas)) store.put(new Blob([datos as unknown as BlobPart]), clave(pista, indice));
  await terminar(tx);
}

export async function leerBloques(pista: string, cuantos: number): Promise<Blob[]> {
  const db = await abrir();
  const store = db.transaction("bloques").objectStore("bloques");
  return Promise.all(
    Array.from(
      { length: cuantos },
      (_, i) =>
        new Promise<Blob>((ok, mal) => {
          const pet = store.get(clave(pista, i));
          pet.onsuccess = () => (pet.result ? ok(pet.result as Blob) : mal(new Error("Falta un trozo de la pista.")));
          pet.onerror = () => mal(pet.error);
        }),
    ),
  );
}

export async function vaciarTemporal() {
  try {
    const db = await abrir();
    const tx = db.transaction("bloques", "readwrite");
    tx.objectStore("bloques").clear();
    await terminar(tx);
  } catch {
    /* no pasa nada */
  }
}
