import type { Metadata } from "next";
import Pistas from "@/components/Pistas";

export const metadata: Metadata = {
  title: "Pistas · Galileo",
  description: "Separa una canción en voz, guitarra, bajo, batería, piano y el resto, en tu propio aparato.",
};

export default function PaginaPistas() {
  return <Pistas />;
}
