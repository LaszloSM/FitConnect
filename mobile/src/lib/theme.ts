/**
 * Sistema «Calor Kinetic» (mobile/DESIGN.md): el diseño de Stitch del dueño
 * (lienzo crema, tarjetas blancas con borde fino, coral #C4360C) con el modo
 * oscuro y el movimiento de la app. Los nombres viejos (`brandMuted`,
 * `inkMuted`…) se conservan para que ninguna pantalla quede sin color.
 */
import { Easing, useColorScheme } from "react-native";

const light = {
  bg: "#FDFBF7",
  card: "#FFFFFF",
  field: "#FFFFFF",
  muted: "#F5F2EB",
  line: "#EFECE6",
  /** Borde de campos y controles: un paso más marcado que el de las tarjetas. */
  lineStrong: "#DDD6CC",
  ink: "#1C1917",
  inkMuted: "#57534E",
  /** Terciario: iconos inactivos y metadatos cortos, nunca párrafos. */
  inkFaint: "#78716C",
  brand: "#C4360C",
  brandPress: "#9F2A09",
  /** Fondo de acento: chip activo, día elegido, fila destacada. */
  brandMuted: "#FFEDE7",
  brandContrast: "#FFFFFF",
  brandInk: "#B3300A",
  peach: "#FFE4D6",
  protein: "#B3300A",
  carbs: "#EE9A6A",
  fat: "#B45309",
  fiber: "#8A7F78",
  water: "#2F6F8F",
  ok: "#15803D",
  okBg: "#DCFCE7",
  warn: "#B45309",
  warnBg: "#FEF3C7",
  danger: "#B91C1C",
  dangerBg: "#FEE2E2",
  info: "#0369A1",
  infoBg: "#E0F2FE",
  infoLine: "#BAE6FD",
  shadow: "#292524",
  scrim: "rgba(28,25,23,0.45)",
};

const dark: typeof light = {
  bg: "#15110F",
  card: "#1E1916",
  field: "#1E1916",
  muted: "#28211D",
  line: "#2E2723",
  lineStrong: "#423833",
  ink: "#F5EFEA",
  inkMuted: "#B9AEA6",
  inkFaint: "#8F857E",
  brand: "#E66A3F",
  brandPress: "#C8552E",
  brandMuted: "#3A1F16",
  brandContrast: "#1A0F0A",
  brandInk: "#F49A72",
  peach: "#33201A",
  protein: "#F08A63",
  carbs: "#E9A47A",
  fat: "#E0A040",
  fiber: "#9A8F88",
  water: "#7FB6D3",
  ok: "#6FCF8E",
  okBg: "#16301F",
  warn: "#E9B35A",
  warnBg: "#3A2B10",
  danger: "#FB8276",
  dangerBg: "#4B1E1A",
  info: "#8CC8EE",
  infoBg: "#13293A",
  infoLine: "#1E4560",
  shadow: "#000000",
  scrim: "rgba(0,0,0,0.55)",
};

export type Palette = typeof light;

export function useColors(): Palette {
  return useColorScheme() === "dark" ? dark : light;
}

export function useIsDark(): boolean {
  return useColorScheme() === "dark";
}

export const fonts = {
  display: "BricolageGrotesque_700Bold",
  displayHeavy: "BricolageGrotesque_800ExtraBold",
  displaySemi: "BricolageGrotesque_600SemiBold",
  body: "Figtree_400Regular",
  bodyMedium: "Figtree_500Medium",
  bodySemi: "Figtree_600SemiBold",
};

/** Escala tipográfica (tamaño / alto de línea). */
export const typeScale = {
  metric: { size: 48, line: 52 },
  title: { size: 26, line: 32 },
  cardTitle: { size: 18, line: 24 },
  figure: { size: 20, line: 24 },
  body: { size: 15, line: 21 },
  small: { size: 13, line: 18 },
  label: { size: 13, line: 16 },
  tiny: { size: 11, line: 14 },
};

/** Tarjetas 18, filas internas 12, controles 10, chips en píldora. */
export const radius = { sm: 8, md: 10, row: 12, lg: 18, xl: 24, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 32 };

/** Curvas de Emil Kowalski: nada de ease-in en interfaz. */
export const motion = {
  out: Easing.bezier(0.23, 1, 0.32, 1),
  drawer: Easing.bezier(0.32, 0.72, 0, 1),
  inOut: Easing.bezier(0.77, 0, 0.175, 1),
  press: 160,
  fast: 200,
  base: 280,
  fill: 900,
};
