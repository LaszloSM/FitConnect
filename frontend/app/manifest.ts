import type { MetadataRoute } from "next";

/**
 * FitConnect instalable en el PC de recepción: ícono en el escritorio que abre
 * el Mostrador directo, también sin internet (ver public/sw.js).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "FitConnect",
    short_name: "FitConnect",
    description: "Recepción, caja y socios de tu gimnasio",
    start_url: "/checkins",
    scope: "/",
    display: "standalone",
    background_color: "#FAF5F0", // --bg-base (oklch 0.972 0.009 65)
    theme_color: "#C4360C", // --brand
    lang: "es-CO",
    icons: [
      { src: "/app-icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/fitconnect-icon.svg", sizes: "any", type: "image/svg+xml" },
    ],
  };
}
