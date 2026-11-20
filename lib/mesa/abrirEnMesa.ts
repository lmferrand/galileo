// Abrir una canción en la Mesa de Pistas desde otra pestaña (la Mesa del afinador): se apunta aquí,
// se pasa a Pistas y Pistas la abre al aparecer, ya en la consola. Sus efectos vuelven a correr cada
// vez que se ve, aunque ya estuviera montada (ver next.config.ts).

let pendiente: string | null = null;

export function pedirAbrirEnMesa(id: string) {
  pendiente = id;
}

/** La canción que espera a abrirse en la Mesa (y se olvida: solo se abre una vez). */
export function tomarAbrirEnMesa(): string | null {
  const id = pendiente;
  pendiente = null;
  return id;
}
