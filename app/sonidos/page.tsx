import type { Metadata } from "next";
import ProbarSonidos from "@/components/ProbarSonidos";

// Página suelta (sin enlace en la app) para escuchar los sonidos de cada instrumento y elegir.
export const metadata: Metadata = {
  title: "Sonidos · The Clavija",
  robots: { index: false, follow: false },
};

export default function PaginaSonidos() {
  return <ProbarSonidos />;
}
