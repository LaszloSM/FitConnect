import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Crea la cuenta de tu gimnasio · LSMFit",
  description: "Registra tu gimnasio en LSMFit y pruébalo 30 días gratis, sin tarjeta de crédito.",
  alternates: { canonical: "/register" },
};

export default function RegisterLayout({ children }: { children: React.ReactNode }) {
  return children;
}
