import { Suspense } from "react";
import type { Metadata, Viewport } from "next";
import ScreenClient from "./ScreenClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Rutinas: LSMFit",
  robots: { index: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function ScreenPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[var(--kiosk-bg)]" />}>
      <ScreenClient />
    </Suspense>
  );
}
