// true en el navegador ya hidratado, false en el servidor y en la primera pintada: para leer lo
// guardado en el aparato (localStorage) sin que el HTML del servidor y el del navegador difieran.

import { useSyncExternalStore } from "react";

const sinCambios = () => () => undefined;

export const useHidratado = () =>
  useSyncExternalStore(
    sinCambios,
    () => true,
    () => false,
  );
