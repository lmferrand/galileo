import type { Metadata } from "next";
import PaginaMesa from "@/components/PaginaMesa";

export const metadata: Metadata = {
  title: "Mesa · Galileo",
  description: "La sala de control del estudio: la grabadora de bobinas y la mesa de mezclas con tus pistas.",
};

export default function Mesa() {
  return <PaginaMesa />;
}
