import type { Metadata, Viewport } from "next";
import { Bodoni_Moda, Manrope } from "next/font/google";
import RegistroOffline from "@/components/RegistroOffline";
import HuecoIphone from "@/components/HuecoIphone";
import "./globals.css";
import "./pistas.css";
import "./aprender.css";
import "./mesa.css";
import "./equipo.css";

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
  title: "Galileo · Afinador de guitarra y bajo",
  description: "Afina tu guitarra o tu bajo con el micrófono del móvil, en estándar, drop, abiertas o en tu propia afinación.",
  applicationName: "Galileo",
  appleWebApp: {
    capable: true,
    title: "Galileo",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // Sin el zoom del navegador (pellizcar con dos dedos, dos toques) en toda la app: descolocaba la
  // pantalla, y lo que hay que ver de cerca se acerca solo al tocarlo. El iPhone no hace caso de
  // esto: para él va también «touch-action» en <html> (globals.css).
  maximumScale: 1,
  userScalable: false,
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
