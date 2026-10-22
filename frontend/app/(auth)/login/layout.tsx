import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Ingresar · LSMFit",
  description: "Entra al panel de tu gimnasio en LSMFit.",
  alternates: { canonical: "/login" },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
