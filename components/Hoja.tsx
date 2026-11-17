"use client";

// Hoja que sube desde abajo (en el ordenador, centrada). Se cierra tocando
// fuera, con Escape o con el botón «Listo».

import { useEffect, useRef, type ReactNode } from "react";

interface Props {
  abierta: boolean;
  titulo: string;
  onCerrar: () => void;
  children: ReactNode;
  pie?: ReactNode;
}

export default function Hoja({ abierta, titulo, onCerrar, children, pie }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!abierta) return;
    const previo = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCerrar();
    };
    document.addEventListener("keydown", tecla);
    return () => {
      document.removeEventListener("keydown", tecla);
      previo?.focus?.();
    };
  }, [abierta, onCerrar]);

  if (!abierta) return null;

  return (
    <div className="hoja-fondo" onClick={onCerrar}>
      <div
        ref={ref}
        className="hoja"
        role="dialog"
        aria-modal="true"
        aria-label={titulo}
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="hoja-asa" aria-hidden="true" />
        <header className="hoja-cabecera">
          <h2>{titulo}</h2>
          <button type="button" className="boton-texto" onClick={onCerrar}>
            Listo
          </button>
        </header>
        <div className="hoja-cuerpo">{children}</div>
        {pie && <footer className="hoja-pie">{pie}</footer>}
      </div>
    </div>
  );
}
