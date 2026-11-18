"use client";

import Link from "next/link";

/** Logo y pestañas «Afinar» / «Pistas» de la cabecera. `sobreOscuro`: logo crema siempre (el estudio de Pistas). */
export default function Navegacion({ actual, sobreOscuro }: { actual: "afinar" | "pistas"; sobreOscuro?: boolean }) {
  return (
    <div className="navegacion">
      <Link href="/" className="marca" aria-label="Clavija, inicio">
        {/* Crema sobre la madera oscura, marrón sobre la clara */}
        <picture>
          {!sobreOscuro && <source srcSet="/logo-clavija-oscuro.webp" media="(prefers-color-scheme: light)" />}
          <img src="/logo-clavija.webp" alt="Clavija" width={390} height={130} className="marca-logo" draggable={false} />
        </picture>
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
