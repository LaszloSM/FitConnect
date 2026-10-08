import type { Metadata, Viewport } from "next";
import CompleteProfileClient from "./CompleteProfileClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Completa tus datos: FitConnect",
  robots: { index: false },
  referrer: "no-referrer",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

type Props = { params: Promise<{ slug: string; token: string }> };

export default async function CompleteProfilePage({ params }: Props) {
  const { slug, token } = await params;
  return <CompleteProfileClient slug={slug} token={token} />;
}
