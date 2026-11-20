"use client";

// La pestaña «Mesa»: la sala de control del estudio (EstudioMesa) como pantalla propia, con la
// cabecera arriba para cambiar de pestaña. Tocas la mesa de mezclas y entras en la consola; la
// canción se elige en la placa de la grabadora y se carga aquí mismo (Reproduccion, solo con su
// Mesa). La ✕ quita la canción y deja la Mesa vacía.
// Al ocultarse (cambias de pestaña; ver next.config.ts) se quita la canción, como hace Pistas: su
// sonido ya ha parado y, al volver, no hay que cargar de nuevo sus pistas a medias.

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import EstudioMesa from "./EstudioMesa";
import Reproduccion from "./Reproduccion";
import { listarCanciones } from "@/lib/pistas/almacen";
import type { Cancion } from "@/lib/pistas/tipos";
import { usePestanaVisible } from "@/lib/pestana";

export default function PaginaMesa() {
  usePestanaVisible("mesa");
  const [canciones, setCanciones] = useState<Cancion[] | null>(null);
  const [cancion, setCancion] = useState<Cancion | null>(null);
  const leer = useCallback(() => {
    listarCanciones()
      .then(setCanciones)
      .catch(() => setCanciones([]));
  }, []);
  // Al entrar (y al volver a la pestaña): las canciones que haya ahora
  useEffect(() => {
    leer();
  }, [leer]);
  useLayoutEffect(() => () => setCancion(null), []);

  return (
    <main className="app app-mesa">
      {cancion ? (
        <Reproduccion
          key={cancion.id}
          cancion={cancion}
          soloMesa
          mesaAlEntrar
          canciones={canciones ?? []}
          onAbrirOtra={setCancion}
          onVolver={() => setCancion(null)}
          onRenombrada={leer}
        />
      ) : (
        <EstudioMesa pagina selector={canciones ? { canciones, actual: "", onElegir: setCancion } : undefined} />
      )}
    </main>
  );
}
