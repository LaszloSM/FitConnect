/**
 * Sistema "Calor" (DESIGN.md) para la app. Los hex son conversiones exactas de
 * los tokens oklch de frontend/app/globals.css: si la marca cambia allá, se
 * regeneran aquí.
 */
import { useColorScheme } from "react-native";

const light = {
  bg: "#FAF5F0",
  card: "#FFFDFC",
  field: "#FFFEFD",
  muted: "#F0E8E2",
  line: "#D5CCC5",
  ink: "#251A15",
  inkMuted: "#6A5D56",
  brand: "#C4360C",
  brandMuted: "#FFE4D6",
  brandContrast: "#FDF9F6",
  brandInk: "#AF2F09",
  ok: "#206B38",
  okBg: "#D9F3DD",
  warn: "#8D5406",
  warnBg: "#FEEDC9",
  danger: "#BE2323",
  dangerBg: "#FFE2DD",
  info: "#20688C",
  infoBg: "#D9EFFD",
  shadow: "#5A2A12",
};

const dark: typeof light = {
  bg: "#140E0B",
  card: "#1F1814",
  field: "#241C18",
  muted: "#2C2520",
  line: "#413934",
  ink: "#F4EFEA",
  inkMuted: "#B2A9A2",
  brand: "#DF5F35",
  brandMuted: "#472216",
  brandContrast: "#190F0B",
  brandInk: "#F6946D",
  ok: "#76C788",
  okBg: "#17321E",
  warn: "#E6B55D",
  warnBg: "#3B2B0D",
  danger: "#FB8276",
  dangerBg: "#4B1E1A",
  info: "#84C0E4",
  infoBg: "#162E3C",
  shadow: "#000000",
};

export type Palette = typeof light;

export function useColors(): Palette {
  return useColorScheme() === "dark" ? dark : light;
}

export const fonts = {
  display: "BricolageGrotesque_700Bold",
  displaySemi: "BricolageGrotesque_600SemiBold",
  body: "Figtree_400Regular",
  bodyMedium: "Figtree_500Medium",
  bodySemi: "Figtree_600SemiBold",
};

export const radius = { sm: 8, md: 11, lg: 18, xl: 20 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
