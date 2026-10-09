/**
 * Controles de formulario de la app: segmentos, stepper de cantidad, casillas
 * y la hoja inferior. Todo con objetivo táctil de 44 px y respuesta al
 * presionar (escala 0,97, sin animar al navegar).
 */
import * as Haptics from "expo-haptics";
import { CheckIcon, MinusIcon, PlusIcon } from "phosphor-react-native";
import { type ReactNode, useEffect, useRef } from "react";
import { Animated, Easing, Modal, Platform, Pressable, ScrollView, Text, TextInput, View, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fonts, motion, radius, space, useColors } from "@/lib/theme";

function tap() {
  if (Platform.OS !== "web") void Haptics.selectionAsync().catch(() => undefined);
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  style?: ViewStyle;
}) {
  const c = useColors();
  return (
    <View accessibilityRole="tablist" style={[{ flexDirection: "row", backgroundColor: c.muted, borderRadius: radius.pill, padding: 4 }, style]}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: on }}
            onPress={() => {
              if (!on) tap();
              onChange(o.value);
            }}
            style={({ pressed }) => [
              {
                flex: 1,
                minHeight: 38,
                alignItems: "center",
                justifyContent: "center",
                borderRadius: radius.pill,
                backgroundColor: on ? c.card : "transparent",
              },
              on && { shadowColor: c.shadow, shadowOpacity: 0.08, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
              pressed && !on && { opacity: 0.7 },
            ]}>
            <Text style={{ fontFamily: on ? fonts.bodySemi : fonts.bodyMedium, fontSize: 14, color: on ? c.brandInk : c.inkMuted }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Opciones como fichas (una o varias). */
export function Choices<T extends string>({
  options,
  value,
  onChange,
  multiple,
}: {
  options: { value: T; label: string }[];
  value: T | T[] | null;
  onChange: (v: T) => void;
  multiple?: boolean;
}) {
  const c = useColors();
  const isOn = (v: T) => (Array.isArray(value) ? value.includes(v) : value === v);
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
      {options.map((o) => {
        const on = isOn(o.value);
        return (
          <Pressable
            key={o.value}
            accessibilityRole={multiple ? "checkbox" : "radio"}
            accessibilityState={multiple ? { checked: on } : { selected: on }}
            onPress={() => {
              tap();
              onChange(o.value);
            }}
            style={({ pressed }) => [
              {
                paddingHorizontal: 16,
                minHeight: 40,
                justifyContent: "center",
                borderRadius: radius.pill,
                borderWidth: 1,
                borderColor: on ? c.brandMuted : c.muted,
                backgroundColor: on ? c.brandMuted : c.muted,
              },
              pressed && { transform: [{ scale: 0.97 }] },
            ]}>
            <Text style={{ fontFamily: on ? fonts.bodySemi : fonts.bodyMedium, fontSize: 14, color: on ? c.brandInk : c.inkMuted }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/**
 * Cantidad en gramos: botones de −/+ con paso según el tamaño (5 g bajo 100,
 * 10 g hasta 500, 25 g arriba) y el número editable al centro.
 */
export function Stepper({ value, onChange, unit = "g", min = 1, max = 3000 }: { value: number; onChange: (v: number) => void; unit?: string; min?: number; max?: number }) {
  const c = useColors();
  const step = value < 100 ? 5 : value < 500 ? 10 : 25;
  const set = (v: number) => {
    const clamped = Math.max(min, Math.min(max, Math.round(v)));
    if (clamped !== value) tap();
    onChange(clamped);
  };
  const btn = (icon: ReactNode, label: string, delta: number) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={() => set(delta < 0 ? Math.ceil(value / step) * step - step : Math.floor(value / step) * step + step)}
      hitSlop={6}
      style={({ pressed }) => [
        { width: 52, height: 52, borderRadius: radius.pill, backgroundColor: c.muted, alignItems: "center", justifyContent: "center" },
        pressed && { transform: [{ scale: 0.95 }], opacity: 0.85 },
      ]}>
      {icon}
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
      {btn(<MinusIcon size={22} color={c.ink} weight="bold" />, `Menos ${step} ${unit}`, -1)}
      <View style={{ flex: 1, flexDirection: "row", alignItems: "baseline", justifyContent: "center", gap: 4, borderBottomWidth: 1, borderBottomColor: c.line, paddingBottom: 4 }}>
        <TextInput
          accessibilityLabel={`Cantidad en ${unit}`}
          value={String(value)}
          onChangeText={(t) => {
            const n = Number(t.replace(",", ".").replace(/[^\d.]/g, ""));
            if (!Number.isNaN(n)) onChange(Math.min(max, n));
          }}
          onBlur={() => set(value || min)}
          keyboardType="number-pad"
          selectTextOnFocus
          style={{ fontFamily: fonts.display, fontSize: 40, color: c.ink, textAlign: "center", minWidth: 90, padding: 0, fontVariant: ["tabular-nums"] }}
        />
        <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 16, color: c.inkMuted }}>{unit}</Text>
      </View>
      {btn(<PlusIcon size={22} color={c.ink} weight="bold" />, `Más ${step} ${unit}`, 1)}
    </View>
  );
}

export function Check({ checked, onChange, children }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
      onPress={() => {
        tap();
        onChange(!checked);
      }}
      style={{ flexDirection: "row", gap: space.md, alignItems: "flex-start", minHeight: 44, paddingVertical: 6 }}>
      <View
        style={{
          width: 24,
          height: 24,
          marginTop: 1,
          borderRadius: 7,
          borderWidth: checked ? 0 : 1.5,
          borderColor: c.line,
          backgroundColor: checked ? c.brand : c.field,
          alignItems: "center",
          justifyContent: "center",
        }}>
        {checked ? <CheckIcon size={16} color={c.brandContrast} weight="bold" /> : null}
      </View>
      <Text style={{ flex: 1, fontFamily: fonts.body, fontSize: 14.5, lineHeight: 21, color: c.ink }}>{children}</Text>
    </Pressable>
  );
}

/**
 * Hoja inferior. Entra desde abajo (220 ms, ease-out fuerte) y sale más
 * rápido de lo que entra; el fondo se oscurece con opacidad. Con movimiento
 * reducido solo hace fundido.
 */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const t = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(t, {
      toValue: open ? 1 : 0,
      duration: open ? 420 : 200,
      easing: open ? motion.drawer : motion.out,
      useNativeDriver: Platform.OS !== "web",
    }).start();
  }, [open, t]);

  return (
    <Modal visible={open} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <Animated.View style={{ flex: 1, backgroundColor: c.scrim, opacity: t }}>
        <Pressable accessibilityLabel="Cerrar" style={{ flex: 1 }} onPress={onClose} />
      </Animated.View>
      <Animated.View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: "88%",
          backgroundColor: c.card,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          paddingBottom: insets.bottom + space.lg,
          transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [480, 0] }) }],
          shadowColor: c.shadow,
          shadowOpacity: 0.08,
          shadowRadius: 24,
          shadowOffset: { width: 0, height: -6 },
          elevation: 12,
        }}>
        <View style={{ alignItems: "center", paddingTop: 10 }}>
          <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: c.line }} />
        </View>
        {title ? (
          <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 20, color: c.ink, paddingHorizontal: space.xl, paddingTop: space.md }}>
            {title}
          </Text>
        ) : null}
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: space.xl, paddingVertical: space.lg, gap: space.md }}>
          {children}
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

/** Bloque gris con la forma del contenido final mientras carga. */
export function Skeleton({ height, width = "100%", style }: { height: number; width?: number | `${number}%`; style?: ViewStyle }) {
  const c = useColors();
  const pulse = useRef(new Animated.Value(0.55)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, useNativeDriver: Platform.OS !== "web" }),
        Animated.timing(pulse, { toValue: 0.55, duration: 700, useNativeDriver: Platform.OS !== "web" }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return <Animated.View accessibilityElementsHidden style={[{ height, width, borderRadius: radius.md, backgroundColor: c.muted, opacity: pulse }, style]} />;
}
