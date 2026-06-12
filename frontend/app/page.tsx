import type { Metadata } from "next";
import LandingClient from "@/components/landing/LandingClient";

export const metadata: Metadata = {
  title: "FitConnect — Software para gimnasios en Colombia",
  description:
    "Control de entrada con cédula, caja que cuadra sola, clases con cupos reales y cobros por WhatsApp. El software que tu gimnasio necesita para operar en serio.",
  openGraph: {
    title: "FitConnect — Opera tu gimnasio con precisión de atleta",
    description:
      "Kiosko de entrada, POS con inventario, clases con reservas y pagos Wompi. Prueba gratis 30 días.",
    type: "website",
    locale: "es_CO",
  },
};

export default function Home() {
  return <LandingClient />;
}
