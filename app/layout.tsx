import type { Metadata, Viewport } from "next";
import { Bodoni_Moda, Manrope } from "next/font/google";
import RegistroOffline from "@/components/RegistroOffline";
import HuecoIphone from "@/components/HuecoIphone";
import "./globals.css";
import "./pistas.css";

const bodoni = Bodoni_Moda({
  subsets: ["latin", "symbols"],
  style: ["normal", "italic"],
  axes: ["opsz"],
  variable: "--font-bodoni",
  display: "swap",
});

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: "The Clavija · Afinador de guitarra y bajo",
  description: "Afina tu guitarra o tu bajo con el micrófono del móvil, en estándar, drop, abiertas o en tu propia afinación.",
  applicationName: "The Clavija",
  appleWebApp: {
    capable: true,
    title: "The Clavija",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  // Oscuro siempre: el iPhone pinta con este color la franja de abajo en modo app, y así se
  // funde con la barra de abajo y con el estudio.
  themeColor: "#120a06",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${bodoni.variable} ${manrope.variable}`}>
      <body>
        {children}
        <RegistroOffline />
        <HuecoIphone />
      </body>
    </html>
  );
}
