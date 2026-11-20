"use client";

// La Mesa abierta desde el afinador: no suena ninguna canción, pero tus canciones están en la placa
// de la grabadora. Al poner una, la app pasa a Pistas con esa canción y la Mesa abierta en la consola
// (lib/mesa/abrirEnMesa).

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import EstudioMesa from "./EstudioMesa";
import { listarCanciones } from "@/lib/pistas/almacen";
import type { Cancion } from "@/lib/pistas/tipos";
import { pedirAbrirEnMesa } from "@/lib/mesa/abrirEnMesa";

export default function MesaAfinador({ onCerrar }: { onCerrar: () => void }) {
  const router = useRouter();
  const [canciones, setCanciones] = useState<Cancion[] | null>(null);
  const leer = useCallback(() => {
    listarCanciones()
      .then(setCanciones)
      .catch(() => setCanciones([]));
  }, []);
  useEffect(() => {
    leer();
  }, [leer]);

  return (
    <EstudioMesa
      onCerrar={onCerrar}
      selector={
        canciones
          ? {
              canciones,
              actual: "",
              onElegir: (c) => {
                pedirAbrirEnMesa(c.id);
                router.push("/pistas");
              },
              onCambiadas: leer,
            }
          : undefined
      }
    />
  );
}
