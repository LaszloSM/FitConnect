import { router, useFocusEffect } from "expo-router";
import { CloudArrowUpIcon, PlayIcon } from "phosphor-react-native";
import { useCallback, useState } from "react";
import { View } from "react-native";

import { Button, Card, Empty, Notice, Num, Screen, Section, Title, Txt } from "@/components/ui";
import { formatDateTime, plural } from "@/lib/format";
import { useSession } from "@/lib/session";
import { space, useColors } from "@/lib/theme";
import type { ProgressItem, Routine, Workout } from "@/lib/types";
import { useCached } from "@/lib/useCached";
import { pendingWorkouts, syncWorkouts } from "@/lib/workouts";

function Bars({ series }: { series: { kg: number }[] }) {
  const c = useColors();
  const max = Math.max(...series.map((s) => s.kg), 1);
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3, height: 28 }} accessibilityElementsHidden>
      {series.map((s, i) => (
        <View
          key={i}
          style={{ width: 6, height: Math.max(4, (s.kg / max) * 28), borderRadius: 2, backgroundColor: i === series.length - 1 ? c.brand : c.line }}
        />
      ))}
    </View>
  );
}

export default function Train() {
  const { gym } = useSession();
  const usable = gym?.app_enabled ? gym : null;
  const routine = useCached<{ routine: Routine | null }>(usable ? `/api/v1/me/gyms/${usable.link_id}/routine` : null);
  const history = useCached<Workout[]>("/api/v1/me/workouts?limit=10");
  const progress = useCached<ProgressItem[]>("/api/v1/me/progress");
  const [pending, setPending] = useState<Workout[]>([]);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        setPending(await syncWorkouts().catch(() => pendingWorkouts()));
        void history.reload();
        void progress.reload();
      })();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  const r = routine.data?.routine;
  const items = [...pending, ...(history.data ?? []).filter((w) => !pending.some((p) => p.id === w.id))].slice(0, 10);

  return (
    <Screen refreshing={history.loading && Boolean(history.data)} onRefresh={() => { void history.reload(); void progress.reload(); void routine.reload(); }}>
      <Title sub="Registra series y pesos; se guarda aunque no tengas señal">Entrenar</Title>

      {pending.length ? (
        <Notice tone="info" icon={CloudArrowUpIcon}>
          {plural(pending.length, "entreno guardado en el celular", "entrenos guardados en el celular")}. Se suben solos cuando vuelva la señal.
        </Notice>
      ) : null}

      {r ? (
        <Card style={{ gap: space.md }}>
          <View style={{ gap: 2 }}>
            <Txt muted size={13}>Rutina de tu entrenador</Txt>
            <Txt weight="semi" size={18}>{r.name}</Txt>
            <Txt muted size={13}>{[r.goal_label, r.level_es].filter(Boolean).join(" · ")}</Txt>
          </View>
          {r.days.map((d, i) => (
            <View key={d.id} style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
              <View style={{ flex: 1 }}>
                <Txt weight="medium">{d.title || `Día ${d.day_index + 1}`}</Txt>
                <Txt muted size={13}>{plural(d.exercises.length, "ejercicio", "ejercicios")}</Txt>
              </View>
              <Button
                label="Empezar"
                variant={i === 0 ? "primary" : "secondary"}
                icon={PlayIcon}
                onPress={() => router.push({ pathname: "/workout", params: { day: String(d.day_index) } })}
                disabled={!d.exercises.length}
                style={{ minHeight: 44, paddingHorizontal: space.lg }}
              />
            </View>
          ))}
          <Button label="Entreno libre" variant="ghost" onPress={() => router.push("/workout")} />
        </Card>
      ) : (
        <Empty
          title={usable ? "Tu entrenador aún no te asigna rutina" : "Arma tu entreno"}
          action={<Button label="Empezar entreno libre" icon={PlayIcon} onPress={() => router.push("/workout")} style={{ alignSelf: "stretch", marginTop: space.sm }} />}>
          Elige ejercicios del catálogo y anota series, repeticiones y peso.
        </Empty>
      )}

      {progress.data?.some((p) => p.best_kg) ? (
        <>
          <Section>Tu progreso</Section>
          <Card style={{ gap: space.md }}>
            {progress.data
              .filter((p) => p.best_kg)
              .slice(0, 5)
              .map((p) => (
                <View key={p.exercise_id ?? p.exercise_name} style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                  <View style={{ flex: 1 }}>
                    <Txt weight="medium" numberOfLines={1}>{p.exercise_name}</Txt>
                    <Txt muted size={13}>Mejor marca · {plural(p.sessions, "sesión", "sesiones")}</Txt>
                  </View>
                  <Bars series={p.series} />
                  <Num size={22} style={{ minWidth: 64, textAlign: "right" }}>{p.best_kg} kg</Num>
                </View>
              ))}
          </Card>
        </>
      ) : null}

      <Section>Últimos entrenos</Section>
      {items.length ? (
        <Card style={{ gap: space.md }}>
          {items.map((w) => (
            <View key={w.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md }}>
              <View style={{ flex: 1 }}>
                <Txt weight="medium">{w.title}</Txt>
                <Txt muted size={13}>
                  {formatDateTime(w.started_at)} · {plural(w.entries.length, "ejercicio", "ejercicios")}
                </Txt>
              </View>
              {pending.some((p) => p.id === w.id) ? <Txt muted size={13}>Por subir</Txt> : null}
            </View>
          ))}
        </Card>
      ) : (
        <Txt muted size={14}>Todavía no hay entrenos registrados.</Txt>
      )}
    </Screen>
  );
}
