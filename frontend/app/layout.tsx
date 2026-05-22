import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
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
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <Providers>
            {children}
            <Toaster />
          </Providers>
        </ThemeProvider>
      </body>
    </html>
  );
}
