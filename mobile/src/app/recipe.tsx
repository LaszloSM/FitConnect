import { router, useLocalSearchParams } from "expo-router";
import { MinusIcon, PlusIcon, XIcon } from "phosphor-react-native";
import { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { MacroLine } from "@/components/nutrition";
import { Button, Card, Field, Notice, Screen, Section, Txt } from "@/components/ui";
import { api, OfflineError } from "@/lib/api";
import { fonts, radius, space, useColors } from "@/lib/theme";
import type { Food } from "@/lib/types";

type Item = { food: Food; grams: string };

/** «Mi comida»: varios alimentos guardados como uno, para registrarlos de un toque. */
export default function Recipe() {
  const params = useLocalSearchParams<{ meal?: string; day?: string }>();
  const c = useColors();
  const [name, setName] = useState("");
  const [servings, setServings] = useState(1);
  const [items, setItems] = useState<Item[]>([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Food[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!q.trim()) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      api<Food[]>(`/api/v1/me/foods?q=${encodeURIComponent(q.trim())}`)
        .then((r) => setResults(r.filter((f) => f.source !== "recipe").slice(0, 6)))
        .catch((e) => setError(e instanceof OfflineError ? "Sin conexión: armar una comida necesita internet." : (e as Error).message));
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  const grams = (it: Item) => Number(it.grams.replace(",", ".")) || 0;
  const sum = (k: "kcal" | "protein_g" | "carbs_g" | "fat_g") => items.reduce((a, it) => a + (it.food[k] * grams(it)) / 100, 0);
  const total = { kcal: sum("kcal"), protein: sum("protein_g"), carbs: sum("carbs_g"), fat: sum("fat_g") };
  const totalGrams = items.reduce((a, it) => a + grams(it), 0);
  const ready = name.trim().length >= 2 && items.length > 0 && items.every((it) => grams(it) > 0 && grams(it) <= 3000);

  const add = (f: Food) => {
    setItems([...items, { food: f, grams: String(Math.round(f.portions[0]?.grams ?? 100)) }]);
    setQ("");
    setResults([]);
  };

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const f = await api<Food>("/api/v1/me/recipes", {
        method: "POST",
        json: { name: name.trim(), servings, items: items.map((it) => ({ food_id: it.food.id, grams: grams(it) })) },
      });
      router.dismissTo({ pathname: "/add-food", params: { meal: params.meal ?? "snack", day: params.day ?? "", foodId: f.id } });
    } catch (e) {
      setError(e instanceof OfflineError ? "Sin conexión: guardar la comida necesita internet." : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const per = (v: number) => v / servings;

  return (
    <Screen edges={["bottom"]}>
      <Txt muted style={{ marginBottom: space.lg }}>
        Junta lo que sueles comer junto (tu desayuno de siempre, una receta de la casa) y la próxima vez lo registras de un toque.
      </Txt>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Field label="Nombre" value={name} onChangeText={setName} placeholder="Ej.: desayuno con arepa y huevo" />

      <Section>Ingredientes</Section>
      {items.length ? (
        <Card style={{ paddingVertical: space.xs, marginBottom: space.md }}>
          {items.map((it, i) => (
            <View key={`${it.food.id}-${i}`} style={{ flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 56, borderBottomWidth: i === items.length - 1 ? 0 : 1, borderBottomColor: c.muted }}>
              <View style={{ flex: 1 }}>
                <Txt size={14.5} weight="medium" numberOfLines={2}>{it.food.name}</Txt>
                <Txt size={12.5} muted>{Math.round((it.food.kcal * grams(it)) / 100)} kcal</Txt>
              </View>
              <TextInput
                accessibilityLabel={`Gramos de ${it.food.name}`}
                value={it.grams}
                onChangeText={(v) => setItems(items.map((x, j) => (j === i ? { ...x, grams: v } : x)))}
                keyboardType="decimal-pad"
                style={{ width: 72, minHeight: 40, textAlign: "right", paddingHorizontal: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: grams(it) > 0 ? c.line : c.danger, backgroundColor: c.field, fontFamily: fonts.bodySemi, fontSize: 15, color: c.ink, fontVariant: ["tabular-nums"] }}
              />
              <Txt size={14} muted>g</Txt>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`Quitar ${it.food.name}`}
                onPress={() => setItems(items.filter((_, j) => j !== i))}
                hitSlop={6}
                style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
                <XIcon size={18} color={c.inkMuted} />
              </Pressable>
            </View>
          ))}
        </Card>
      ) : null}
      <Field label={items.length ? "Agregar otro ingrediente" : "Busca el primer ingrediente"} value={q} onChangeText={setQ} placeholder="huevo, arepa, queso…" />
      {results.length ? (
        <Card style={{ paddingVertical: space.xs, marginTop: -space.sm }}>
          {results.map((f, i) => (
            <Pressable
              key={f.id}
              accessibilityRole="button"
              accessibilityLabel={`Agregar ${f.name}`}
              onPress={() => add(f)}
              style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 52, borderBottomWidth: i === results.length - 1 ? 0 : 1, borderBottomColor: c.muted }, pressed && { opacity: 0.7 }]}>
              <Txt size={14.5} style={{ flex: 1 }} numberOfLines={2}>{f.name}</Txt>
              <PlusIcon size={18} color={c.brandInk} weight="bold" />
            </Pressable>
          ))}
        </Card>
      ) : null}

      <Section>Porciones</Section>
      <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
        <Counter icon={<MinusIcon size={20} color={c.ink} weight="bold" />} label="Una porción menos" disabled={servings <= 1} onPress={() => setServings(servings - 1)} />
        <Text accessibilityLiveRegion="polite" style={{ minWidth: 120, textAlign: "center", fontFamily: fonts.display, fontSize: 24, color: c.ink, fontVariant: ["tabular-nums"] }}>
          {servings} {servings === 1 ? "porción" : "porciones"}
        </Text>
        <Counter icon={<PlusIcon size={20} color={c.ink} weight="bold" />} label="Una porción más" disabled={servings >= 20} onPress={() => setServings(servings + 1)} />
      </View>

      {items.length ? (
        <Card style={{ marginTop: space.lg, gap: space.md }}>
          <Txt muted size={13}>
            {servings > 1 ? `Cada porción (${Math.round(totalGrams / servings)} g)` : `Toda la comida (${Math.round(totalGrams)} g)`}
          </Txt>
          <MacroLine kcal={per(total.kcal)} protein={per(total.protein)} carbs={per(total.carbs)} fat={per(total.fat)} />
        </Card>
      ) : null}

      <Button label="Guardar mi comida" onPress={save} loading={busy} disabled={!ready} style={{ marginTop: space.xl }} />
    </Screen>
  );
}

function Counter({ icon, label, onPress, disabled }: { icon: React.ReactNode; label: string; onPress: () => void; disabled?: boolean }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [{ width: 48, height: 48, borderRadius: radius.md, backgroundColor: c.muted, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.4 : 1 }, pressed && { transform: [{ scale: 0.95 }] }]}>
      {icon}
    </Pressable>
  );
}
