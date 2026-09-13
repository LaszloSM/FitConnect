import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import KioskClient from "./KioskClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Kiosko de entrada — FitConnect",
  robots: { index: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function KioskPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#0f0d0b]" />}>
      <KioskClient />
    </Suspense>
  );
}
