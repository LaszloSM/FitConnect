/**
 * Piezas de nutrición: la tabla de nutrientes (con % de la meta del día) y el
 * resumen de macros de una porción.
 */
import { Text, View } from "react-native";

import { fonts, space, useColors } from "@/lib/theme";
import type { NutrientKey, Targets } from "@/lib/types";

export const NUTRIENTS: { key: NutrientKey; label: string; unit: string }[] = [
  { key: "sugars_g", label: "Azúcares", unit: "g" },
  { key: "sat_fat_g", label: "Grasa saturada", unit: "g" },
  { key: "sodium_mg", label: "Sodio", unit: "mg" },
  { key: "potassium_mg", label: "Potasio", unit: "mg" },
  { key: "calcium_mg", label: "Calcio", unit: "mg" },
  { key: "iron_mg", label: "Hierro", unit: "mg" },
  { key: "vit_c_mg", label: "Vitamina C", unit: "mg" },
  { key: "vit_a_ug", label: "Vitamina A", unit: "µg" },
  { key: "vit_d_ug", label: "Vitamina D", unit: "µg" },
  { key: "vit_b12_ug", label: "Vitamina B12", unit: "µg" },
  { key: "cholesterol_mg", label: "Colesterol", unit: "mg" },
];

export function fmt(n: number) {
  if (n >= 100) return Math.round(n).toLocaleString("es-CO");
  if (n >= 10) return String(Math.round(n));
  return String(Math.round(n * 10) / 10).replace(".", ",");
}

type Row = { label: string; unit: string; value: number | null; complete?: boolean; target?: { value: number; kind: "min" | "max" } };

/**
 * Tabla estilo etiqueta. Cada fila dice el valor y, si hay meta, cuánto es de
 * ella; un límite superado se marca con texto («pasa el límite»), no solo con
 * color. Un dato que no existe se escribe «sin dato».
 */
export function NutrientTable({
  macros,
  values,
  targets,
  compact,
}: {
  macros?: { kcal: number; protein_g: number; carbs_g: number; fat_g: number; fiber_g: number };
  values: Partial<Record<NutrientKey, number | { value: number; complete: boolean }>>;
  targets?: Targets | null;
  compact?: boolean;
}) {
  const c = useColors();
  const rows: Row[] = [];
  if (macros) {
    rows.push(
      { label: "Proteína", unit: "g", value: macros.protein_g, target: targets ? { value: targets.protein_g, kind: "min" } : undefined },
      { label: "Carbohidratos", unit: "g", value: macros.carbs_g, target: targets ? { value: targets.carbs_g, kind: "min" } : undefined },
      { label: "Grasa", unit: "g", value: macros.fat_g, target: targets ? { value: targets.fat_g, kind: "min" } : undefined },
      { label: "Fibra", unit: "g", value: macros.fiber_g, target: targets ? { value: targets.fiber_g, kind: "min" } : undefined },
    );
  }
  for (const n of NUTRIENTS) {
    const raw = values[n.key];
    const v = raw === undefined ? null : typeof raw === "number" ? raw : raw.value;
    if (compact && v === null) continue;
    rows.push({
      label: n.label, unit: n.unit, value: v,
      complete: typeof raw === "object" ? raw.complete : true,
      target: targets?.micro?.[n.key],
    });
  }

  return (
    <View accessibilityRole="list">
      {macros ? (
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", paddingBottom: space.sm, borderBottomWidth: 2, borderBottomColor: c.ink }}>
          <Text style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: c.ink }}>Energía</Text>
          <Text style={{ fontFamily: fonts.display, fontSize: 22, color: c.ink, fontVariant: ["tabular-nums"] }}>{fmt(macros.kcal)} kcal</Text>
        </View>
      ) : null}
      {rows.map((r, i) => {
        const pct = r.target && r.value !== null ? Math.round((r.value / r.target.value) * 100) : null;
        const over = r.target?.kind === "max" && r.value !== null && r.value > r.target.value;
        return (
          <View
            key={r.label}
            accessible
            accessibilityLabel={`${r.label}: ${r.value === null ? "sin dato" : `${fmt(r.value)} ${r.unit}`}${pct !== null ? `, ${pct} por ciento de ${r.target!.kind === "max" ? "el límite" : "la meta"}` : ""}${over ? ", pasa el límite" : ""}${r.complete === false ? ", dato parcial" : ""}`}
            style={{ flexDirection: "row", alignItems: "center", paddingVertical: 9, borderBottomWidth: i === rows.length - 1 ? 0 : 1, borderBottomColor: c.muted, gap: space.md }}>
            <Text style={{ flex: 1, fontFamily: i < (macros ? 4 : 0) ? fonts.bodySemi : fonts.body, fontSize: 14, color: c.ink }}>{r.label}</Text>
            <Text style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: r.value === null ? c.inkMuted : c.ink, fontVariant: ["tabular-nums"] }}>
              {r.value === null ? "sin dato" : `${r.complete === false ? "≥ " : ""}${fmt(r.value)} ${r.unit}`}
            </Text>
            <Text style={{ width: 92, textAlign: "right", fontFamily: fonts.body, fontSize: 12.5, color: over ? c.warn : c.inkMuted, fontVariant: ["tabular-nums"] }}>
              {pct === null ? "" : over ? `pasa el límite` : `${pct} % ${r.target!.kind === "max" ? "del límite" : "de la meta"}`}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** Cifras de una porción: calorías grandes y tres macros con reglas verticales. */
export function MacroLine({ kcal, protein, carbs, fat }: { kcal: number; protein: number; carbs: number; fat: number }) {
  const c = useColors();
  const cell = (label: string, v: number, unit: string, first?: boolean) => (
    <View style={{ flex: first ? 1.45 : 1, paddingLeft: first ? 0 : space.md, borderLeftWidth: first ? 0 : 1, borderLeftColor: c.line, gap: 2 }}>
      <Text numberOfLines={1} style={{ fontFamily: fonts.display, fontSize: first ? 30 : 20, color: c.ink, fontVariant: ["tabular-nums"] }}>
        {fmt(v)}
        {unit ? <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: c.inkMuted }}> {unit}</Text> : null}
      </Text>
      <Text numberOfLines={1} style={{ fontFamily: fonts.body, fontSize: 12.5, color: c.inkMuted }}>{label}</Text>
    </View>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end" }}>
      {cell("kcal", kcal, "", true)}
      {cell("Proteína", protein, "g")}
      {cell("Carbos", carbs, "g")}
      {cell("Grasa", fat, "g")}
    </View>
  );
}
