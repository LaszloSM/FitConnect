import { router, useLocalSearchParams } from "expo-router";
import { BarcodeIcon, CaretDownIcon, CheckCircleIcon, FlaskIcon, InfoIcon, WarningCircleIcon, WarningIcon } from "phosphor-react-native";
import { useState } from "react";
import { Text, TextInput, View } from "react-native";

import { Choices, Segmented } from "@/components/controls";
import { MacroLine, NUTRIENTS } from "@/components/nutrition";
import { Button, Card, Field, IconTile, Notice, Press, Rise, Screen, Section, Txt } from "@/components/ui";
import { api, OfflineError } from "@/lib/api";
import { fonts, radius, space, useColors } from "@/lib/theme";
import type { Food, NutrientKey } from "@/lib/types";
import { useCached } from "@/lib/useCached";

type Basis = "100g" | "serving";
const MACROS = [
  { key: "kcal", label: "Calorías", unit: "kcal" },
  { key: "protein_g", label: "Proteína", unit: "g" },
  { key: "carbs_g", label: "Carbohidratos", unit: "g" },
  { key: "fat_g", label: "Grasa", unit: "g" },
  { key: "fiber_g", label: "Fibra", unit: "g" },
] as const;
type MacroKey = (typeof MACROS)[number]["key"];

function num(s: string): number | null {
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) && n >= 0 ? n : NaN;
}

/** Alimento propio con los datos de la etiqueta, por 100 g o por porción. */
export default function CreateFood() {
  const params = useLocalSearchParams<{ meal?: string; day?: string; barcode?: string; name?: string }>();
  const c = useColors();
  const cats = useCached<{ key: string; label: string }[]>("/api/v1/me/foods/categories");
  const [name, setName] = useState(params.name ?? "");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [basis, setBasis] = useState<Basis>("serving");
  const [servingGrams, setServingGrams] = useState("");
  const [servingLabel, setServingLabel] = useState("");
  const [macros, setMacros] = useState<Record<MacroKey, string>>({ kcal: "", protein_g: "", carbs_g: "", fat_g: "", fiber_g: "" });
  const [micro, setMicro] = useState<Partial<Record<NutrientKey, string>>>({});
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<Food | null>(null);

  const values = Object.fromEntries(MACROS.map((m) => [m.key, num(macros[m.key])])) as Record<MacroKey, number | null>;
  const bad = MACROS.find((m) => Number.isNaN(values[m.key]));
  const sg = num(servingGrams);
  const est = 4 * (values.protein_g ?? 0) + 4 * (values.carbs_g ?? 0) + 9 * (values.fat_g ?? 0);
  const showEst = values.kcal !== null && (values.protein_g !== null || values.carbs_g !== null || values.fat_g !== null);
  const off = showEst && values.kcal! > 20 && Math.abs(est - values.kcal!) > Math.max(20, 0.2 * values.kcal!);
  const unitLabel = basis === "serving" ? `por porción${sg ? ` de ${sg} g` : ""}` : "por 100 g";
  const ready = name.trim().length >= 2 && values.kcal !== null && !bad && (basis === "100g" || (sg !== null && sg > 0));

  const goLog = (f: Food) => router.dismissTo({ pathname: "/add-food", params: { meal: params.meal ?? "snack", day: params.day ?? "", foodId: f.id } });

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      const nutrients = Object.fromEntries(
        Object.entries(micro).map(([k, v]) => [k, num(v ?? "")]).filter(([, v]) => v !== null && !Number.isNaN(v)),
      );
      const f = await api<Food>("/api/v1/me/foods", {
        method: "POST",
        json: {
          name: name.trim(),
          brand: brand.trim() || undefined,
          category: category ?? undefined,
          basis,
          serving_grams: basis === "serving" ? sg : undefined,
          serving_label: basis === "serving" ? servingLabel.trim() || undefined : undefined,
          kcal: values.kcal,
          protein_g: values.protein_g ?? 0,
          carbs_g: values.carbs_g ?? 0,
          fat_g: values.fat_g ?? 0,
          fiber_g: values.fiber_g ?? 0,
          nutrients,
          barcode: params.barcode || undefined,
        },
      });
      if (f.warning) setSaved(f);
      else goLog(f);
    } catch (e) {
      setError(e instanceof OfflineError ? "Sin conexión: crear un alimento necesita internet." : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (saved) {
    return (
      <Screen
        edges={["bottom"]}
        footer={
          <>
            <Button label="Volver" variant="secondary" size="lg" onPress={() => router.back()} style={{ flex: 1 }} />
            <Button label="Registrarlo ahora" size="lg" onPress={() => goLog(saved)} style={{ flex: 1.6 }} />
          </>
        }>
        <Rise>
          <Notice tone="warn" icon={WarningIcon}>{saved.warning}</Notice>
          <Card style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <IconTile icon={CheckCircleIcon} tone="ok" />
            <Txt style={{ flex: 1 }}>«{saved.name}» quedó guardado. Si la etiqueta dice eso, está bien: algunos productos redondean.</Txt>
          </Card>
        </Rise>
      </Screen>
    );
  }

  const preview = {
    kcal: values.kcal ?? 0,
    protein: values.protein_g ?? 0,
    carbs: values.carbs_g ?? 0,
    fat: values.fat_g ?? 0,
  };
  const anyValue = MACROS.some((m) => values[m.key] !== null && !Number.isNaN(values[m.key]));

  return (
    <Screen
      edges={["bottom"]}
      footer={<Button label="Guardar alimento" size="lg" onPress={submit} loading={busy} disabled={!ready} style={{ flex: 1 }} />}>
      {params.barcode ? <Notice tone="info" icon={BarcodeIcon}>No encontramos el código {params.barcode}. Cópialo de la etiqueta: queda solo para ti.</Notice> : null}
      {error ? <Notice tone="danger" icon={WarningCircleIcon}>{error}</Notice> : null}

      <Rise>
        <Card>
          <Field label="Nombre" value={name} onChangeText={setName} placeholder="Ej.: avena en hojuelas" />
          <Field label="Marca (opcional)" value={brand} onChangeText={setBrand} />
          {cats.data?.length ? (
            <View style={{ gap: space.sm }}>
              <Txt weight="semi" size={13.5}>Tipo de alimento (opcional)</Txt>
              <Choices
                options={cats.data.filter((x) => x.key !== "platos").map((cat) => ({ value: cat.key, label: cat.label }))}
                value={category}
                onChange={(v) => setCategory(category === v ? null : v)}
              />
            </View>
          ) : null}
        </Card>
      </Rise>

      <Rise delay={50}>
        <Section>Tabla nutricional</Section>
        <Txt muted size={14} style={{ marginBottom: space.md }}>
          Copia la columna que trae tu etiqueta. Nosotros la pasamos a 100 g.
        </Txt>
        <Card style={{ gap: space.md }}>
          <Segmented
            options={[
              { value: "serving", label: "Por porción" },
              { value: "100g", label: "Por 100 g" },
            ]}
            value={basis}
            onChange={setBasis}
          />
          {basis === "serving" ? (
            <View style={{ flexDirection: "row", gap: space.md, marginBottom: -space.md }}>
              <View style={{ flex: 1 }}>
                <Field label="Gramos de la porción" value={servingGrams} onChangeText={setServingGrams} keyboardType="decimal-pad" placeholder="30" error={sg !== null && Number.isNaN(sg) ? "Escribe un número" : null} />
              </View>
              <View style={{ flex: 1.3 }}>
                <Field label="Cómo se llama" value={servingLabel} onChangeText={setServingLabel} placeholder="1 paquete" />
              </View>
            </View>
          ) : null}
          <View>
            {MACROS.map((m, i) => (
              <LabelRow
                key={m.key}
                label={m.label}
                unit={m.unit}
                value={macros[m.key]}
                onChange={(v) => setMacros({ ...macros, [m.key]: v })}
                strong={i === 0}
                last={i === MACROS.length - 1}
                invalid={Number.isNaN(values[m.key])}
              />
            ))}
          </View>
        </Card>
      </Rise>

      {anyValue ? (
        <Rise>
          <Card tone="muted" style={{ marginTop: space.md, gap: space.md }}>
            <Txt muted size={13}>Valores {unitLabel}</Txt>
            <MacroLine kcal={preview.kcal} protein={preview.protein} carbs={preview.carbs} fat={preview.fat} />
            {showEst && !off ? <Txt muted size={13}>Con estos macros serían unas {Math.round(est)} kcal.</Txt> : null}
          </Card>
        </Rise>
      ) : null}
      {off ? (
        <View style={{ marginTop: space.md }}>
          <Notice tone="warn" icon={WarningIcon}>Con estos macros serían unas {Math.round(est)} kcal, no cuadra con las calorías: revisa la etiqueta.</Notice>
        </View>
      ) : !anyValue ? (
        <Txt muted size={13} style={{ marginTop: space.sm }}>Valores {unitLabel}.</Txt>
      ) : null}

      <Rise delay={100}>
        <Card style={{ marginTop: space.lg, paddingVertical: space.xs }}>
          <Press
            accessibilityRole="button"
            accessibilityState={{ expanded: more }}
            onPress={() => setMore(!more)}
            scaleTo={0.985}
            style={{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 56 }}>
            <IconTile icon={FlaskIcon} tone="wash" size={36} />
            <Txt weight="semi" style={{ flex: 1 }}>Más nutrientes (opcional)</Txt>
            <CaretDownIcon size={18} color={c.inkMuted} style={{ transform: [{ rotate: more ? "180deg" : "0deg" }] }} />
          </Press>
          {more ? (
            <View style={{ borderTopWidth: 1, borderTopColor: c.line, marginBottom: space.sm }}>
              {NUTRIENTS.map((n, i) => (
                <LabelRow
                  key={n.key}
                  label={n.label}
                  unit={n.unit}
                  value={micro[n.key] ?? ""}
                  onChange={(v) => setMicro({ ...micro, [n.key]: v })}
                  last={i === NUTRIENTS.length - 1}
                  invalid={Number.isNaN(num(micro[n.key] ?? ""))}
                />
              ))}
            </View>
          ) : null}
        </Card>
        {more ? (
          <View style={{ flexDirection: "row", gap: 6, alignItems: "center", marginTop: space.sm }}>
            <InfoIcon size={15} color={c.inkMuted} />
            <Txt muted size={13} style={{ flex: 1 }}>Lo que dejes vacío queda como «sin dato», no como cero.</Txt>
          </View>
        ) : null}
      </Rise>
    </Screen>
  );
}

function LabelRow({ label, unit, value, onChange, strong, last, invalid }: { label: string; unit: string; value: string; onChange: (v: string) => void; strong?: boolean; last?: boolean; invalid?: boolean }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 54, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.line }}>
      <Text style={{ flex: 1, fontFamily: strong ? fonts.bodySemi : fonts.body, fontSize: 15, color: c.ink }}>{label}</Text>
      <TextInputCell value={value} onChange={onChange} label={`${label} en ${unit}`} invalid={invalid} />
      <Text style={{ width: 36, fontFamily: fonts.body, fontSize: 14, color: c.inkMuted }}>{unit}</Text>
    </View>
  );
}

function TextInputCell({ value, onChange, label, invalid }: { value: string; onChange: (v: string) => void; label: string; invalid?: boolean }) {
  const c = useColors();
  const [focus, setFocus] = useState(false);
  return (
    <TextInput
      accessibilityLabel={label}
      value={value}
      onChangeText={onChange}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      keyboardType="decimal-pad"
      placeholderTextColor={c.inkFaint}
      style={{
        width: 96,
        minHeight: 42,
        textAlign: "right",
        paddingHorizontal: 12,
        borderRadius: radius.md,
        borderWidth: focus ? 1.5 : 1,
        borderColor: invalid ? c.danger : focus ? c.brand : c.lineStrong,
        backgroundColor: c.field,
        fontFamily: fonts.bodySemi,
        fontSize: 16,
        color: c.ink,
        fontVariant: ["tabular-nums"],
      }}
    />
  );
}
