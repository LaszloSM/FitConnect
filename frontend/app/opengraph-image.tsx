import { ImageResponse } from "next/og";
import { ISO_PATH } from "@/components/common/BrandMark";

export const alt = "LSMFit, software para gimnasios en Colombia";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Copias de los tokens de globals.css (--bg-base, --brand, --brand-ink, --text-base): la imagen se
// genera fuera del navegador y no ve las variables CSS.
const BG = "#FAF5F0";
const BRAND = "#C4360C";
const BRAND_INK = "#AF2F09";
const INK = "#251A15";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 80, background: BG, color: INK }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          <svg viewBox="-0.8 -0.8 57.6 37.6" width={110} height={72}>
            <path d={ISO_PATH} fill={BRAND} stroke={BRAND} strokeWidth={0.8} strokeLinejoin="round" />
            <circle cx="28.0" cy="18.0" r="7.3" fill={BRAND} />
          </svg>
          <span style={{ fontSize: 56, fontWeight: 700, letterSpacing: -1.5 }}>LSMFit</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
          <span style={{ fontSize: 68, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>
            Controla quién entra, cobra con recibo y cuadra la caja cada noche.
          </span>
          <span style={{ fontSize: 32, color: BRAND_INK, fontWeight: 600 }}>Software para gimnasios en Colombia · 30 días gratis</span>
        </div>
      </div>
    ),
    size,
  );
}
