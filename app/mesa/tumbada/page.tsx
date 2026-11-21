import type { Metadata } from "next";
import PaginaMesa from "@/components/PaginaMesa";

// La Mesa tumbada a mano: lo que va dentro del marco girado de la pestaña «Mesa» (PaginaMesa), para
// el móvil que no gira la pantalla. Es la misma Mesa, abierta ya en la consola.
export const metadata: Metadata = {
  title: "Mesa · Galileo",
  robots: { index: false },
};

export default function MesaTumbada() {
  return <PaginaMesa enMarco />;
}
