import { router, useLocalSearchParams } from "expo-router";
import { BarcodeIcon, CaretRightIcon, CookingPotIcon, PlusIcon, StarIcon } from "phosphor-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";

import { Segmented, Skeleton, Stepper } from "@/components/controls";
import { MacroLine, NutrientTable } from "@/components/nutrition";
import { Button, Card, Field, Notice, Screen, Section, Txt } from "@/components/ui";
import { api, OfflineError } from "@/lib/api";
import { bogotaToday, entryFor, logMeal } from "@/lib/meals";
import { fonts, radius, space, useColors } from "@/lib/theme";
import type { Food, MealKey, TargetsResponse } from "@/lib/types";
import { useCached } from "@/lib/useCached";

const MEALS: { value: MealKey; label: string }[] = [
  { value: "breakfast", label: "Desayuno" },
  { value: "lunch", label: "Almuerzo" },
  { value: "dinner", label: "Cena" },
  { value: "snack", label: "Otras" },
];
const MEAL_LABEL: Record<MealKey, string> = { breakfast: "desayuno", lunch: "almuerzo", dinner: "cena", snack: "entre comidas" };

type Category = { key: string; label: string };

export default function AddFood() {
  const params = useLocalSearchParams<{ meal?: MealKey; day?: string; barcode?: string; notFound?: string; foodId?: string }>();
  const day = params.day || bogotaToday();
  const [meal, setMeal] = useState<MealKey>(params.meal ?? "snack");
  const [food, setFood] = useState<Food | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pick = useCallback((f: Food) => {
    setError(null);
    setFood(f);
  }, []);

  // Viene del escáner: el producto ya quedó guardado en el servidor, así que esto es rápido.
  useEffect(() => {
    if (!params.barcode || params.notFound) return;
    api<Food>(`/api/v1/me/foods/barcode/${params.barcode}`)
      .then(pick)
      .catch(() => router.replace({ pathname: "/create-food", params: { meal, day, barcode: params.barcode } }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.barcode, params.notFound, pick]);

  // Vuelve de crear un alimento o una comida: se abre directo para registrarlo.
  useEffect(() => {
    if (!params.foodId) return;
    api<Food>(`/api/v1/me/foods/${params.foodId}`)
      .then(pick)
      .catch((e) => setError((e as Error).message));
  }, [params.foodId, pick]);

  if (food) return <FoodDetail food={food} meal={meal} setMeal={setMeal} day={day} onBack={() => setFood(null)} onChange={setFood} />;
  return <FoodSearch meal={meal} day={day} onPick={pick} error={error} barcodeMissing={Boolean(params.notFound)} />;
}

function FoodSearch({ meal, day, onPick, error: outerError, barcodeMissing }: { meal: MealKey; day: string; onPick: (f: Food) => void; error: string | null; barcodeMissing: boolean }) {
  const c = useColors();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [results, setResults] = useState<Food[] | null>(null);
  const [error, setError] = useState<string | null>(outerError);
  const cats = useCached<Category[]>("/api/v1/me/foods/categories");
  const recent = useCached<{ recent: Food[]; favorites: Food[] }>("/api/v1/me/foods/recent");

  useEffect(() => {
    const t = setTimeout(() => {
      const qs = new URLSearchParams({ q: q.trim() });
      if (category) qs.set("category", category);
      api<Food[]>(`/api/v1/me/foods?${qs.toString()}`)
        .then((r) => {
          setResults(r);
          setError(null);
        })
        .catch((e) => setError(e instanceof OfflineError ? "Sin conexión: la búsqueda necesita internet. Lo que registres se guarda y se sube después." : (e as Error).message));
    }, 220);
    return () => clearTimeout(t);
  }, [q, category]);

  const browsing = !q.trim() && !category;
  const favs = recent.data?.favorites ?? [];
  const recents = (recent.data?.recent ?? []).filter((f) => !favs.some((x) => x.id === f.id)).slice(0, 8);

  return (
    <Screen edges={["bottom"]}>
      <Txt muted size={13} style={{ marginBottom: space.sm }}>Para {MEAL_LABEL[meal]}{day !== bogotaToday() ? ` · ${day}` : ""}</Txt>
      {barcodeMissing ? <Notice tone="info">No encontramos ese producto. Búscalo por nombre o créalo con la etiqueta.</Notice> : null}
      {error ? <Notice tone="warn">{error}</Notice> : null}
      <Field label="Buscar alimento" value={q} onChangeText={setQ} placeholder="arroz, arepa, plátano, ajiaco…" autoFocus returnKeyType="search" />

      {cats.data?.length ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginHorizontal: -space.lg, marginBottom: space.sm }} contentContainerStyle={{ paddingHorizontal: space.lg, gap: space.sm }}>
          {[{ key: "", label: "Todo" }, ...cats.data].map((cat) => {
            const on = (category ?? "") === cat.key;
            return (
              <Pressable
                key={cat.key || "all"}
                accessibilityRole="radio"
                accessibilityState={{ selected: on }}
                onPress={() => setCategory(cat.key || null)}
                style={({ pressed }) => [
                  { minHeight: 40, paddingHorizontal: 14, justifyContent: "center", borderRadius: 999, borderWidth: 1, borderColor: on ? c.brand : c.line, backgroundColor: on ? c.brandMuted : c.card },
                  pressed && { transform: [{ scale: 0.97 }] },
                ]}>
                <Text style={{ fontFamily: on ? fonts.bodySemi : fonts.body, fontSize: 14, color: on ? c.brandInk : c.ink }}>{cat.label}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      ) : null}

      <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.sm }}>
        <ActionTile icon={<PlusIcon size={20} color={c.brandInk} weight="bold" />} label="Crear alimento" onPress={() => router.push({ pathname: "/create-food", params: { meal, day, name: q.trim() } })} />
        <ActionTile icon={<CookingPotIcon size={20} color={c.brandInk} weight="bold" />} label="Armar una comida" onPress={() => router.push({ pathname: "/recipe", params: { meal, day } })} />
        {Platform.OS !== "web" ? (
          <ActionTile icon={<BarcodeIcon size={20} color={c.brandInk} weight="bold" />} label="Escanear" onPress={() => router.push({ pathname: "/scan", params: { meal, day } })} />
        ) : null}
      </View>

      {browsing && favs.length ? (
        <>
          <Section>Favoritos</Section>
          <FoodList foods={favs} onPick={onPick} />
        </>
      ) : null}
      {browsing && recents.length ? (
        <>
          <Section>Lo que comes seguido</Section>
          <FoodList foods={recents} onPick={onPick} />
        </>
      ) : null}

      <Section>{browsing ? "Alimentos comunes" : "Resultados"}</Section>
      {results === null ? (
        <Card style={{ gap: space.md }}>
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} height={40} />)}
        </Card>
      ) : results.length ? (
        <FoodList foods={results} onPick={onPick} />
      ) : (
        <Card style={{ gap: space.sm }}>
          <Txt weight="semi">No encontramos «{q.trim() || "eso"}»</Txt>
          <Txt muted size={14}>Prueba con otra palabra (sin marca), o créalo con los datos de la etiqueta.</Txt>
        </Card>
      )}
    </Screen>
  );
}

function ActionTile({ icon, label, onPress }: { icon: React.ReactNode; label: string; onPress: () => void }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        { flex: 1, minHeight: 72, borderRadius: radius.md, backgroundColor: c.muted, padding: space.md, gap: 6, justifyContent: "center" },
        pressed && { transform: [{ scale: 0.97 }] },
      ]}>
      {icon}
      <Text style={{ fontFamily: fonts.bodySemi, fontSize: 13.5, color: c.ink }}>{label}</Text>
    </Pressable>
  );
}

function FoodList({ foods, onPick }: { foods: Food[]; onPick: (f: Food) => void }) {
  const c = useColors();
  return (
    <Card style={{ paddingVertical: space.xs }}>
      {foods.map((f, i) => {
        const portion = f.portions[0];
        return (
          <Pressable
            key={f.id}
            accessibilityRole="button"
            accessibilityLabel={`${f.name}, ${Math.round(f.kcal)} kilocalorías por 100 gramos`}
            onPress={() => onPick(f)}
            style={({ pressed }) => [
              { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 60, paddingVertical: 10, borderBottomWidth: i === foods.length - 1 ? 0 : 1, borderBottomColor: c.muted },
              pressed && { opacity: 0.7 },
            ]}>
            <View style={{ flex: 1, gap: 2 }}>
              <Txt weight="medium" numberOfLines={2}>{f.name}{f.brand ? ` · ${f.brand}` : ""}</Txt>
              <Txt muted size={13} numberOfLines={1}>
                {Math.round(f.kcal)} kcal · {Math.round(f.protein_g)} g prot. por 100 g{portion ? ` · ${portion.label}` : ""}
              </Txt>
            </View>
            {f.favorite ? <StarIcon size={16} color={c.inkMuted} weight="fill" /> : null}
            <CaretRightIcon size={18} color={c.inkMuted} />
          </Pressable>
        );
      })}
    </Card>
  );
}

function FoodDetail({ food, meal, setMeal, day, onBack, onChange }: { food: Food; meal: MealKey; setMeal: (m: MealKey) => void; day: string; onBack: () => void; onChange: (f: Food) => void }) {
  const c = useColors();
  const [grams, setGrams] = useState(Math.round(food.portions[0]?.grams ?? 100));
  const [busy, setBusy] = useState(false);
  const [favBusy, setFavBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const targets = useCached<TargetsResponse>("/api/v1/me/nutrition/targets");
  const preview = useMemo(() => entryFor(food, grams || 0, meal, day), [food, grams, meal, day]);

  const toggleFav = async () => {
    setFavBusy(true);
    try {
      const r = await api<{ favorite: boolean }>(`/api/v1/me/foods/${food.id}/favorite`, { method: food.favorite ? "DELETE" : "POST" });
      onChange({ ...food, favorite: r.favorite });
    } catch (e) {
      setError(e instanceof OfflineError ? "Sin conexión: los favoritos se guardan con señal." : (e as Error).message);
    } finally {
      setFavBusy(false);
    }
  };

  const save = async () => {
    if (!grams || grams <= 0 || grams > 3000) {
      setError("Escribe una cantidad entre 1 y 3.000 g.");
      return;
    }
    setBusy(true);
    await logMeal(entryFor(food, grams, meal, day));
    setBusy(false);
    router.back();
  };

  const origin = food.source === "custom" ? "Creado por ti, con los datos de la etiqueta." : food.source === "recipe" ? "Tu comida: suma de sus ingredientes." : food.origin;

  return (
    <Screen edges={["bottom"]}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.md, marginBottom: space.md }}>
        <View style={{ flex: 1, gap: 4 }}>
          {food.source === "recipe" ? <Txt muted size={13}>Tu comida</Txt> : food.category_label ? <Txt muted size={13}>{food.category_label}</Txt> : null}
          <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 24, lineHeight: 29, color: c.ink }}>
            {food.name}
          </Text>
          {food.brand ? <Txt muted size={14}>{food.brand}</Txt> : null}
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={food.favorite ? "Quitar de favoritos" : "Agregar a favoritos"}
          accessibilityState={{ selected: Boolean(food.favorite), busy: favBusy }}
          disabled={favBusy}
          onPress={toggleFav}
          style={({ pressed }) => [{ width: 48, height: 48, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: food.favorite ? c.brandMuted : c.muted }, pressed && { transform: [{ scale: 0.95 }] }]}>
          <StarIcon size={22} color={food.favorite ? c.brandInk : c.inkMuted} weight={food.favorite ? "fill" : "regular"} />
        </Pressable>
      </View>
      {error ? <Notice tone="danger">{error}</Notice> : null}

      <Segmented options={MEALS} value={meal} onChange={setMeal} style={{ marginBottom: space.lg }} />

      <Card style={{ gap: space.lg }}>
        {food.portions.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {food.portions.map((p) => {
              const on = Math.round(p.grams) === grams;
              return (
                <Pressable
                  key={`${p.label}-${p.grams}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => setGrams(Math.round(p.grams))}
                  style={({ pressed }) => [
                    { minHeight: 44, paddingHorizontal: 12, justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: on ? c.brand : c.line, backgroundColor: on ? c.brandMuted : c.card },
                    pressed && { transform: [{ scale: 0.97 }] },
                  ]}>
                  <Text style={{ fontFamily: on ? fonts.bodySemi : fonts.body, fontSize: 14, color: on ? c.brandInk : c.ink }}>
                    {p.label === `${Math.round(p.grams)} g` ? p.label : `${p.label} · ${Math.round(p.grams)} g`}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        ) : null}
        <Stepper value={grams} onChange={setGrams} />
        <MacroLine kcal={preview.kcal} protein={preview.protein_g} carbs={preview.carbs_g} fat={preview.fat_g} />
      </Card>

      <Button label={`Agregar a ${MEAL_LABEL[meal]}`} onPress={save} loading={busy} disabled={!grams} style={{ marginTop: space.lg }} />
      <Button label="Elegir otro alimento" variant="ghost" onPress={onBack} style={{ marginTop: space.xs }} />

      {food.components?.length ? (
        <>
          <Section>Ingredientes</Section>
          <Card style={{ paddingVertical: space.xs }}>
            {food.components.map((it, i) => (
              <View key={`${it.food_id}-${i}`} style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md, paddingVertical: 10, borderBottomWidth: i === food.components!.length - 1 ? 0 : 1, borderBottomColor: c.muted }}>
                <Txt size={14} style={{ flex: 1 }}>{it.name}</Txt>
                <Txt size={14} muted style={{ fontVariant: ["tabular-nums"] }}>{Math.round(it.grams)} g</Txt>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <Section>En {grams || 0} g</Section>
      <Card>
        <NutrientTable
          macros={{ kcal: preview.kcal, protein_g: preview.protein_g, carbs_g: preview.carbs_g, fat_g: preview.fat_g, fiber_g: preview.fiber_g }}
          values={food.nutrients ? preview.nutrients : {}}
          targets={targets.data?.targets ?? null}
        />
      </Card>
      {targets.data?.targets ? <Txt muted size={12.5} style={{ marginTop: space.sm }}>El porcentaje es de tu meta del día.</Txt> : null}
      {origin ? <Txt muted size={12.5} style={{ marginTop: space.md }}>Fuente: {origin}</Txt> : null}
    </Screen>
  );
}
