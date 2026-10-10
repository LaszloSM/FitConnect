/**
 * Piezas del día compartidas por Inicio y Comer: encabezado de la app, agua,
 * racha, la hoja «Registrar» y el registro rápido.
 */
import { router } from "expo-router";
import * as Haptics from "expo-haptics";
import {
  ArrowCounterClockwiseIcon,
  AvocadoIcon,
  BarcodeIcon,
  BowlFoodIcon,
  BreadIcon,
  CheeseIcon,
  CoffeeIcon,
  CookieIcon,
  DropIcon,
  EggIcon,
  FireIcon,
  FishIcon,
  type Icon,
  LeafIcon,
  LightningIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  OrangeSliceIcon,
  SunHorizonIcon,
  SunIcon,
  CarrotIcon,
  BirdIcon,
  CowIcon,
} from "phosphor-react-native";
import { useEffect, useRef, useState } from "react";
import { Animated, Platform, Text, TextInput, View } from "react-native";

import { BrandMark } from "@/components/BrandMark";
import { Choices, Sheet } from "@/components/controls";
import { Button, Card, IconTile, Notice, Press, Txt, useReducedMotion } from "@/components/ui";
import { api } from "@/lib/api";
import { addDays, bogotaToday, copyMeals, logMeal, mealNow, quickEntry } from "@/lib/meals";
import { fonts, motion, radius, space, useColors } from "@/lib/theme";
import type { MealKey, Streak, WaterDay } from "@/lib/types";

export const MEALS: { key: MealKey; label: string; icon: Icon }[] = [
  { key: "breakfast", label: "Desayuno", icon: SunHorizonIcon },
  { key: "lunch", label: "Almuerzo", icon: SunIcon },
  { key: "snack", label: "Algo", icon: CookieIcon },
  { key: "dinner", label: "Cena", icon: MoonIcon },
];

export const MEAL_LABEL: Record<MealKey, string> = { breakfast: "Desayuno", lunch: "Almuerzo", snack: "Algo", dinner: "Cena" };

/** No hay fotos de comida: cada alimento lleva un icono según lo que es. */
const FOOD_ICONS: [RegExp, Icon][] = [
  [/huevo|perico/, EggIcon],
  [/pollo|pechuga|pavo|muslo/, BirdIcon],
  [/res|carne|lomo|cerdo|chicharr|chorizo|salchich|jam[oó]n/, CowIcon],
  [/pescado|at[uú]n|salm[oó]n|tilapia|sardina|mojarra|camar/, FishIcon],
  [/caf[eé]|t[eé]\b|chocolate caliente|aromática/, CoffeeIcon],
  [/arepa|pan\b|pan |galleta|tostada|avena|arroz|pasta|cereal|ma[ií]z|tortilla/, BreadIcon],
  [/leche|yogur|kumis|queso|cuajada|kéfir|kefir/, CheeseIcon],
  [/aguacate/, AvocadoIcon],
  [/banano|pl[aá]tano|manzana|naranja|mango|fresa|papaya|pi[ñn]a|mandarina|fruta|guayaba|lulo|mora|jugo/, OrangeSliceIcon],
  [/ensalada|lechuga|tomate|br[oó]coli|espinaca|verdura|pepino|cebolla/, LeafIcon],
  [/zanahoria|ahuyama|papa|yuca|arracacha/, CarrotIcon],
  [/agua\b/, DropIcon],
];

export function foodIcon(name: string): Icon {
  const n = name.toLowerCase();
  return FOOD_ICONS.find(([re]) => re.test(n))?.[1] ?? BowlFoodIcon;
}

function tap() {
  if (Platform.OS !== "web") void Haptics.selectionAsync().catch(() => undefined);
}

/** Logo y avatar con iniciales (no hay foto: no la pedimos). */
export function AppHeader({ name, onAvatar }: { name?: string; onAvatar?: () => void }) {
  const c = useColors();
  const initials = (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.lg }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }} accessible accessibilityLabel="LSMFit">
        <BrandMark size={30} />
        <Text style={{ fontFamily: fonts.display, fontSize: 19, letterSpacing: -0.3, color: c.ink }}>LSMFit</Text>
      </View>
      <Press
        accessibilityRole="button"
        accessibilityLabel="Mi perfil"
        onPress={onAvatar ?? (() => router.push("/profile"))}
        scaleTo={0.92}
        style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: c.muted, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.line }}>
        <Text style={{ fontFamily: fonts.bodySemi, fontSize: 13.5, color: c.inkMuted }}>{initials || "·"}</Text>
      </Press>
    </View>
  );
}

/** Vaso tocable: el agua sube con escala vertical (transform, no altura). */
function Glass({ full, onPress, label }: { full: boolean; onPress: () => void; label: string }) {
  const c = useColors();
  const reduced = useReducedMotion();
  const level = useRef(new Animated.Value(full ? 1 : 0)).current;
  useEffect(() => {
    Animated.timing(level, { toValue: full ? 1 : 0, duration: reduced ? 0 : motion.base, easing: motion.out, useNativeDriver: Platform.OS !== "web" }).start();
  }, [full, level, reduced]);
  return (
    <Press accessibilityRole="button" accessibilityLabel={label} onPress={onPress} scaleTo={0.9} hitSlop={2} style={{ flex: 1, alignItems: "center", minHeight: 44, justifyContent: "flex-end" }}>
      <View style={{ width: "100%", maxWidth: 26, height: 34, borderRadius: 7, borderWidth: 1.5, borderColor: full ? c.water : c.lineStrong, overflow: "hidden", justifyContent: "flex-end" }}>
        <Animated.View style={{ height: "100%", backgroundColor: c.water, opacity: 0.85, transform: [{ translateY: level.interpolate({ inputRange: [0, 1], outputRange: [34, 0] }) }] }} />
      </View>
    </Press>
  );
}

export function WaterCard({ water, onAdd, onRemove }: { water: WaterDay | null; onAdd: () => void; onRemove: () => void }) {
  const c = useColors();
  const glass = water?.glass_ml ?? 250;
  const goal = water?.goal_ml ?? 2000;
  const total = water?.total_ml ?? 0;
  const slots = Math.max(1, Math.round(goal / glass));
  const filled = Math.min(slots, Math.round(total / glass));
  return (
    <Card style={{ flex: 1, gap: space.md, minWidth: 0 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <DropIcon size={18} color={c.water} weight="fill" />
        <Txt weight="semi" size={14.5}>Agua</Txt>
      </View>
      <View style={{ flexDirection: "row", gap: 5 }} accessibilityLabel={`Agua: ${filled} de ${slots} vasos`}>
        {Array.from({ length: slots }, (_, i) => (
          <Glass
            key={i}
            full={i < filled}
            label={i < filled ? "Quitar un vaso" : "Tomé un vaso de agua"}
            onPress={() => {
              tap();
              if (i < filled) onRemove();
              else onAdd();
            }}
          />
        ))}
      </View>
      <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: c.inkMuted, fontVariant: ["tabular-nums"] }}>
        <Text style={{ fontFamily: fonts.display, fontSize: 16, color: c.ink }}>{total.toLocaleString("es-CO")}</Text> / {goal.toLocaleString("es-CO")} ml
      </Text>
    </Card>
  );
}

const DAY_LETTER = ["D", "L", "M", "M", "J", "V", "S"];

export function StreakCard({ streak }: { streak: Streak | null }) {
  const c = useColors();
  const cur = streak?.current ?? 0;
  return (
    <Card style={{ width: 132, gap: space.md }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <FireIcon size={18} color={c.brand} weight="fill" />
        <Txt weight="semi" size={14.5}>Racha</Txt>
      </View>
      <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 30, lineHeight: 32, color: c.ink, fontVariant: ["tabular-nums"] }}>
        {cur}
        <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: c.inkMuted }}> {cur === 1 ? "día" : "días"}</Text>
      </Text>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }} accessibilityLabel={`Racha de ${cur} días; la mejor, ${streak?.best ?? 0}`}>
        {(streak?.week ?? []).map((d, i) => {
          const [y, m, dd] = d.day.split("-").map(Number);
          const isToday = i === 6;
          return (
            <View key={d.day} style={{ alignItems: "center", gap: 3 }}>
              <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: d.logged ? c.brand : "transparent", borderWidth: d.logged ? 0 : 1.5, borderColor: isToday ? c.brand : c.lineStrong }} />
              <Text style={{ fontFamily: isToday ? fonts.bodySemi : fonts.body, fontSize: 10, color: isToday ? c.ink : c.inkFaint }}>{DAY_LETTER[new Date(y, m - 1, dd).getDay()]}</Text>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

function SheetRow({ icon, title, detail, onPress, delay }: { icon: Icon; title: string; detail: string; onPress: () => void; delay: number }) {
  const reduced = useReducedMotion();
  const t = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(t, { toValue: 1, duration: motion.base, delay: reduced ? 0 : 120 + delay, easing: motion.out, useNativeDriver: Platform.OS !== "web" }).start();
  }, [t, delay, reduced]);
  return (
    <Animated.View style={{ opacity: t, transform: [{ translateY: t.interpolate({ inputRange: [0, 1], outputRange: [reduced ? 0 : 10, 0] }) }] }}>
      <Press accessibilityRole="button" accessibilityLabel={title} onPress={onPress} scaleTo={0.98} style={{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 60 }}>
        <IconTile icon={icon} tone="wash" size={44} />
        <View style={{ flex: 1 }}>
          <Txt weight="semi" size={15.5}>{title}</Txt>
          <Txt muted size={13}>{detail}</Txt>
        </View>
      </Press>
    </Animated.View>
  );
}

/**
 * La hoja «Registrar»: cuatro caminos para anotar comida en segundos. La
 * comida elegida arranca en la que toca por la hora.
 */
export function RegisterSheet({
  open,
  onClose,
  day = bogotaToday(),
  meal: initial,
  onLogged,
  quickFirst,
}: {
  open: boolean;
  onClose: () => void;
  day?: string;
  meal?: MealKey;
  onLogged?: () => void;
  /** Abre directo en el registro rápido. */
  quickFirst?: boolean;
}) {
  const [meal, setMeal] = useState<MealKey>(initial ?? mealNow());
  const [quick, setQuick] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (open) {
      setMeal(initial ?? mealNow());
      setQuick(Boolean(quickFirst));
      setMsg(null);
    }
  }, [open, initial, quickFirst]);

  const go = (pathname: "/add-food" | "/scan") => {
    onClose();
    router.push({ pathname, params: { meal, day } });
  };

  const repeat = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const prev = addDays(day, -1);
      const yesterday = await api<{ entries: { meal: MealKey }[] }>(`/api/v1/me/meals?day=${prev}`);
      const n = yesterday.entries.filter((e) => e.meal === meal).length;
      if (!n) {
        setMsg(`Ayer no registraste ${MEAL_LABEL[meal].toLowerCase()}.`);
        return;
      }
      await copyMeals(prev, n, { toDay: day, meal });
      onLogged?.();
      onClose();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={quick ? "Registro rápido" : "Registrar"}>
      <Choices options={MEALS.map((m) => ({ value: m.key, label: m.label }))} value={meal} onChange={setMeal} />
      {msg ? <Notice tone="warn">{msg}</Notice> : null}
      {quick ? (
        <QuickAddForm
          onSave={async (v) => {
            await logMeal(quickEntry(v, meal, day));
            onLogged?.();
            onClose();
          }}
        />
      ) : (
        <View style={{ gap: space.xs }}>
          <SheetRow icon={MagnifyingGlassIcon} title="Buscar alimento" detail="Más de 1.700 alimentos y productos" onPress={() => go("/add-food")} delay={0} />
          <SheetRow icon={BarcodeIcon} title="Escanear código" detail="Empacados, uno tras otro" onPress={() => go("/scan")} delay={50} />
          <SheetRow icon={LightningIcon} title="Registro rápido" detail="Solo las calorías, sin buscar" onPress={() => setQuick(true)} delay={100} />
          <SheetRow
            icon={ArrowCounterClockwiseIcon}
            title={`Repetir ${MEAL_LABEL[meal].toLowerCase()} de ayer`}
            detail={busy ? "Copiando…" : "Lo mismo que comiste ayer a esta hora"}
            onPress={() => void repeat()}
            delay={150}
          />
        </View>
      )}
    </Sheet>
  );
}

function NumField({ label, value, onChange, unit, autoFocus }: { label: string; value: string; onChange: (v: string) => void; unit: string; autoFocus?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flex: 1, gap: 6 }}>
      <Text style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: c.inkMuted }}>{label}</Text>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4, borderBottomWidth: 1.5, borderBottomColor: c.lineStrong, paddingBottom: 4 }}>
        <TextInput
          accessibilityLabel={`${label} en ${unit}`}
          value={value}
          onChangeText={(t) => onChange(t.replace(/[^\d,.]/g, ""))}
          keyboardType="decimal-pad"
          autoFocus={autoFocus}
          placeholder="0"
          placeholderTextColor={c.inkFaint}
          style={{ flex: 1, fontFamily: fonts.display, fontSize: 24, color: c.ink, padding: 0, fontVariant: ["tabular-nums"] }}
        />
        <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: c.inkFaint }}>{unit}</Text>
      </View>
    </View>
  );
}

function QuickAddForm({ onSave }: { onSave: (v: { label?: string; kcal: number; protein_g?: number; carbs_g?: number; fat_g?: number }) => Promise<void> }) {
  const c = useColors();
  const [label, setLabel] = useState("");
  const [kcal, setKcal] = useState("");
  const [p, setP] = useState("");
  const [cb, setCb] = useState("");
  const [f, setF] = useState("");
  const [busy, setBusy] = useState(false);
  const num = (s: string) => (s ? Number(s.replace(",", ".")) : undefined);
  const k = num(kcal) ?? 0;
  const ok = k > 0 && k <= 5000;
  return (
    <View style={{ gap: space.lg }}>
      <NumField label="Calorías" value={kcal} onChange={setKcal} unit="kcal" autoFocus />
      <View style={{ flexDirection: "row", gap: space.md }}>
        <NumField label="Proteína" value={p} onChange={setP} unit="g" />
        <NumField label="Carbos" value={cb} onChange={setCb} unit="g" />
        <NumField label="Grasa" value={f} onChange={setF} unit="g" />
      </View>
      <View style={{ gap: 6 }}>
        <Text style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: c.inkMuted }}>Nombre (opcional)</Text>
        <TextInput
          accessibilityLabel="Nombre del registro"
          value={label}
          onChangeText={setLabel}
          maxLength={80}
          placeholder="Ej.: empanada de la esquina"
          placeholderTextColor={c.inkFaint}
          style={{ minHeight: 46, borderRadius: radius.md, borderWidth: 1, borderColor: c.lineStrong, backgroundColor: c.field, paddingHorizontal: 14, fontFamily: fonts.body, fontSize: 16, color: c.ink }}
        />
      </View>
      <Button
        label={ok ? `Registrar ${Math.round(k).toLocaleString("es-CO")} kcal` : "Registrar"}
        disabled={!ok}
        loading={busy}
        onPress={() => {
          setBusy(true);
          void onSave({ label, kcal: k, protein_g: num(p), carbs_g: num(cb), fat_g: num(f) }).finally(() => setBusy(false));
        }}
      />
    </View>
  );
}

/** Icono de cada comida en su cuadrito (Stitch: sol, sol alto, galleta, luna). */
export function MealTile({ meal }: { meal: MealKey }) {
  const m = MEALS.find((x) => x.key === meal)!;
  return <IconTile icon={m.icon} tone="wash" size={40} />;
}

