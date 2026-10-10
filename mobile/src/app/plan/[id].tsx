import * as Crypto from "expo-crypto";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { BarbellIcon, BellIcon, CheckCircleIcon, ForkKnifeIcon, LightningIcon, PauseIcon, PlayIcon, SparkleIcon } from "phosphor-react-native";
import { useEffect, useState } from "react";
import { Alert, Platform, Switch, Text, View } from "react-native";

import { Meter } from "@/components/charts";
import { foodIcon } from "@/components/today";
import { Button, Card, Chip, IconTile, Loading, Notice, Num, Press, Rise, Screen, Section, Ticker, Txt } from "@/components/ui";
import { api } from "@/lib/api";
import { plural } from "@/lib/format";
import { bogotaToday, logMeal } from "@/lib/meals";
import { disableMealReminders, enableMealReminders, reminderIds } from "@/lib/reminders";
import { fonts, radius, space, useColors } from "@/lib/theme";
import type { MacroTotals, MealKey, PlanItem, SavedPlan } from "@/lib/types";
import { useCached } from "@/lib/useCached";

const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const WEEKDAYS_SHORT = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

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

const g = (n: number) => `${Math.round(n)} g`;

export default function PlanDetail() {
  const { id, note } = useLocalSearchParams<{ id: string; note?: string }>();
  const c = useColors();
  const plan = useCached<SavedPlan>(`/api/v1/me/plans/${id}`);
  const [reminders, setReminders] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [logged, setLogged] = useState<Set<number>>(new Set());
  const [dayIdx, setDayIdx] = useState(0);
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

  const trainingDays = p?.kind === "training" ? p.data.days : [];
  const day = trainingDays[Math.min(dayIdx, Math.max(trainingDays.length - 1, 0))];

  const toggleLabel = p?.active ? "Pausar este plan" : "Volver a usar este plan";
  const footer = !p ? undefined : p.kind === "training" ? (
    <>
      <Button label={p.active ? "Pausar" : "Volver a usar"} variant="secondary" icon={p.active ? PauseIcon : undefined} onPress={() => void setActive(!p.active)} style={{ flex: 1 }} size="lg" />
      {day ? (
        <Button
          label={`Empezar ${WEEKDAYS[day.weekday]?.toLowerCase() ?? ""}`}
          icon={PlayIcon}
          size="lg"
          onPress={() => router.push({ pathname: "/workout", params: { planId: p.id, weekday: String(day.weekday) } })}
          style={{ flex: 1.5 }}
        />
      ) : null}
    </>
  ) : (
    <>
      <Button label="Borrar" variant="danger" size="lg" onPress={() => void remove()} style={{ flex: 1 }} />
      <Button label={toggleLabel} variant={p.active ? "secondary" : "primary"} size="lg" onPress={() => void setActive(!p.active)} style={{ flex: 2 }} />
    </>
  );

  return (
    <Screen edges={["bottom"]} footer={footer}>
      <Stack.Screen options={{ title: p?.title ?? "Plan" }} />
      {plan.error && !p ? <Notice tone="danger">{plan.error}</Notice> : null}
      {!p ? <Loading /> : null}
      {notice ? <Notice tone="warn">{notice}</Notice> : null}
      {note ? <Notice tone="info">{note}</Notice> : null}

      {p ? (
        <Rise>
          <Card style={{ gap: space.lg }}>
            <View style={{ flexDirection: "row", gap: space.sm, flexWrap: "wrap" }}>
              {p.data.engine === "ai" ? (
                <Chip tone="info" icon={SparkleIcon} label="Con IA · 1 crédito" />
              ) : (
                <Chip tone="neutral" icon={LightningIcon} label="Automático · gratis" />
              )}
              {!p.active ? <Chip tone="neutral" icon={PauseIcon} label="Pausado" /> : null}
            </View>
            {p.kind === "meals" ? <MealSummary totals={p.data.totals} targets={p.data.targets} /> : null}
            {p.kind === "training" ? (
              <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.xl }}>
                <View style={{ gap: 2 }}>
                  <Ticker value={p.data.days.length} size={48} />
                  <Txt muted size={13}>{p.data.days.length === 1 ? "día por semana" : "días por semana"}</Txt>
                </View>
                <View style={{ gap: 2, paddingBottom: 2 }}>
                  <Num size={22}>{p.data.days.reduce((a, d) => a + d.exercises.length, 0)}</Num>
                  <Txt muted size={13}>ejercicios en total</Txt>
                </View>
              </View>
            ) : null}
          </Card>
        </Rise>
      ) : null}

      {p?.kind === "meals" ? (
        <>
          <Rise delay={50}>
            <Section>Tu día</Section>
            <View>
              {p.data.meals.map((m, mi) => (
                <TimelineMeal
                  key={`${m.time}-${m.name}`}
                  time={hour12(m.time)}
                  name={m.name}
                  totals={m}
                  last={mi === p.data.meals.length - 1}
                  items={m.items}
                  logged={logged.has(mi)}
                  onLog={() => void logPlanMeal(mi)}
                />
              ))}
            </View>
            <View
              accessible
              accessibilityLabel={`Total del día: ${Math.round(p.data.totals.kcal)} kilocalorías`}
              style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.md, marginTop: space.sm, paddingHorizontal: space.lg, paddingVertical: space.md, borderRadius: radius.row, backgroundColor: c.brandMuted }}>
              <Txt weight="semi" style={{ color: c.brandInk }}>Total del día</Txt>
              <Text style={{ fontFamily: fonts.display, fontSize: 20, color: c.brandInk, fontVariant: ["tabular-nums"] }}>
                {Math.round(p.data.totals.kcal).toLocaleString("es-CO")}
                <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13 }}> kcal</Text>
              </Text>
            </View>
          </Rise>
          <Rise delay={100}>
            <Card style={{ flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.lg }}>
              <IconTile icon={BellIcon} tone="wash" />
              <Txt style={{ flex: 1 }}>Recordarme cada comida a su hora</Txt>
              <Switch value={reminders} onValueChange={(v) => void toggleReminders(v)} trackColor={{ true: c.brand, false: c.lineStrong }} thumbColor={c.card} accessibilityLabel="Recordarme cada comida" />
            </Card>
          </Rise>
        </>
      ) : null}

      {p?.kind === "training" ? (
        <Rise delay={50}>
          <Section>Tu semana</Section>
          {trainingDays.length > 1 ? (
            <View accessibilityRole="tablist" style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginBottom: space.md }}>
              {trainingDays.map((d, i) => {
                const on = d === day;
                return (
                  <Press
                    key={d.weekday}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${WEEKDAYS[d.weekday]}: ${d.title}`}
                    onPress={() => setDayIdx(i)}
                    style={{ minHeight: 40, paddingHorizontal: 16, justifyContent: "center", borderRadius: radius.pill, backgroundColor: on ? c.brandMuted : c.muted }}>
                    <Text style={{ fontFamily: on ? fonts.bodySemi : fonts.bodyMedium, fontSize: 14, color: on ? c.brandInk : c.inkMuted }}>{WEEKDAYS_SHORT[d.weekday]}</Text>
                  </Press>
                );
              })}
            </View>
          ) : null}
          {day ? (
            <Card style={{ gap: space.md }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                <IconTile icon={BarbellIcon} tone="wash" />
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt muted size={13}>{WEEKDAYS[day.weekday]}</Txt>
                  <Txt weight="semi" size={17}>{day.title}</Txt>
                </View>
              </View>
              <View style={{ gap: space.sm }}>
                {day.exercises.map((e, k) => (
                  <View key={k} style={{ flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: c.muted, borderRadius: radius.row, paddingHorizontal: space.md, paddingVertical: 10 }}>
                    <Num size={15} style={{ width: 20, color: c.inkFaint }}>{k + 1}</Num>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Txt size={14.5} weight="medium">{e.name}</Txt>
                      <Txt muted size={13}>
                        {plural(e.sets, "serie", "series")} de {e.reps}{e.rest_seconds ? ` · ${e.rest_seconds} s de descanso` : ""}
                      </Txt>
                    </View>
                  </View>
                ))}
              </View>
            </Card>
          ) : null}
        </Rise>
      ) : null}

      {p?.data.notes ? (
        <Rise delay={150}>
          <Section>Indicaciones</Section>
          <Card tone="muted">
            <Txt muted size={14}>{p.data.notes}</Txt>
          </Card>
        </Rise>
      ) : null}

      {p ? (
        <View style={{ gap: space.md, marginTop: space.xl }}>
          {p.kind === "training" ? <Button label="Borrar plan" variant="danger" onPress={() => void remove()} /> : null}
          <Txt faint size={12}>Orientación general. Ajusta el plan si sientes dolor o malestar y consulta a un profesional si tienes una condición de salud.</Txt>
        </View>
      ) : null}
    </Screen>
  );
}

function MealSummary({ totals, targets }: { totals: MacroTotals; targets: { kcal: number; protein_g: number; carbs_g: number; fat_g: number } | null }) {
  const c = useColors();
  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.xl }}>
        <View style={{ gap: 2 }}>
          <Ticker value={totals.kcal} size={48} />
          <Txt muted size={13}>kcal al día</Txt>
        </View>
        <View style={{ gap: 2, paddingBottom: 2 }}>
          <Num size={24} style={{ color: c.protein }}>{g(totals.protein_g)}</Num>
          <Txt muted size={13}>de proteína</Txt>
        </View>
      </View>
      {targets ? (
        <View style={{ gap: space.md }}>
          <Meter label="Calorías" value={totals.kcal} target={targets.kcal} unit="kcal" />
          <Meter label="Proteína" value={totals.protein_g} target={targets.protein_g} unit="g" color={c.protein} />
          <Meter label="Carbohidratos" value={totals.carbs_g} target={targets.carbs_g} unit="g" color={c.carbs} />
          <Meter label="Grasa" value={totals.fat_g} target={targets.fat_g} unit="g" color={c.fat} />
        </View>
      ) : (
        <View style={{ flexDirection: "row", gap: space.lg }}>
          <Txt muted size={13}>Carbos {g(totals.carbs_g)}</Txt>
          <Txt muted size={13}>Grasa {g(totals.fat_g)}</Txt>
        </View>
      )}
    </>
  );
}

/** Barra apilada de macros por energía (proteína y carbos 4 kcal/g, grasa 9). */
function MacroStack({ protein, carbs, fat }: { protein: number; carbs: number; fat: number }) {
  const c = useColors();
  const parts = [
    { v: protein * 4, color: c.protein },
    { v: carbs * 4, color: c.carbs },
    { v: fat * 9, color: c.fat },
  ];
  const sum = parts.reduce((a, x) => a + x.v, 0);
  if (sum <= 0) return null;
  return (
    <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{ flexDirection: "row", height: 6, borderRadius: 3, overflow: "hidden", backgroundColor: c.muted, gap: 2 }}>
      {parts.map((x, i) => (x.v > 0 ? <View key={i} style={{ flex: x.v / sum, backgroundColor: x.color }} /> : null))}
    </View>
  );
}

function TimelineMeal({
  time,
  name,
  totals,
  items,
  last,
  logged,
  onLog,
}: {
  time: string;
  name: string;
  totals: MacroTotals;
  items: PlanItem[];
  last: boolean;
  logged: boolean;
  onLog: () => void;
}) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", gap: space.md }}>
      <View style={{ width: 14, alignItems: "center" }}>
        <View style={{ width: 2, height: 22, backgroundColor: c.line }} />
        <View style={{ width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: logged ? c.ok : c.brand, backgroundColor: logged ? c.ok : c.card }} />
        {!last ? <View style={{ flex: 1, width: 2, backgroundColor: c.line }} /> : null}
      </View>
      <View style={{ flex: 1, paddingBottom: last ? 0 : space.md }}>
        <Txt faint size={12.5} weight="semi" style={{ marginTop: 18, marginBottom: 6, fontVariant: ["tabular-nums"] }}>{time}</Txt>
        <Card style={{ gap: space.md }}>
          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: space.sm }}>
              <Txt weight="semi" size={16} style={{ flex: 1 }}>{name}</Txt>
              <Text style={{ fontFamily: fonts.display, fontSize: 17, color: c.ink, fontVariant: ["tabular-nums"] }}>
                {Math.round(totals.kcal).toLocaleString("es-CO")}
                <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 12.5, color: c.inkMuted }}> kcal</Text>
              </Text>
            </View>
            <MacroStack protein={totals.protein_g} carbs={totals.carbs_g} fat={totals.fat_g} />
            <Txt muted size={12.5} style={{ fontVariant: ["tabular-nums"] }}>
              Proteína {g(totals.protein_g)} · Carbos {g(totals.carbs_g)} · Grasa {g(totals.fat_g)}
            </Txt>
          </View>
          <View style={{ gap: 6 }}>
            {items.map((i, k) => {
              const FoodIcon = foodIcon(i.food);
              return (
                <View key={k} style={{ flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: c.muted, borderRadius: radius.row, paddingHorizontal: 10, paddingVertical: 8 }}>
                  <View style={{ width: 32, height: 32, borderRadius: radius.md, backgroundColor: c.card, alignItems: "center", justifyContent: "center" }}>
                    <FoodIcon size={17} color={c.inkMuted} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Txt size={14} weight="medium" numberOfLines={2}>{i.food}</Txt>
                    <Txt muted size={12.5}>{i.portion ?? `${Math.round(i.grams)} g`}</Txt>
                  </View>
                  <Txt muted size={13} style={{ fontVariant: ["tabular-nums"] }}>{Math.round(i.kcal)} kcal</Txt>
                </View>
              );
            })}
          </View>
          <Press
            accessibilityRole="button"
            accessibilityState={{ disabled: logged }}
            disabled={logged}
            onPress={onLog}
            style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start" }}>
            {logged ? <CheckCircleIcon size={18} color={c.ok} weight="fill" /> : <ForkKnifeIcon size={18} color={c.brandInk} weight="bold" />}
            <Txt weight="semi" size={14} style={{ color: logged ? c.ok : c.brandInk }}>
              {logged ? "Registrado hoy" : "Lo comí: registrarlo hoy"}
            </Txt>
          </Press>
        </Card>
      </View>
    </View>
  );
}
