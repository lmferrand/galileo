"use client";

import Link from "next/link";

/** Logo y pestañas «Afinar» / «Pistas» / «Aprender» / «Mesa» de la cabecera. */
export default function Navegacion({ actual }: { actual: "afinar" | "pistas" | "aprender" | "mesa"; sobreOscuro?: boolean }) {
  return (
    <div className="navegacion">
      <Link href="/" className="marca" aria-label="Galileo, inicio">
        {/* El logo del disco con alas (20-nov-2026): letras crema con borde dorado, se lee sobre la madera */}
        {/* eslint-disable-next-line @next/next/no-img-element -- logo pequeño, ya optimizado */}
        <img src="/logo-galileo-disco.webp" alt="Galileo" width={380} height={128} className="marca-logo" draggable={false} />
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
        <Link href="/mesa" aria-current={actual === "mesa" ? "page" : undefined}>
          Mesa
        </Link>
      </nav>
    </div>
  );
}
