/**
 * Piezas base «Calor Kinetic»: lienzo crema, tarjetas blancas con borde fino y
 * sombra hiperdifusa, un solo botón coral por pantalla, cifras en Bricolage
 * tabular y estado siempre con icono y texto.
 */
import { type Icon } from "phosphor-react-native";
import { forwardRef, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AccessibilityInfo,
  ActivityIndicator,
  Animated,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type PressableProps,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { fonts, motion, radius, space, typeScale, useColors, useIsDark, type Palette } from "@/lib/theme";

const NATIVE = Platform.OS !== "web";

/** Movimiento reducido del sistema, para apagar llenados y contadores. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((v) => alive && setReduced(v));
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduced;
}

/**
 * Pressable que se hunde a 0,97 con la curva ease-out (160 ms): el dedo siente
 * que la interfaz lo escuchó. Base de botones, tarjetas y filas tocables.
 */
export function Press({
  children,
  style,
  scaleTo = 0.97,
  ...props
}: Omit<PressableProps, "style"> & { style?: StyleProp<ViewStyle>; scaleTo?: number; children: ReactNode }) {
  const s = useRef(new Animated.Value(1)).current;
  const to = (v: number) =>
    Animated.timing(s, { toValue: v, duration: motion.press, easing: motion.out, useNativeDriver: NATIVE }).start();
  return (
    <AnimatedPressable
      {...props}
      onPressIn={(e) => {
        if (!props.disabled) to(scaleTo);
        props.onPressIn?.(e);
      }}
      onPressOut={(e) => {
        to(1);
        props.onPressOut?.(e);
      }}
      style={[style, { transform: [{ scale: s }] }]}>
      {children}
    </AnimatedPressable>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

/** Entrada al montar: opacidad y 8 px hacia arriba, escalonable con `delay`. */
export function Rise({ children, delay = 0, style }: { children: ReactNode; delay?: number; style?: StyleProp<ViewStyle> }) {
  const reduced = useReducedMotion();
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: motion.base, delay: reduced ? 0 : delay, easing: motion.out, useNativeDriver: NATIVE }).start();
  }, [t, delay, reduced]);
  return (
    <Animated.View
      style={[style, { opacity: t, transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [reduced ? 0 : 8, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}

export function Screen({
  children,
  refreshing,
  onRefresh,
  scroll = true,
  edges = ["top"],
  footer,
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  scroll?: boolean;
  edges?: ("top" | "bottom")[];
  /** Barra fija abajo (acción principal de la pantalla). */
  footer?: ReactNode;
}) {
  const c = useColors();
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.screenContent, footer ? { paddingBottom: 120 } : null]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={Boolean(refreshing)} onRefresh={onRefresh} tintColor={c.brand} /> : undefined}>
      {children}
    </ScrollView>
  ) : (
    <View style={[styles.screenContent, { flex: 1 }]}>{children}</View>
  );
  return (
    <SafeAreaView edges={edges} style={{ flex: 1, backgroundColor: c.bg }}>
      {body}
      {footer ? <Footer>{footer}</Footer> : null}
    </SafeAreaView>
  );
}

/** Acción fija al pie, sobre tarjeta con borde superior. */
export function Footer({ children }: { children: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, backgroundColor: c.card, borderTopWidth: 1, borderTopColor: c.line, paddingHorizontal: space.xl, paddingTop: space.md, paddingBottom: space.md }}>
      <View style={{ maxWidth: 600, width: "100%", alignSelf: "center", flexDirection: "row", gap: space.sm }}>{children}</View>
    </View>
  );
}

export function Title({ children, sub, right }: { children: ReactNode; sub?: ReactNode; right?: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ marginBottom: space.lg, flexDirection: "row", alignItems: "flex-start", gap: space.md }}>
      <View style={{ flex: 1, gap: 4 }}>
        <Text
          accessibilityRole="header"
          style={{ fontFamily: fonts.display, fontSize: typeScale.title.size, lineHeight: typeScale.title.line, letterSpacing: -0.5, color: c.ink }}>
          {children}
        </Text>
        {sub ? <Txt muted size={14}>{sub}</Txt> : null}
      </View>
      {right}
    </View>
  );
}

export function Section({ children, action }: { children: ReactNode; action?: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.xl, marginBottom: space.md }}>
      <Text
        accessibilityRole="header"
        style={{ fontFamily: fonts.display, fontSize: typeScale.cardTitle.size, lineHeight: typeScale.cardTitle.line, letterSpacing: -0.2, color: c.ink }}>
        {children}
      </Text>
      {action}
    </View>
  );
}

/** Enlace de texto coral (acciones secundarias de una sección o tarjeta). */
export function TextLink({ label, onPress, icon: IconCmp }: { label: string; onPress: () => void; icon?: Icon }) {
  const c = useColors();
  return (
    <Press accessibilityRole="button" onPress={onPress} hitSlop={8} style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: 32 }}>
      {IconCmp ? <IconCmp size={16} color={c.brandInk} weight="bold" /> : null}
      <Text style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: c.brandInk }}>{label}</Text>
    </Press>
  );
}

export function Txt({
  children,
  muted,
  faint,
  size = 15,
  weight = "regular",
  style,
  numberOfLines,
}: {
  children: ReactNode;
  muted?: boolean;
  faint?: boolean;
  size?: number;
  weight?: "regular" | "medium" | "semi";
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const c = useColors();
  const family = weight === "semi" ? fonts.bodySemi : weight === "medium" ? fonts.bodyMedium : fonts.body;
  return (
    <Text
      numberOfLines={numberOfLines}
      style={[{ fontFamily: family, fontSize: size, lineHeight: Math.round(size * 1.4), color: faint ? c.inkFaint : muted ? c.inkMuted : c.ink }, style]}>
      {children}
    </Text>
  );
}

/** Cifras: Bricolage con números tabulares. */
export function Num({ children, size = 28, style, heavy }: { children: ReactNode; size?: number; style?: StyleProp<TextStyle>; heavy?: boolean }) {
  const c = useColors();
  return (
    <Text
      style={[
        {
          fontFamily: heavy ? fonts.displayHeavy : fonts.display,
          fontSize: size,
          lineHeight: Math.round(size * 1.08),
          letterSpacing: size >= 26 ? -size * 0.02 : 0,
          color: c.ink,
          fontVariant: ["tabular-nums"],
        },
        style,
      ]}>
      {children}
    </Text>
  );
}

/**
 * Cifra que sube hasta su valor al montar y al cambiar (700 ms, ease-out).
 * Con movimiento reducido aparece directamente.
 */
export function Ticker({ value, size = 48, style, format = fmtInt, heavy = true }: { value: number; size?: number; style?: StyleProp<TextStyle>; format?: (n: number) => string; heavy?: boolean }) {
  const reduced = useReducedMotion();
  const [shown, setShown] = useState(reduced ? value : 0);
  const from = useRef(0);
  useEffect(() => {
    if (reduced) {
      setShown(value);
      from.current = value;
      return;
    }
    const start = from.current;
    const t0 = Date.now();
    let raf = 0;
    const step = () => {
      const p = Math.min(1, (Date.now() - t0) / 700);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(start + (value - start) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
      else from.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, reduced]);
  return (
    <Num size={size} heavy={heavy} style={style}>
      {format(shown)}
    </Num>
  );
}

export const fmtInt = (n: number) => Math.round(n).toLocaleString("es-CO");

export function Card({
  children,
  style,
  onPress,
  accessibilityLabel,
  tone = "card",
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  onPress?: () => void;
  accessibilityLabel?: string;
  /** `peach`: tarjeta de acento (promoción, resumen); sin borde. */
  tone?: "card" | "peach" | "muted";
}) {
  const c = useColors();
  const dark = useIsDark();
  const bg = tone === "peach" ? c.peach : tone === "muted" ? c.muted : c.card;
  const base: StyleProp<ViewStyle> = [
    styles.card,
    { backgroundColor: bg, borderColor: tone === "card" ? c.line : "transparent" },
    tone === "card" && !dark ? cardShadow(c) : null,
    style,
  ];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Press accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} scaleTo={0.985} style={base}>
      {children}
    </Press>
  );
}

export function Button({
  label,
  onPress,
  variant = "primary",
  loading,
  disabled,
  icon: IconCmp,
  style,
  size = "md",
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  loading?: boolean;
  disabled?: boolean;
  icon?: Icon;
  style?: StyleProp<ViewStyle>;
  size?: "md" | "lg";
}) {
  const c = useColors();
  const bg = variant === "primary" ? c.brand : variant === "secondary" ? c.muted : "transparent";
  const fg = variant === "primary" ? c.brandContrast : variant === "danger" ? c.danger : variant === "ghost" ? c.brandInk : c.ink;
  const border = variant === "secondary" ? c.line : variant === "danger" ? c.danger : "transparent";
  const off = disabled || loading;
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: Boolean(off), busy: Boolean(loading) }}
      disabled={off}
      onPress={onPress}
      style={[
        styles.button,
        size === "lg" && { minHeight: 52 },
        { backgroundColor: bg, borderColor: border, borderWidth: variant === "secondary" || variant === "danger" ? 1 : 0 },
        off && { opacity: 0.5 },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {IconCmp ? <IconCmp size={19} color={fg} weight="bold" /> : null}
          <Text numberOfLines={1} style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: fg }}>{label}</Text>
        </View>
      )}
    </Press>
  );
}

/** Botón circular solo icono (el «+» de las tarjetas). */
export function IconButton({ icon: IconCmp, label, onPress, tone = "wash", size = 44 }: { icon: Icon; label: string; onPress: () => void; tone?: "wash" | "muted" | "plain"; size?: number }) {
  const c = useColors();
  const bg = tone === "wash" ? c.brandMuted : tone === "muted" ? c.muted : "transparent";
  const fg = tone === "wash" ? c.brandInk : c.ink;
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      hitSlop={6}
      scaleTo={0.92}
      style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <IconCmp size={Math.round(size * 0.48)} color={fg} weight="bold" />
    </Press>
  );
}

/** Cuadrito tintado con icono de línea (categoría de alimento, ítem de lista). */
export function IconTile({ icon: IconCmp, size = 40, tone = "muted" }: { icon: Icon; size?: number; tone?: "muted" | "wash" | "info" | "ok" }) {
  const c = useColors();
  const [bg, fg] =
    tone === "wash" ? [c.brandMuted, c.brandInk] : tone === "info" ? [c.infoBg, c.info] : tone === "ok" ? [c.okBg, c.ok] : [c.muted, c.inkMuted];
  return (
    <View style={{ width: size, height: size, borderRadius: radius.md, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <IconCmp size={Math.round(size * 0.5)} color={fg} />
    </View>
  );
}

export type Tone = "ok" | "warn" | "danger" | "info" | "neutral" | "brand";

export function Chip({ tone, label, icon: IconCmp, style }: { tone: Tone; label: string; icon?: Icon; style?: StyleProp<ViewStyle> }) {
  const c = useColors();
  const [fg, bg] = toneColors(c, tone);
  return (
    <View
      style={[
        { flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: bg, borderRadius: radius.pill, paddingHorizontal: 10, minHeight: 26, alignSelf: "flex-start" },
        style,
      ]}>
      {IconCmp ? <IconCmp size={13} color={fg} weight="bold" /> : null}
      <Text style={{ fontFamily: fonts.bodySemi, fontSize: 12.5, color: fg }}>{label}</Text>
    </View>
  );
}

export function toneColors(c: Palette, tone: Tone): [string, string] {
  switch (tone) {
    case "ok":
      return [c.ok, c.okBg];
    case "warn":
      return [c.warn, c.warnBg];
    case "danger":
      return [c.danger, c.dangerBg];
    case "info":
      return [c.info, c.infoBg];
    case "brand":
      return [c.brandInk, c.brandMuted];
    default:
      return [c.inkMuted, c.muted];
  }
}

export function Notice({ tone, children, icon: IconCmp }: { tone: Tone; children: ReactNode; icon?: Icon }) {
  const c = useColors();
  const [fg, bg] = toneColors(c, tone);
  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: "row",
        gap: 10,
        backgroundColor: bg,
        borderRadius: radius.row,
        borderWidth: tone === "info" ? 1 : 0,
        borderColor: c.infoLine,
        paddingHorizontal: space.md,
        paddingVertical: 10,
        marginBottom: space.md,
        alignItems: "flex-start",
      }}>
      {IconCmp ? <IconCmp size={18} color={fg} weight="bold" style={{ marginTop: 1 }} /> : null}
      <Text style={{ flex: 1, fontFamily: fonts.bodyMedium, fontSize: 13.5, lineHeight: 19, color: fg }}>{children}</Text>
    </View>
  );
}

export const Field = forwardRef<TextInput, TextInputProps & { label: string; hint?: string; error?: string | null }>(
  function Field({ label, hint, error, style, onFocus, onBlur, ...props }, ref) {
    const c = useColors();
    const [focus, setFocus] = useState(false);
    return (
      <View style={{ marginBottom: space.md, gap: 6 }}>
        <Text style={{ fontFamily: fonts.bodySemi, fontSize: 13.5, color: c.ink }}>{label}</Text>
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          placeholderTextColor={c.inkFaint}
          onFocus={(e) => {
            setFocus(true);
            onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocus(false);
            onBlur?.(e);
          }}
          style={[
            {
              minHeight: 46,
              borderWidth: focus ? 1.5 : 1,
              borderColor: error ? c.danger : focus ? c.brand : c.lineStrong,
              borderRadius: radius.md,
              backgroundColor: c.field,
              paddingHorizontal: 14,
              fontFamily: fonts.body,
              fontSize: 16,
              color: c.ink,
            },
            style,
          ]}
          {...props}
        />
        {error ? <Txt size={13} style={{ color: c.danger }}>{error}</Txt> : hint ? <Txt size={13} muted>{hint}</Txt> : null}
      </View>
    );
  },
);

export function Row({ label, value, last }: { label: string; value: ReactNode; last?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line }}>
      <Txt muted size={14}>{label}</Txt>
      <Txt size={14} weight="medium" style={{ flexShrink: 1, textAlign: "right" }}>{value}</Txt>
    </View>
  );
}

/** Fila de lista navegable: icono en cuadrito, título, detalle y chevron. */
export function ListRow({
  icon,
  title,
  detail,
  right,
  onPress,
  last,
  accessibilityLabel,
}: {
  icon?: Icon;
  title: string;
  detail?: string;
  right?: ReactNode;
  onPress?: () => void;
  last?: boolean;
  accessibilityLabel?: string;
}) {
  const c = useColors();
  const inner = (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 64, paddingVertical: 10, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line }}>
      {icon ? <IconTile icon={icon} tone="wash" /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <Txt size={15.5} weight="semi" numberOfLines={2}>{title}</Txt>
        {detail ? <Txt size={13} muted numberOfLines={2}>{detail}</Txt> : null}
      </View>
      {right}
    </View>
  );
  if (!onPress) return inner;
  return (
    <Press accessibilityRole="button" accessibilityLabel={accessibilityLabel ?? title} onPress={onPress} scaleTo={0.985}>
      {inner}
    </Press>
  );
}

export function Empty({ title, children, action, icon }: { title: string; children?: ReactNode; action?: ReactNode; icon?: Icon }) {
  return (
    <Card style={{ alignItems: "flex-start", gap: space.sm }}>
      {icon ? <IconTile icon={icon} tone="wash" /> : null}
      <Txt weight="semi" size={16}>{title}</Txt>
      {children ? <Txt muted size={14}>{children}</Txt> : null}
      {action}
    </Card>
  );
}

export function Loading() {
  const c = useColors();
  return (
    <View style={{ paddingVertical: space.xxl, alignItems: "center" }} accessibilityLabel="Cargando">
      <ActivityIndicator color={c.brand} />
    </View>
  );
}

/** Sombra ambiental hiperdifusa (solo en claro; en oscuro separa el borde). */
export function cardShadow(c: Palette): ViewStyle {
  return { shadowColor: c.shadow, shadowOpacity: 0.05, shadowRadius: 14, shadowOffset: { width: 0, height: 6 }, elevation: 2 };
}

/** Compatibilidad: algunas pantallas aplican la sombra a mano. */
export const shadow = cardShadow;

const styles = StyleSheet.create({
  screenContent: { paddingHorizontal: space.xl, paddingTop: space.lg, paddingBottom: 120, maxWidth: 640, width: "100%", alignSelf: "center" },
  card: { borderRadius: radius.lg, padding: space.lg, borderWidth: 1 },
  button: { minHeight: 46, borderRadius: radius.md, alignItems: "center", justifyContent: "center", paddingHorizontal: space.lg },
});
