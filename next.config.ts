import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
