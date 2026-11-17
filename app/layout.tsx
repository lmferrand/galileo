import type { Metadata, Viewport } from "next";
import { Bodoni_Moda, Manrope } from "next/font/google";
import RegistroOffline from "@/components/RegistroOffline";
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
  title: "Clavija · Afinador de guitarra",
  description: "Afina tu guitarra con el micrófono del móvil, en estándar, drop, abiertas o en tu propia afinación.",
  applicationName: "Clavija",
  appleWebApp: {
    capable: true,
    title: "Clavija",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: dark)", color: "#1d100c" },
    { media: "(prefers-color-scheme: light)", color: "#ecdcb9" },
  ],
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={`${bodoni.variable} ${manrope.variable}`}>
      <body>
        {children}
        <RegistroOffline />
      </body>
    </html>
  );
}
