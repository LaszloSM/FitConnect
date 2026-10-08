/**
 * Piezas base con el sistema "Calor": tarjetas separadas por sombra (no borde),
 * un solo botón coral por pantalla, cifras en Bricolage, estado con icono y texto.
 */
import { type Icon } from "phosphor-react-native";
import { forwardRef, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { fonts, radius, space, useColors, type Palette } from "@/lib/theme";

export function Screen({
  children,
  refreshing,
  onRefresh,
  scroll = true,
  edges = ["top"],
}: {
  children: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  scroll?: boolean;
  edges?: ("top" | "bottom")[];
}) {
  const c = useColors();
  const body = scroll ? (
    <ScrollView
      contentContainerStyle={styles.screenContent}
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
    </SafeAreaView>
  );
}

export function Title({ children, sub }: { children: ReactNode; sub?: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ marginBottom: space.lg, gap: 4 }}>
      <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 32, lineHeight: 36, color: c.ink }}>
        {children}
      </Text>
      {sub ? <Txt muted>{sub}</Txt> : null}
    </View>
  );
}

export function Section({ children, action }: { children: ReactNode; action?: ReactNode }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: space.xl, marginBottom: space.sm }}>
      <Text accessibilityRole="header" style={{ fontFamily: fonts.bodySemi, fontSize: 16, color: c.ink }}>
        {children}
      </Text>
      {action}
    </View>
  );
}

export function Txt({
  children,
  muted,
  size = 15,
  weight = "regular",
  style,
  numberOfLines,
}: {
  children: ReactNode;
  muted?: boolean;
  size?: number;
  weight?: "regular" | "medium" | "semi";
  style?: TextStyle;
  numberOfLines?: number;
}) {
  const c = useColors();
  const family = weight === "semi" ? fonts.bodySemi : weight === "medium" ? fonts.bodyMedium : fonts.body;
  return (
    <Text numberOfLines={numberOfLines} style={[{ fontFamily: family, fontSize: size, lineHeight: size * 1.4, color: muted ? c.inkMuted : c.ink }, style]}>
      {children}
    </Text>
  );
}

/** Cifras: Bricolage con números tabulares. */
export function Num({ children, size = 28, style }: { children: ReactNode; size?: number; style?: TextStyle }) {
  const c = useColors();
  return (
    <Text style={[{ fontFamily: fonts.display, fontSize: size, lineHeight: size * 1.1, color: c.ink, fontVariant: ["tabular-nums"] }, style]}>
      {children}
    </Text>
  );
}

export function Card({ children, style, onPress, accessibilityLabel }: { children: ReactNode; style?: ViewStyle; onPress?: () => void; accessibilityLabel?: string }) {
  const c = useColors();
  const base = [styles.card, shadow(c), { backgroundColor: c.card }, style];
  if (!onPress) return <View style={base}>{children}</View>;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [...base, pressed && { transform: [{ scale: 0.99 }], opacity: 0.92 }]}>
      {children}
    </Pressable>
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
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  loading?: boolean;
  disabled?: boolean;
  icon?: Icon;
  style?: ViewStyle;
}) {
  const c = useColors();
  const bg = variant === "primary" ? c.brand : variant === "secondary" ? c.card : "transparent";
  const fg = variant === "primary" ? c.brandContrast : variant === "danger" ? c.danger : variant === "ghost" ? c.brandInk : c.ink;
  const border = variant === "secondary" ? c.line : variant === "danger" ? c.danger : "transparent";
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(off), busy: Boolean(loading) }}
      disabled={off}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { backgroundColor: bg, borderColor: border, borderWidth: variant === "secondary" || variant === "danger" ? 1 : 0 },
        variant === "primary" && shadowPrimary(c),
        off && { opacity: 0.5 },
        pressed && !off && { transform: [{ scale: 0.97 }] },
        style,
      ]}>
      {loading ? (
        <ActivityIndicator color={fg} />
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {IconCmp ? <IconCmp size={20} color={fg} weight="bold" /> : null}
          <Text style={{ fontFamily: fonts.bodySemi, fontSize: 16, color: fg }}>{label}</Text>
        </View>
      )}
    </Pressable>
  );
}

export type Tone = "ok" | "warn" | "danger" | "info" | "neutral";

export function Chip({ tone, label, icon: IconCmp, style }: { tone: Tone; label: string; icon?: Icon; style?: ViewStyle }) {
  const c = useColors();
  const [fg, bg] = toneColors(c, tone);
  return (
    <View style={[{ flexDirection: "row", alignItems: "center", gap: 5, backgroundColor: bg, borderRadius: radius.sm, paddingHorizontal: 9, paddingVertical: 4, alignSelf: "flex-start" }, style]}>
      {IconCmp ? <IconCmp size={14} color={fg} weight="bold" /> : null}
      <Text style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: fg }}>{label}</Text>
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
    default:
      return [c.inkMuted, c.muted];
  }
}

export function Notice({ tone, children, icon: IconCmp }: { tone: Tone; children: ReactNode; icon?: Icon }) {
  const c = useColors();
  const [fg, bg] = toneColors(c, tone);
  return (
    <View accessibilityRole="alert" style={{ flexDirection: "row", gap: 10, backgroundColor: bg, borderRadius: radius.md, padding: space.md, marginBottom: space.md, alignItems: "flex-start" }}>
      {IconCmp ? <IconCmp size={20} color={fg} weight="bold" /> : null}
      <Text style={{ flex: 1, fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20, color: fg }}>{children}</Text>
    </View>
  );
}

export const Field = forwardRef<TextInput, TextInputProps & { label: string; hint?: string; error?: string | null }>(
  function Field({ label, hint, error, style, ...props }, ref) {
    const c = useColors();
    return (
      <View style={{ marginBottom: space.md, gap: 6 }}>
        <Text style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: c.ink }}>{label}</Text>
        <TextInput
          ref={ref}
          placeholderTextColor={c.inkMuted}
          style={[
            {
              minHeight: 48,
              borderWidth: 1,
              borderColor: error ? c.danger : c.line,
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
    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md, paddingVertical: 12, borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth, borderBottomColor: c.line }}>
      <Txt muted size={14}>{label}</Txt>
      <Txt size={14} weight="medium" style={{ flexShrink: 1, textAlign: "right" }}>{value}</Txt>
    </View>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <Card style={{ alignItems: "flex-start", gap: space.sm }}>
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

export function shadow(c: Palette): ViewStyle {
  return {
    shadowColor: c.shadow,
    shadowOpacity: 0.08,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 2,
  };
}

function shadowPrimary(c: Palette): ViewStyle {
  return { shadowColor: c.brand, shadowOpacity: 0.35, shadowRadius: 12, shadowOffset: { width: 0, height: 6 }, elevation: 3 };
}

const styles = StyleSheet.create({
  screenContent: { padding: space.lg, paddingBottom: 120, maxWidth: 640, width: "100%", alignSelf: "center" },
  card: { borderRadius: radius.lg, padding: space.lg },
  button: { minHeight: 50, borderRadius: radius.md, alignItems: "center", justifyContent: "center", paddingHorizontal: space.xl },
});
