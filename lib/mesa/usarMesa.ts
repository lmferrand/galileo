// El estado de la Mesa para las pantallas (encendida, apagada…), siempre al día.

import { useSyncExternalStore } from "react";
import { mesa, type EstadoMesa } from "./mesa";

export const useEstadoMesa = (): EstadoMesa =>
  useSyncExternalStore(
    (f) => mesa.alCambiar(f),
    () => mesa.estado,
    () => "apagada",
  );
