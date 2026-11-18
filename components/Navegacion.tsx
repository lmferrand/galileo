"use client";

import Link from "next/link";

/** Logo y pestañas «Afinar» / «Pistas» de la cabecera. */
export default function Navegacion({ actual }: { actual: "afinar" | "pistas"; sobreOscuro?: boolean }) {
  return (
    <div className="navegacion">
      <Link href="/" className="marca" aria-label="The Clavija, inicio">
        {/* Crema con contorno oscuro: se lee igual sobre la madera oscura y sobre la clara */}
        {/* eslint-disable-next-line @next/next/no-img-element -- logo pequeño, ya optimizado */}
        <img src="/logo-the-clavija.webp" alt="The Clavija" width={307} height={180} className="marca-logo" draggable={false} />
      </Link>
      <nav className="pestanas" aria-label="Secciones">
        <Link href="/" aria-current={actual === "afinar" ? "page" : undefined}>
          Afinar
        </Link>
        <Link href="/pistas" aria-current={actual === "pistas" ? "page" : undefined}>
          Pistas
        </Link>
      </nav>
    </div>
  );
}
