import { router, useLocalSearchParams } from "expo-router";
import { BowlFoodIcon, MinusIcon, PlusIcon, WarningCircleIcon, XIcon } from "phosphor-react-native";
import { useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";

import { MacroLine } from "@/components/nutrition";
import { foodIcon } from "@/components/today";
import { Button, Card, Field, IconTile, Notice, Press, Rise, Screen, Section, Txt } from "@/components/ui";
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
    <Screen edges={["bottom"]} footer={<Button label="Guardar mi comida" size="lg" onPress={save} loading={busy} disabled={!ready} style={{ flex: 1 }} />}>
      {error ? <Notice tone="danger" icon={WarningCircleIcon}>{error}</Notice> : null}
      <Rise>
        <Card style={{ gap: space.md }}>
          <View style={{ flexDirection: "row", gap: space.md, alignItems: "flex-start" }}>
            <IconTile icon={BowlFoodIcon} tone="wash" />
            <Txt muted size={14} style={{ flex: 1 }}>
              Junta lo que sueles comer junto (tu desayuno de siempre, una receta de la casa) y la próxima vez lo registras de un toque.
            </Txt>
          </View>
          <View style={{ marginBottom: -space.md }}>
            <Field label="Nombre" value={name} onChangeText={setName} placeholder="Ej.: desayuno con arepa y huevo" />
          </View>
        </Card>
      </Rise>

      <Rise delay={50}>
        <Section>Ingredientes</Section>
        <Card style={{ gap: space.sm }}>
          {items.map((it, i) => {
            const FoodIcon = foodIcon(it.food.name);
            return (
              <View key={`${it.food.id}-${i}`} style={{ flexDirection: "row", alignItems: "center", gap: space.sm, minHeight: 60, backgroundColor: c.muted, borderRadius: radius.row, paddingLeft: 10, paddingRight: 4 }}>
                <View style={{ width: 34, height: 34, borderRadius: radius.md, backgroundColor: c.card, alignItems: "center", justifyContent: "center" }}>
                  <FoodIcon size={18} color={c.inkMuted} />
                </View>
                <View style={{ flex: 1 }}>
                  <Txt size={14.5} weight="medium" numberOfLines={2}>{it.food.name}</Txt>
                  <Txt size={12.5} muted style={{ fontVariant: ["tabular-nums"] }}>{Math.round((it.food.kcal * grams(it)) / 100)} kcal</Txt>
                </View>
                <TextInput
                  accessibilityLabel={`Gramos de ${it.food.name}`}
                  value={it.grams}
                  onChangeText={(v) => setItems(items.map((x, j) => (j === i ? { ...x, grams: v } : x)))}
                  keyboardType="decimal-pad"
                  style={{ width: 68, minHeight: 40, textAlign: "right", paddingHorizontal: 10, borderRadius: radius.md, borderWidth: 1, borderColor: grams(it) > 0 ? c.lineStrong : c.danger, backgroundColor: c.field, fontFamily: fonts.bodySemi, fontSize: 15, color: c.ink, fontVariant: ["tabular-nums"] }}
                />
                <Txt size={14} muted>g</Txt>
                <Press
                  accessibilityRole="button"
                  accessibilityLabel={`Quitar ${it.food.name}`}
                  onPress={() => setItems(items.filter((_, j) => j !== i))}
                  hitSlop={6}
                  scaleTo={0.9}
                  style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
                  <XIcon size={18} color={c.inkMuted} />
                </Press>
              </View>
            );
          })}
          <View style={{ marginBottom: results.length ? 0 : -space.md, marginTop: items.length ? space.sm : 0 }}>
            <Field label={items.length ? "Agregar otro ingrediente" : "Busca el primer ingrediente"} value={q} onChangeText={setQ} placeholder="huevo, arepa, queso…" />
          </View>
          {results.length ? (
            <View style={{ marginTop: -space.sm }}>
              {results.map((f, i) => {
                const FoodIcon = foodIcon(f.name);
                return (
                  <Press
                    key={f.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Agregar ${f.name}`}
                    onPress={() => add(f)}
                    scaleTo={0.985}
                    style={{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 52, borderBottomWidth: i === results.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
                    <FoodIcon size={18} color={c.inkFaint} />
                    <Txt size={14.5} style={{ flex: 1 }} numberOfLines={2}>{f.name}</Txt>
                    <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c.brandMuted, alignItems: "center", justifyContent: "center" }}>
                      <PlusIcon size={16} color={c.brandInk} weight="bold" />
                    </View>
                  </Press>
                );
              })}
            </View>
          ) : null}
        </Card>
      </Rise>

      <Rise delay={100}>
        <Section>Porciones</Section>
        <Card style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md }}>
          <Counter icon={<MinusIcon size={20} color={c.ink} weight="bold" />} label="Una porción menos" disabled={servings <= 1} onPress={() => setServings(servings - 1)} />
          <Text accessibilityLiveRegion="polite" style={{ flex: 1, textAlign: "center", fontFamily: fonts.display, fontSize: 24, color: c.ink, fontVariant: ["tabular-nums"] }}>
            {servings} {servings === 1 ? "porción" : "porciones"}
          </Text>
          <Counter icon={<PlusIcon size={20} color={c.ink} weight="bold" />} label="Una porción más" disabled={servings >= 20} onPress={() => setServings(servings + 1)} />
        </Card>
      </Rise>

      {items.length ? (
        <Rise>
          <Card tone="muted" style={{ marginTop: space.md, gap: space.md }}>
            <Txt muted size={13}>
              {servings > 1 ? `Cada porción (${Math.round(totalGrams / servings)} g)` : `Toda la comida (${Math.round(totalGrams)} g)`}
            </Txt>
            <MacroLine kcal={per(total.kcal)} protein={per(total.protein)} carbs={per(total.carbs)} fat={per(total.fat)} />
          </Card>
        </Rise>
      ) : null}
    </Screen>
  );
}

function Counter({ icon, label, onPress, disabled }: { icon: React.ReactNode; label: string; onPress: () => void; disabled?: boolean }) {
  const c = useColors();
  return (
    <Press
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      scaleTo={0.94}
      style={{ width: 48, height: 48, borderRadius: radius.pill, backgroundColor: c.muted, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.4 : 1 }}>
      {icon}
    </Press>
  );
}
