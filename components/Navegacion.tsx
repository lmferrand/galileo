"use client";

import Link from "next/link";

/** Logo y pestañas «Afinar» / «Pistas» / «Aprender» de la cabecera. */
export default function Navegacion({ actual }: { actual: "afinar" | "pistas" | "aprender"; sobreOscuro?: boolean }) {
  return (
    <div className="navegacion">
      <Link href="/" className="marca" aria-label="Galileo, inicio">
        {/* Crema con contorno oscuro: se lee igual sobre la madera oscura y sobre la clara */}
        {/* eslint-disable-next-line @next/next/no-img-element -- logo pequeño, ya optimizado */}
        <img src="/logo-galileo.webp" alt="Galileo" width={328} height={120} className="marca-logo" draggable={false} />
      </Link>
      <nav className="pestanas" aria-label="Secciones">
        <Link href="/" aria-current={actual === "afinar" ? "page" : undefined}>
          Afinar
        </Link>
        <Link href="/pistas" aria-current={actual === "pistas" ? "page" : undefined}>
          Pistas
        </Link>
        <Link href="/aprender" aria-current={actual === "aprender" ? "page" : undefined}>
          Aprender
        </Link>
      </nav>
    </div>
  );
}
