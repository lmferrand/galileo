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
//
// La Mesa tumbada a mano. La Mesa se usa con el móvil tumbado, y hay móviles que no giran la pantalla
// (el iPhone con el giro bloqueado: desde la app no se puede girar). Para ellos, el aviso «Gira el
// móvil» ofrece «verla tumbada»: esta pantalla pone entonces un marco (iframe) girado un cuarto de
// vuelta que ocupa la pantalla entera, con la misma Mesa dentro (/mesa/tumbada, esta pieza con
// `enMarco`). Dentro del marco todo cree que el móvil está tumbado: las medidas, los estilos y dónde
// cae el dedo los resuelve el navegador, y la Mesa no tiene que saber nada del giro.
// El marco avisa para salir («Salir del estudio») con un mensaje; «atrás» también lo cierra.

import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import EstudioMesa from "./EstudioMesa";
import Reproduccion from "./Reproduccion";
import type { PistasMesa } from "./ConsolaMesa";
import { listarCanciones } from "@/lib/pistas/almacen";
import type { Cancion } from "@/lib/pistas/tipos";
import { usePestanaVisible } from "@/lib/pestana";
import { usePasoAtras } from "@/lib/atras";

// Con memo: cada vez que entrega lo de la canción esta pantalla se repinta, y no debe repintarla a ella
const Motor = memo(Reproduccion);
const SIN_CANCIONES: Cancion[] = [];
const SALIR_DEL_MARCO = "galileo:salir-tumbada";

export default function PaginaMesa({ enMarco = false }: { enMarco?: boolean }) {
  usePestanaVisible("mesa");
  const [canciones, setCanciones] = useState<Cancion[] | null>(null);
  const [cancion, setCancion] = useState<Cancion | null>(null);
  // Lo de la canción que suena, para la Mesa (lo entrega Reproduccion)
  const [pistas, setPistas] = useState<PistasMesa | undefined>(undefined);
  // La Mesa tumbada a mano, abierta (con la canción que había puesta, para que siga en el marco)
  const [tumbada, setTumbada] = useState<{ cancion: string | null } | null>(null);
  // En el marco: la canción que venía puesta se abre al leer la lista (una vez)
  const porAbrir = useRef(enMarco);
  const leer = useCallback(() => {
    listarCanciones()
      .then((lista) => {
        setCanciones(lista);
        if (!porAbrir.current) return;
        porAbrir.current = false;
        const id = new URLSearchParams(window.location.search).get("cancion");
        const c = id ? lista.find((x) => x.id === id) : undefined;
        if (c) setCancion(c);
      })
      .catch(() => setCanciones([]));
  }, []);
  const quitar = useCallback(() => setCancion(null), []);
  // Al entrar (y al volver a la pestaña): las canciones que haya ahora
  useEffect(() => {
    leer();
  }, [leer]);
  useLayoutEffect(
    () => () => {
      setCancion(null);
      setTumbada(null);
    },
    [],
  );

  // Fuera del marco: abrirlo (la canción pasa a sonar dentro) y cerrarlo cuando lo pide o con «atrás»
  const verTumbada = () => {
    setTumbada({ cancion: cancion?.id ?? null });
    setCancion(null);
  };
  useEffect(() => {
    if (!tumbada) return;
    const alMensaje = (e: MessageEvent) => {
      if (e.origin === window.location.origin && e.data === SALIR_DEL_MARCO) setTumbada(null);
    };
    window.addEventListener("message", alMensaje);
    return () => window.removeEventListener("message", alMensaje);
  }, [tumbada]);
  usePasoAtras(tumbada !== null, 1, () => setTumbada(null));

  // Dentro del marco: «Salir del estudio» se lo pide a la pantalla de fuera (abierta suelta, va a la Mesa)
  const marco = useMemo(
    () =>
      enMarco
        ? {
            alSalir: () => {
              if (window.parent !== window) window.parent.postMessage(SALIR_DEL_MARCO, window.location.origin);
              else window.location.replace("/mesa");
            },
          }
        : undefined,
    [enMarco],
  );

  if (tumbada) {
    return (
      <main className="app app-mesa">
        <iframe
          className="mesa-tumbada"
          src={`/mesa/tumbada${tumbada.cancion ? `?cancion=${encodeURIComponent(tumbada.cancion)}` : ""}`}
          title="La Mesa, tumbada"
          allow="microphone; autoplay; screen-wake-lock"
        />
      </main>
    );
  }

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
        enMarco={marco}
        alVerTumbada={enMarco ? undefined : verTumbada}
        onCerrar={cancion ? quitar : undefined}
        pistas={cancion ? pistas : undefined}
        selector={canciones ? { canciones, actual: cancion?.id ?? "", onElegir: setCancion, onCambiadas: leer } : undefined}
      />
    </main>
  );
}
