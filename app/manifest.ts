import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Clavija · Afinador de guitarra y bajo",
    short_name: "Clavija",
    description: "Afinador de guitarra y bajo con el micrófono del móvil.",
    lang: "es",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#1d100c",
    theme_color: "#1d100c",
    icons: [
      { src: "/icono2-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icono2-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icono2-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
