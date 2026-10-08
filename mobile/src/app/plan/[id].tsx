import { router, Stack, useLocalSearchParams } from "expo-router";
import { BellIcon, PlayIcon } from "phosphor-react-native";
import { useEffect, useState } from "react";
import { Alert, Platform, Switch, View } from "react-native";

import { Button, Card, Loading, Notice, Num, Screen, Section, Txt } from "@/components/ui";
import { api } from "@/lib/api";
import { plural } from "@/lib/format";
import { disableMealReminders, enableMealReminders, reminderIds } from "@/lib/reminders";
import { space, useColors } from "@/lib/theme";
import type { SavedPlan } from "@/lib/types";
import { useCached } from "@/lib/useCached";

const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

function hour12(t: string) {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "p. m." : "a. m."}`;
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
  const { id } = useLocalSearchParams<{ id: string }>();
  const c = useColors();
  const plan = useCached<SavedPlan>(`/api/v1/me/plans/${id}`);
  const [reminders, setReminders] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
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
    else setNotice(r === "denied" ? "Activa las notificaciones de FitConnect en los ajustes del celular." : "Los recordatorios funcionan en la app instalada en el celular.");
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

      {p?.kind === "meals" ? (
        <>
          <Card style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" }}>
            <View>
              <Txt muted size={13}>Total del día</Txt>
              <Num size={34}>{p.data.total_kcal} kcal</Num>
            </View>
            <Txt muted size={14}>{p.data.total_protein_g} g proteína</Txt>
          </Card>
          <Section>Tu día</Section>
          <View style={{ gap: space.sm }}>
            {p.data.meals.map((m) => (
              <View key={`${m.time}-${m.name}`} style={{ flexDirection: "row", gap: space.md }}>
                <View style={{ width: 74, paddingTop: space.lg }}>
                  <Txt weight="semi" size={14}>{hour12(m.time)}</Txt>
                </View>
                <Card style={{ flex: 1, gap: 6 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Txt weight="semi">{m.name}</Txt>
                    <Txt weight="semi">{m.kcal} kcal</Txt>
                  </View>
                  {m.items.map((i, k) => (
                    <Txt key={k} muted size={14}>
                      {i.food} · {i.amount}
                    </Txt>
                  ))}
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
