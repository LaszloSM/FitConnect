import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import Providers from "@/components/Providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "SaaS Gym — Plataforma de gestión para gimnasios",
  description: "Gestiona tu gimnasio con SaaS Gym: miembros, pagos, clases y más.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="antialiased">
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
