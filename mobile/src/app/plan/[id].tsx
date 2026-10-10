import * as Crypto from "expo-crypto";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { BellIcon, PlayIcon } from "phosphor-react-native";
import { useEffect, useState } from "react";
import { Alert, Platform, Pressable, Switch, View } from "react-native";

import { Meter } from "@/components/charts";
import { MacroLine } from "@/components/nutrition";
import { Button, Card, Chip, Loading, Notice, Screen, Section, Txt } from "@/components/ui";
import { api } from "@/lib/api";
import { plural } from "@/lib/format";
import { bogotaToday, logMeal } from "@/lib/meals";
import { disableMealReminders, enableMealReminders, reminderIds } from "@/lib/reminders";
import { space, useColors } from "@/lib/theme";
import type { MealKey, SavedPlan } from "@/lib/types";
import { useCached } from "@/lib/useCached";

const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function hour12(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "p. m." : "a. m."}`;
}

/** La hora del plan decide en qué comida del día queda el registro. */
function mealSlot(t: string): MealKey {
  const h = Number(t.split(":")[0]);
  if (h < 10) return "breakfast";
  if (h >= 12 && h < 15) return "lunch";
  if (h >= 18) return "dinner";
  return "snack";
}

function confirmDelete(): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(window.confirm("¿Borrar este plan?"));
  return new Promise((resolve) =>
    Alert.alert("¿Borrar este plan?", "No se puede deshacer.", [
      { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
      { text: "Borrar", style: "destructive", onPress: () => resolve(true) },
    ]),
  );
}

export default function PlanDetail() {
  const { id, note } = useLocalSearchParams<{ id: string; note?: string }>();
  const c = useColors();
  const plan = useCached<SavedPlan>(`/api/v1/me/plans/${id}`);
  const [reminders, setReminders] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [logged, setLogged] = useState<Set<number>>(new Set());
  const p = plan.data;

  useEffect(() => {
    void reminderIds(id).then((ids) => setReminders(ids.length > 0));
  }, [id]);

  const toggleReminders = async (on: boolean) => {
    if (!p || p.kind !== "meals") return;
    if (!on) {
      await disableMealReminders(id);
      setReminders(false);
      return;
    }
    const r = await enableMealReminders(id, p.data);
    if (r === "ok") setReminders(true);
    else setNotice(r === "denied" ? "Activa las notificaciones de LSMFit en los ajustes del celular." : "Los recordatorios funcionan en la app instalada en el celular.");
  };

  const logPlanMeal = async (index: number) => {
    if (!p || p.kind !== "meals") return;
    const m = p.data.meals[index];
    const slot = mealSlot(m.time);
    for (const i of m.items) {
      await logMeal({
        id: Crypto.randomUUID(), day: bogotaToday(), meal: slot, food_id: i.food_id, food_name: i.food, grams: i.grams,
        kcal: i.kcal, protein_g: i.protein_g, carbs_g: i.carbs_g, fat_g: i.fat_g, fiber_g: i.fiber_g, nutrients: {}, pending: true,
      });
    }
    setLogged(new Set([...logged, index]));
  };

  const setActive = async (active: boolean) => {
    await api(`/api/v1/me/plans/${id}`, { method: "PUT", json: { active } }).catch((e) => setNotice((e as Error).message));
    void plan.reload();
  };

  const remove = async () => {
    if (!(await confirmDelete())) return;
    await disableMealReminders(id);
    await api(`/api/v1/me/plans/${id}`, { method: "DELETE" }).catch(() => undefined);
    router.back();
  };

  return (
    <Screen edges={["bottom"]}>
      <Stack.Screen options={{ title: p?.title ?? "Plan" }} />
      {plan.error && !p ? <Notice tone="danger">{plan.error}</Notice> : null}
      {!p ? <Loading /> : null}
      {notice ? <Notice tone="warn">{notice}</Notice> : null}

      {p ? (
        <View style={{ flexDirection: "row", gap: space.sm, marginBottom: space.md, flexWrap: "wrap" }}>
          <Chip tone={p.data.engine === "ai" ? "info" : "neutral"} label={p.data.engine === "ai" ? "Hecho con IA" : "Automático"} />
          {!p.active ? <Chip tone="neutral" label="Pausado" /> : null}
        </View>
      ) : null}
      {note ? <Notice tone="info">{note}</Notice> : null}

      {p?.kind === "meals" ? (
        <>
          <Card style={{ gap: space.lg }}>
            <MacroLine kcal={p.data.totals.kcal} protein={p.data.totals.protein_g} carbs={p.data.totals.carbs_g} fat={p.data.totals.fat_g} />
            {p.data.targets ? (
              <View style={{ gap: space.md }}>
                <Meter label="Calorías" value={p.data.totals.kcal} target={p.data.targets.kcal} unit="kcal" />
                <Meter label="Proteína" value={p.data.totals.protein_g} target={p.data.targets.protein_g} unit="g" />
                <Meter label="Carbohidratos" value={p.data.totals.carbs_g} target={p.data.targets.carbs_g} unit="g" />
                <Meter label="Grasa" value={p.data.totals.fat_g} target={p.data.targets.fat_g} unit="g" />
              </View>
            ) : null}
          </Card>
          <Section>Tu día</Section>
          <View style={{ gap: space.sm }}>
            {p.data.meals.map((m, mi) => (
              <View key={`${m.time}-${m.name}`} style={{ flexDirection: "row", gap: space.md }}>
                <View style={{ width: 70, paddingTop: space.lg }}>
                  <Txt weight="semi" size={14}>{hour12(m.time)}</Txt>
                </View>
                <Card style={{ flex: 1, gap: space.sm }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.sm }}>
                    <Txt weight="semi" style={{ flex: 1 }}>{m.name}</Txt>
                    <Txt weight="semi" style={{ fontVariant: ["tabular-nums"] }}>{Math.round(m.kcal)} kcal</Txt>
                  </View>
                  {m.items.map((i, k) => (
                    <View key={k} style={{ flexDirection: "row", gap: space.sm }}>
                      <Txt size={14} style={{ flex: 1 }}>
                        {i.food} <Txt muted size={14}>· {i.portion ?? `${Math.round(i.grams)} g`}</Txt>
                      </Txt>
                      <Txt muted size={13} style={{ fontVariant: ["tabular-nums"] }}>{Math.round(i.kcal)}</Txt>
                    </View>
                  ))}
                  <Pressable
                    accessibilityRole="button"
                    disabled={logged.has(mi)}
                    onPress={() => void logPlanMeal(mi)}
                    style={({ pressed }) => [{ minHeight: 44, justifyContent: "center", alignSelf: "flex-start" }, pressed && { opacity: 0.6 }]}>
                    <Txt weight="semi" size={14} style={{ color: logged.has(mi) ? c.ok : c.brandInk }}>
                      {logged.has(mi) ? "Registrado hoy" : "Lo comí: registrarlo hoy"}
                    </Txt>
                  </Pressable>
                </Card>
              </View>
            ))}
          </View>
          <Card style={{ flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.lg }}>
            <BellIcon size={22} color={c.inkMuted} />
            <Txt style={{ flex: 1 }}>Recordarme cada comida a su hora</Txt>
            <Switch value={reminders} onValueChange={(v) => void toggleReminders(v)} trackColor={{ true: c.brand, false: c.line }} thumbColor={c.card} accessibilityLabel="Recordarme cada comida" />
          </Card>
        </>
      ) : null}

      {p?.kind === "training" ? (
        <View style={{ gap: space.sm }}>
          {p.data.days.map((d) => (
            <Card key={d.weekday} style={{ gap: space.sm }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                <View>
                  <Txt muted size={13}>{WEEKDAYS[d.weekday]}</Txt>
                  <Txt weight="semi" size={16}>{d.title}</Txt>
                </View>
                <Button
                  label="Empezar"
                  variant="secondary"
                  icon={PlayIcon}
                  onPress={() => router.push({ pathname: "/workout", params: { planId: p.id, weekday: String(d.weekday) } })}
                  style={{ minHeight: 44, paddingHorizontal: space.lg }}
                />
              </View>
              {d.exercises.map((e, k) => (
                <Txt key={k} size={14}>
                  {e.name} <Txt muted size={14}>· {plural(e.sets, "serie", "series")} de {e.reps}{e.rest_seconds ? ` · ${e.rest_seconds} s de descanso` : ""}</Txt>
                </Txt>
              ))}
            </Card>
          ))}
        </View>
      ) : null}

      {p?.data.notes ? (
        <>
          <Section>Indicaciones</Section>
          <Txt muted size={14}>{p.data.notes}</Txt>
        </>
      ) : null}

      {p ? (
        <View style={{ gap: space.sm, marginTop: space.xl }}>
          <Button label={p.active ? "Pausar este plan" : "Volver a usar este plan"} variant="secondary" onPress={() => void setActive(!p.active)} />
          <Button label="Borrar plan" variant="danger" onPress={() => void remove()} />
          <Txt muted size={12}>Orientación general. Ajusta el plan si sientes dolor o malestar y consulta a un profesional si tienes una condición de salud.</Txt>
        </View>
      ) : null}
    </Screen>
  );
}
