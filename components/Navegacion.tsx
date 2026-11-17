"use client";

import Link from "next/link";

/** Logo y pestañas «Afinar» / «Pistas» de la cabecera. */
export default function Navegacion({ actual }: { actual: "afinar" | "pistas" }) {
  return (
    <div className="navegacion">
      <Link href="/" className="marca" aria-label="Clavija, inicio">
        <svg viewBox="0 0 32 32" className="marca-icono" aria-hidden="true">
          <circle cx="16" cy="16" r="13" className="marca-aro" />
          <circle cx="16" cy="16" r="7.5" className="marca-boca" />
          <path d="M16 3.6 L18.2 7 L13.8 7 Z" className="marca-muesca" />
        </svg>
        <span className="marca-texto">Clavija</span>
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
