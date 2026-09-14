import type { Metadata, Viewport } from "next";
import ReportFaultClient from "./ReportFaultClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Reportar una máquina: FitConnect",
  robots: { index: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

type Props = { params: Promise<{ slug: string; token: string }> };

export default async function ReportFaultPage({ params }: Props) {
  const { slug, token } = await params;
  return <ReportFaultClient slug={slug} token={token} />;
}
