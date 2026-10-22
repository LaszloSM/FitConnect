import type { Metadata } from "next";
import LandingClient from "@/components/landing/LandingClient";

export const metadata: Metadata = {
  title: "LSMFit: Software para gimnasios en Colombia",
  description:
    "Control de entrada con cédula, cobros con recibo en COP, caja que cuadra a ciegas y modelos que avisan qué socios estás por perder. Prueba 30 días sin tarjeta.",
  alternates: { canonical: "/" },
  openGraph: {
    title: "LSMFit: Software para gimnasios en Colombia",
    description:
      "Kiosko de entrada, POS con inventario, clases con reservas y pagos Wompi. Prueba gratis 30 días.",
    type: "website",
    locale: "es_CO",
    siteName: "LSMFit",
    url: "/",
  },
  twitter: {
    card: "summary_large_image",
    title: "LSMFit: Software para gimnasios en Colombia",
    description: "Entrada con cédula, cobros con recibo, caja que cuadra y clases con reservas. Prueba gratis 30 días.",
  },
};

export default function Home() {
  return <LandingClient />;
}
