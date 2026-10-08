import { router, useLocalSearchParams } from "expo-router";
import { BarcodeIcon, CaretRightIcon } from "phosphor-react-native";
import { useEffect, useState } from "react";
import { Platform, Pressable, View } from "react-native";

import { Button, Card, Chip, Field, Notice, Num, Screen, Section, Txt } from "@/components/ui";
import { api, OfflineError } from "@/lib/api";
import { entryFor, logMeal } from "@/lib/meals";
import { radius, space, useColors } from "@/lib/theme";
import type { Food, MealKey } from "@/lib/types";

const MEAL_LABEL: Record<MealKey, string> = { breakfast: "Desayuno", lunch: "Almuerzo", dinner: "Cena", snack: "Entre comidas" };

export default function AddFood() {
  const params = useLocalSearchParams<{ meal?: MealKey; barcode?: string; notFound?: string }>();
  const meal: MealKey = params.meal ?? "snack";
  const c = useColors();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Food[]>([]);
  const [food, setFood] = useState<Food | null>(null);
  const [grams, setGrams] = useState("100");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [custom, setCustom] = useState<{ name: string; kcal: string; protein: string; carbs: string; fat: string } | null>(
    params.notFound ? { name: "", kcal: "", protein: "", carbs: "", fat: "" } : null,
  );

  useEffect(() => {
    const t = setTimeout(() => {
      api<Food[]>(`/api/v1/me/foods?q=${encodeURIComponent(q.trim())}`)
        .then(setResults)
        .catch((e) => setError(e instanceof OfflineError ? "Sin conexión: la búsqueda necesita internet." : (e as Error).message));
    }, 200);
    return () => clearTimeout(t);
  }, [q]);

  // Viene del escáner: el producto ya quedó guardado en el servidor, así que esto es rápido.
  useEffect(() => {
    if (!params.barcode || params.notFound) return;
    api<Food>(`/api/v1/me/foods/barcode/${params.barcode}`)
      .then(pick)
      .catch(() => setCustom({ name: "", kcal: "", protein: "", carbs: "", fat: "" }));
  }, [params.barcode, params.notFound]);

  const pick = (f: Food) => {
    setFood(f);
    setGrams(String(f.portions[0]?.grams ?? 100));
  };

  const save = async () => {
    if (!food) return;
    const g = Number(grams.replace(",", "."));
    if (!g || g <= 0 || g > 3000) {
      setError("Escribe una cantidad en gramos entre 1 y 3000.");
      return;
    }
    setBusy(true);
    await logMeal(entryFor(food, g, meal));
    setBusy(false);
    router.back();
  };

  const createCustom = async () => {
    if (!custom) return;
    setBusy(true);
    setError(null);
    try {
      const f = await api<Food>("/api/v1/me/foods", {
        method: "POST",
        json: {
          name: custom.name.trim(),
          kcal: Number(custom.kcal.replace(",", ".")) || 0,
          protein_g: Number(custom.protein.replace(",", ".")) || 0,
          carbs_g: Number(custom.carbs.replace(",", ".")) || 0,
          fat_g: Number(custom.fat.replace(",", ".")) || 0,
          barcode: params.barcode || undefined,
        },
      });
      setCustom(null);
      pick(f);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (food) {
    const g = Number(grams.replace(",", ".")) || 0;
    const kcal = Math.round((food.kcal * g) / 100);
    return (
      <Screen edges={["bottom"]}>
        <Txt muted size={13}>{MEAL_LABEL[meal]}</Txt>
        <Txt weight="semi" size={20} style={{ marginBottom: space.md }}>{food.name}{food.brand ? ` · ${food.brand}` : ""}</Txt>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Field label="Cantidad (gramos)" value={grams} onChangeText={setGrams} keyboardType="decimal-pad" />
        {food.portions.length ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginBottom: space.lg }}>
            {food.portions.map((p) => (
              <Pressable key={p.label} accessibilityRole="button" onPress={() => setGrams(String(p.grams))}>
                <Chip tone={String(p.grams) === grams ? "info" : "neutral"} label={`${p.label} · ${p.grams} g`} />
              </Pressable>
            ))}
          </View>
        ) : null}
        <Card style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: space.lg }}>
          <View>
            <Num size={32}>{kcal} kcal</Num>
            <Txt muted size={13}>
              {Math.round((food.protein_g * g) / 100)} g proteína · {Math.round((food.carbs_g * g) / 100)} g carbohidratos · {Math.round((food.fat_g * g) / 100)} g grasa
            </Txt>
          </View>
        </Card>
        <Button label={`Agregar a ${MEAL_LABEL[meal].toLowerCase()}`} onPress={save} loading={busy} />
        <Button label="Elegir otro alimento" variant="ghost" onPress={() => setFood(null)} style={{ marginTop: space.sm }} />
        {food.source === "reference" ? (
          <Txt muted size={12} style={{ marginTop: space.lg }}>Valores aproximados de referencia por 100 g (USDA FoodData Central).</Txt>
        ) : null}
      </Screen>
    );
  }

  if (custom) {
    return (
      <Screen edges={["bottom"]}>
        <Txt muted style={{ marginBottom: space.md }}>
          {params.barcode ? "No encontramos ese producto. Cópialo de la etiqueta (valores por 100 g)." : "Escribe los valores por 100 g, como en la etiqueta."}
        </Txt>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Field label="Nombre" value={custom.name} onChangeText={(v) => setCustom({ ...custom, name: v })} />
        <Field label="Calorías (kcal)" value={custom.kcal} onChangeText={(v) => setCustom({ ...custom, kcal: v })} keyboardType="decimal-pad" />
        <View style={{ flexDirection: "row", gap: space.md }}>
          {(["protein", "carbs", "fat"] as const).map((k) => (
            <View key={k} style={{ flex: 1 }}>
              <Field label={{ protein: "Proteína", carbs: "Carbohid.", fat: "Grasa" }[k]} value={custom[k]} onChangeText={(v) => setCustom({ ...custom, [k]: v })} keyboardType="decimal-pad" />
            </View>
          ))}
        </View>
        <Button label="Guardar alimento" onPress={createCustom} loading={busy} disabled={custom.name.trim().length < 2 || !custom.kcal} />
      </Screen>
    );
  }

  return (
    <Screen edges={["bottom"]}>
      <Txt muted size={13} style={{ marginBottom: space.sm }}>Agregar a {MEAL_LABEL[meal].toLowerCase()}</Txt>
      {error ? <Notice tone="warn">{error}</Notice> : null}
      <Field label="Buscar alimento" value={q} onChangeText={setQ} placeholder="arroz, huevo, banano…" autoFocus />
      {Platform.OS !== "web" ? (
        <Button
          label="Escanear código de barras"
          variant="secondary"
          icon={BarcodeIcon}
          onPress={() => router.push({ pathname: "/scan", params: { meal } })}
          style={{ marginBottom: space.md }}
        />
      ) : null}
      <Section>{q.trim() ? "Resultados" : "Alimentos comunes"}</Section>
      <Card style={{ paddingVertical: space.xs }}>
        {results.map((f, i) => (
          <Pressable
            key={f.id}
            accessibilityRole="button"
            onPress={() => pick(f)}
            style={{ flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: i === results.length - 1 ? 0 : 1, borderBottomColor: c.muted }}>
            <View style={{ flex: 1 }}>
              <Txt weight="medium">{f.name}</Txt>
              <Txt muted size={13}>{Math.round(f.kcal)} kcal · {f.protein_g} g proteína por 100 g</Txt>
            </View>
            <CaretRightIcon size={18} color={c.inkMuted} />
          </Pressable>
        ))}
        {!results.length ? <Txt muted size={14} style={{ paddingVertical: space.md }}>Sin resultados.</Txt> : null}
      </Card>
      <Pressable
        accessibilityRole="button"
        onPress={() => setCustom({ name: q.trim(), kcal: "", protein: "", carbs: "", fat: "" })}
        style={{ marginTop: space.md, padding: space.md, borderRadius: radius.md }}>
        <Txt weight="semi" style={{ color: c.brandInk }}>¿No está? Créalo con los datos de la etiqueta</Txt>
      </Pressable>
    </Screen>
  );
}
