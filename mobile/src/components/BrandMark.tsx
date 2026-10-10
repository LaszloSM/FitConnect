import Svg, { Circle, Path } from "react-native-svg";

/** Mismo trazado que `frontend/components/common/BrandMark.tsx` (lo genera `docs/brand/lsmfit.py`). */
const ISO_PATH =
  "M18.0 0A18.0 18.0 0 0 0 18.0 36.0L21.525 36.0L26.075 29.0L18.0 29.0A11.0 11.0 0 0 1 18.0 7.0L25.525 7.0L30.075 0ZM38.0 36.0A18.0 18.0 0 0 0 38.0 0L34.475 0L29.925 7.0L38.0 7.0A11.0 11.0 0 0 1 38.0 29.0L30.475 29.0L25.925 36.0Z";

/** Naranja exacto del logo (`--brand-logo` en la web). */
export const LOGO_ORANGE = "#D8421A";

export function BrandMark({ size = 32, color = LOGO_ORANGE }: { size?: number; color?: string }) {
  return (
    <Svg width={size} height={Math.round((size * 37.6) / 57.6)} viewBox="-0.8 -0.8 57.6 37.6" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <Path d={ISO_PATH} fill={color} stroke={color} strokeWidth={0.8} strokeLinejoin="round" />
      <Circle cx={28} cy={18} r={7.3} fill={color} />
    </Svg>
  );
}
