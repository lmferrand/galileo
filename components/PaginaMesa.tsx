"use client";

// La pestaña «Mesa»: la sala de control del estudio (EstudioMesa) como pantalla propia, con la
// cabecera arriba para cambiar de pestaña. Tocas la mesa de mezclas y entras en la consola; la
// canción se elige en la placa de la grabadora y se carga aquí mismo (Reproduccion, sin pintar nada:
// solo lleva la canción). La ✕ quita la canción y deja la Mesa vacía.
// La Mesa es siempre la misma pieza, con canción o sin ella: Reproduccion le entrega lo de la canción
// (alMesa). Antes la Mesa vacía la pintaba esta pantalla y la Mesa con canción, Reproduccion: al poner
// la primera canción se desmontaba una y se montaba otra, y la Mesa se iba y volvía a aparecer.
// Al ocultarse (cambias de pestaña; ver next.config.ts) se quita la canción, como hace Pistas: su
// sonido ya ha parado y, al volver, no hay que cargar de nuevo sus pistas a medias.

import { memo, useCallback, useEffect, useLayoutEffect, useState } from "react";
import EstudioMesa from "./EstudioMesa";
import Reproduccion from "./Reproduccion";
import type { PistasMesa } from "./ConsolaMesa";
import { listarCanciones } from "@/lib/pistas/almacen";
import type { Cancion } from "@/lib/pistas/tipos";
import { usePestanaVisible } from "@/lib/pestana";

// Con memo: cada vez que entrega lo de la canción esta pantalla se repinta, y no debe repintarla a ella
const Motor = memo(Reproduccion);
const SIN_CANCIONES: Cancion[] = [];

export default function PaginaMesa() {
  usePestanaVisible("mesa");
  const [canciones, setCanciones] = useState<Cancion[] | null>(null);
  const [cancion, setCancion] = useState<Cancion | null>(null);
  // Lo de la canción que suena, para la Mesa (lo entrega Reproduccion)
  const [pistas, setPistas] = useState<PistasMesa | undefined>(undefined);
  const leer = useCallback(() => {
    listarCanciones()
      .then(setCanciones)
      .catch(() => setCanciones([]));
  }, []);
  const quitar = useCallback(() => setCancion(null), []);
  // Al entrar (y al volver a la pestaña): las canciones que haya ahora
  useEffect(() => {
    leer();
  }, [leer]);
  useLayoutEffect(() => () => setCancion(null), []);

  return (
    <main className="app app-mesa">
      {cancion && (
        <Motor
          key="mesa"
          cancion={cancion}
          soloMesa
          mesaAlEntrar
          canciones={canciones ?? SIN_CANCIONES}
          onAbrirOtra={setCancion}
          onVolver={quitar}
          onRenombrada={leer}
          onCambiadas={leer}
          alMesa={setPistas}
        />
      )}
      <EstudioMesa
        pagina
        onCerrar={cancion ? quitar : undefined}
        pistas={cancion ? pistas : undefined}
        selector={canciones ? { canciones, actual: cancion?.id ?? "", onElegir: setCancion, onCambiadas: leer } : undefined}
      />
    </main>
  );
}
