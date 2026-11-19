import type { Metadata } from "next";
import Aprender from "@/components/Aprender";

export const metadata: Metadata = {
  title: "Aprender · Galileo",
  description: "Aprende guitarra nota a nota: la app te escucha y avanza cuando suena la correcta.",
};

export default function PaginaAprender() {
  return <Aprender />;
}
