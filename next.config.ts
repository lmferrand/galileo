import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Las pestañas (Afinar, Pistas, Aprender) no se desmontan al cambiar de una a otra: se quedan
  // ocultas (Activity de React) y volver a una es inmediato, sin montarla otra vez (eso daba tirones).
  // Al ocultarse se apagan sus efectos (micro, sonido…); lo que debe empezar de cero al volver lo
  // deja así cada pantalla al ocultarse (busca «al ocultarse» en Afinador, Pistas y Aprender).
  cacheComponents: true,
  // Aislamiento entre orígenes: sin él el navegador no deja usar varios
  // núcleos del procesador (SharedArrayBuffer) para separar las pistas.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
          { key: "Cross-Origin-Embedder-Policy", value: "require-corp" },
        ],
      },
    ];
  },
};

export default nextConfig;
