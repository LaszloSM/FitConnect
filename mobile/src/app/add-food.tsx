import { router, useLocalSearchParams } from "expo-router";
import { BarcodeIcon, CaretRightIcon, CookingPotIcon, PlusIcon, StarIcon } from "phosphor-react-native";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Platform, Pressable, ScrollView, Text, View } from "react-native";

import { Choices, Skeleton, Stepper } from "@/components/controls";
import { Meter } from "@/components/charts";
import { foodIcon } from "@/components/today";
import { MacroLine, NutrientTable } from "@/components/nutrition";
import { Button, Card, Chip, Field, Notice, Press, Screen, Section, Ticker, Txt } from "@/components/ui";
import { api, OfflineError } from "@/lib/api";
import { bogotaToday, entryFor, logMeal } from "@/lib/meals";
import { fonts, radius, space, useColors } from "@/lib/theme";
import type { DayMeals, Food, MealKey, TargetsResponse } from "@/lib/types";
import { useCached } from "@/lib/useCached";

const MEALS: { value: MealKey; label: string }[] = [
  { value: "breakfast", label: "Desayuno" },
  { value: "lunch", label: "Almuerzo" },
  { value: "snack", label: "Algo" },
  { value: "dinner", label: "Cena" },
];
const MEAL_LABEL: Record<MealKey, string> = { breakfast: "desayuno", lunch: "almuerzo", dinner: "cena", snack: "algo" };

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
                  { minHeight: 36, paddingHorizontal: 14, justifyContent: "center", borderRadius: 999, backgroundColor: on ? c.brandMuted : c.muted },
                  pressed && { transform: [{ scale: 0.97 }] },
                ]}>
                <Text style={{ fontFamily: on ? fonts.bodySemi : fonts.bodyMedium, fontSize: 13.5, color: on ? c.brandInk : c.inkMuted }}>{cat.label}</Text>
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
              { flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 60, paddingVertical: 10, borderBottomWidth: i === foods.length - 1 ? 0 : 1, borderBottomColor: c.line },
              pressed && { opacity: 0.7 },
            ]}>
            {(() => {
              const I = foodIcon(f.name);
              return (
                <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: c.muted, alignItems: "center", justifyContent: "center" }}>
                  <I size={20} color={c.inkMuted} />
                </View>
              );
            })()}
            <View style={{ flex: 1, gap: 2 }}>
              <Txt weight="semi" size={14.5} numberOfLines={2}>{f.name}{f.brand ? ` · ${f.brand}` : ""}</Txt>
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
  const eaten = useCached<DayMeals>(`/api/v1/me/meals?day=${day}`);
  const preview = useMemo(() => entryFor(food, grams || 0, meal, day), [food, grams, meal, day]);
  const t = targets.data?.available ? targets.data.targets : undefined;
  const tot = eaten.data?.totals;

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

  const origin = food.source === "custom" ? "Creado por ti" : food.source === "recipe" ? "Tu comida (suma de ingredientes)" : food.origin;
  const leftAfter = t && tot ? Math.round(t.kcal - tot.kcal - preview.kcal) : null;

  return (
    <Screen
      edges={["bottom"]}
      footer={<Button label={`Agregar a ${MEAL_LABEL[meal]}`} icon={PlusIcon} onPress={save} loading={busy} disabled={!grams} size="lg" style={{ flex: 1 }} />}>
      <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.md, marginBottom: space.lg }}>
        <View style={{ flex: 1, gap: 8 }}>
          <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 26, lineHeight: 31, letterSpacing: -0.4, color: c.ink }}>
            {food.name}
          </Text>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, alignItems: "center" }}>
            {food.brand ? <Txt muted size={14}>{food.brand}</Txt> : null}
            {origin ? <Chip tone="neutral" label={origin.length > 34 ? `${origin.slice(0, 32)}…` : origin} /> : null}
          </View>
        </View>
        <Press
          accessibilityRole="button"
          accessibilityLabel={food.favorite ? "Quitar de favoritos" : "Agregar a favoritos"}
          accessibilityState={{ selected: Boolean(food.favorite), busy: favBusy }}
          disabled={favBusy}
          onPress={toggleFav}
          scaleTo={0.9}
          style={{ width: 46, height: 46, borderRadius: 23, alignItems: "center", justifyContent: "center", backgroundColor: food.favorite ? c.brandMuted : c.muted }}>
          <StarIcon size={22} color={food.favorite ? c.brandInk : c.inkMuted} weight={food.favorite ? "fill" : "regular"} />
        </Press>
      </View>
      {error ? <Notice tone="danger">{error}</Notice> : null}

      <Choices options={MEALS} value={meal} onChange={setMeal} />

      <Card style={{ gap: space.lg, marginTop: space.lg }}>
        {food.portions.length ? (
          <Choices
            options={food.portions.filter((p, i, all) => all.findIndex((x) => Math.round(x.grams) === Math.round(p.grams)) === i).map((p) => ({
              value: String(Math.round(p.grams)),
              label: p.label === `${Math.round(p.grams)} g` ? p.label : `${p.label} · ${Math.round(p.grams)} g`,
            }))}
            value={String(grams)}
            onChange={(v) => setGrams(Number(v))}
          />
        ) : null}
        <Stepper value={grams} onChange={setGrams} />
      </Card>

      <Card style={{ gap: space.lg, marginTop: space.md }}>
        <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: space.md }}>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
            <Ticker value={preview.kcal} size={40} />
            <Txt weight="semi">kcal</Txt>
          </View>
          {leftAfter !== null ? (
            <Txt size={13.5} weight="semi" style={{ color: leftAfter < 0 ? c.warn : c.inkMuted }}>
              {leftAfter < 0 ? `Te pasarías por ${Math.abs(leftAfter).toLocaleString("es-CO")}` : `Te quedarían ${leftAfter.toLocaleString("es-CO")}`}
            </Txt>
          ) : null}
        </View>
        {t ? (
          <>
            <Meter label="Calorías" value={tot?.kcal ?? 0} preview={preview.kcal} target={t.kcal} unit="kcal" color={c.brand} />
            <Meter label="Proteína" value={tot?.protein_g ?? 0} preview={preview.protein_g} target={t.protein_g} unit="g" color={c.protein} />
            <Meter label="Carbohidratos" value={tot?.carbs_g ?? 0} preview={preview.carbs_g} target={t.carbs_g} unit="g" color={c.carbs} />
            <Meter label="Grasa" value={tot?.fat_g ?? 0} preview={preview.fat_g} target={t.fat_g} unit="g" color={c.fat} />
            <Txt muted size={12}>La parte clara de cada barra es lo que suma esta porción a lo que ya comiste hoy.</Txt>
          </>
        ) : (
          <MacroLine kcal={preview.kcal} protein={preview.protein_g} carbs={preview.carbs_g} fat={preview.fat_g} />
        )}
      </Card>

      {food.components?.length ? (
        <>
          <Section>Ingredientes</Section>
          <Card style={{ paddingVertical: space.xs }}>
            {food.components.map((it, i) => (
              <View key={`${it.food_id}-${i}`} style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md, paddingVertical: 10, borderBottomWidth: i === food.components!.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
                <Txt size={14} style={{ flex: 1 }}>{it.name}</Txt>
                <Txt size={14} muted style={{ fontVariant: ["tabular-nums"] }}>{Math.round(it.grams)} g</Txt>
              </View>
            ))}
          </Card>
        </>
      ) : null}

      <Section>Información nutricional en {grams || 0} g</Section>
      <Card>
        <NutrientTable
          macros={{ kcal: preview.kcal, protein_g: preview.protein_g, carbs_g: preview.carbs_g, fat_g: preview.fat_g, fiber_g: preview.fiber_g }}
          values={food.nutrients ? preview.nutrients : {}}
          targets={targets.data?.targets ?? null}
        />
      </Card>
      {t ? <Txt muted size={12.5} style={{ marginTop: space.sm }}>El porcentaje es de tu meta del día.</Txt> : null}
      {food.origin ? <Txt muted size={12.5} style={{ marginTop: space.md }}>Fuente: {food.origin}</Txt> : null}
      <Button label="Elegir otro alimento" variant="ghost" onPress={onBack} style={{ marginTop: space.md }} />
    </Screen>
  );
}
