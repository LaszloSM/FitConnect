import { router, useFocusEffect } from "expo-router";
import { ChatCircleDotsIcon, DropIcon, ListChecksIcon, PlusIcon } from "phosphor-react-native";
import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";

import { Button, Card, Notice, Num, Screen, Section, Title, Txt } from "@/components/ui";
import { api } from "@/lib/api";
import { pendingMeals, syncMeals } from "@/lib/meals";
import { radius, space, useColors } from "@/lib/theme";
import type { DayMeals, MealEntry, MealKey, TargetsResponse } from "@/lib/types";
import { useCached } from "@/lib/useCached";

const ORDER: { key: MealKey; label: string }[] = [
  { key: "breakfast", label: "Desayuno" },
  { key: "lunch", label: "Almuerzo" },
  { key: "dinner", label: "Cena" },
  { key: "snack", label: "Entre comidas" },
];

function Bar({ label, value, target, unit }: { label: string; value: number; target?: number; unit: string }) {
  const c = useColors();
  const pct = target ? Math.min(value / target, 1) : 0;
  const over = Boolean(target && value > target * 1.05);
  return (
    <View style={{ gap: 6, flex: 1 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <Txt size={13} muted>{label}</Txt>
        <Txt size={13} weight="semi">
          {Math.round(value)}
          {target ? ` / ${target}` : ""} {unit}
        </Txt>
      </View>
      <View style={{ height: 8, borderRadius: 4, backgroundColor: c.muted, overflow: "hidden" }}>
        <View style={{ height: 8, width: `${pct * 100}%`, borderRadius: 4, backgroundColor: over ? c.warn : c.brand }} />
      </View>
    </View>
  );
}

export default function Eat() {
  const c = useColors();
  const targets = useCached<TargetsResponse>("/api/v1/me/nutrition/targets");
  const day = useCached<DayMeals>("/api/v1/me/meals");
  const [pending, setPending] = useState<MealEntry[]>([]);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        setPending(await syncMeals().catch(() => pendingMeals()));
        void day.reload();
        void targets.reload();
      })();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const entries = [...(day.data?.entries ?? []), ...pending.filter((p) => !(day.data?.entries ?? []).some((e) => e.id === p.id))];
  const total = (k: "kcal" | "protein_g" | "carbs_g" | "fat_g") => entries.reduce((s, e) => s + e[k], 0);
  const t = targets.data?.available ? targets.data.targets : undefined;

  const remove = async (e: MealEntry) => {
    if (e.pending) return;
    await api(`/api/v1/me/meals/${e.id}`, { method: "DELETE" }).catch(() => undefined);
    void day.reload();
  };

  return (
    <Screen refreshing={day.loading && Boolean(day.data)} onRefresh={() => { void day.reload(); void targets.reload(); }}>
      <Title sub="Lo que comes hoy, sin contar de más">Comer</Title>

      {targets.data && !targets.data.available ? (
        <Notice tone="info">{targets.data.message}</Notice>
      ) : null}

      <Card style={{ gap: space.lg }}>
        <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
          <View>
            <Txt muted size={13}>Hoy</Txt>
            <Num size={40}>{Math.round(total("kcal"))}</Num>
            <Txt muted size={13}>{t ? `de ${t.kcal} kcal` : "kcal"}</Txt>
          </View>
          {t ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <DropIcon size={18} color={c.info} />
              <Txt size={13} muted>{(t.water_ml / 1000).toFixed(1).replace(".", ",")} L de agua</Txt>
            </View>
          ) : null}
        </View>
        <Bar label="Proteína" value={total("protein_g")} target={t?.protein_g} unit="g" />
        <View style={{ flexDirection: "row", gap: space.lg }}>
          <Bar label="Carbohidratos" value={total("carbs_g")} target={t?.carbs_g} unit="g" />
          <Bar label="Grasa" value={total("fat_g")} target={t?.fat_g} unit="g" />
        </View>
        {targets.data?.clamped_message ? <Txt size={13} muted>{targets.data.clamped_message}</Txt> : null}
      </Card>

      {ORDER.map(({ key, label }) => {
        const items = entries.filter((e) => e.meal === key);
        return (
          <View key={key}>
            <Section
              action={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Agregar a ${label}`}
                  hitSlop={8}
                  onPress={() => router.push({ pathname: "/add-food", params: { meal: key } })}
                  style={{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44, paddingHorizontal: 4 }}>
                  <PlusIcon size={16} color={c.brandInk} weight="bold" />
                  <Txt size={14} weight="semi" style={{ color: c.brandInk }}>Agregar</Txt>
                </Pressable>
              }>
              {label}
            </Section>
            {items.length ? (
              <Card style={{ gap: space.md }}>
                {items.map((e) => (
                  <Pressable key={e.id} onLongPress={() => void remove(e)} accessibilityHint="Mantén presionado para borrar">
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md }}>
                      <View style={{ flex: 1 }}>
                        <Txt weight="medium" numberOfLines={1}>{e.food_name}</Txt>
                        <Txt muted size={13}>
                          {Math.round(e.grams)} g · {Math.round(e.protein_g)} g proteína{e.pending ? " · por subir" : ""}
                        </Txt>
                      </View>
                      <Txt weight="semi">{Math.round(e.kcal)} kcal</Txt>
                    </View>
                  </Pressable>
                ))}
              </Card>
            ) : (
              <View style={{ borderRadius: radius.md, borderWidth: 1, borderStyle: "dashed", borderColor: c.line, padding: space.md }}>
                <Txt muted size={14}>Nada registrado.</Txt>
              </View>
            )}
          </View>
        );
      })}

      <Section>Ayuda</Section>
      <View style={{ gap: space.sm }}>
        <Button label="Pregúntale al asistente" variant="secondary" icon={ChatCircleDotsIcon} onPress={() => router.push("/assistant")} />
        <Button label="Mis planes" variant="secondary" icon={ListChecksIcon} onPress={() => router.push("/plans")} />
      </View>
      {targets.data?.notice ? <Txt muted size={12} style={{ marginTop: space.lg }}>{targets.data.notice}</Txt> : null}
    </Screen>
  );
}
