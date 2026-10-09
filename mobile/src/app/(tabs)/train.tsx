import { router, useFocusEffect } from "expo-router";
import { BarbellIcon, CaretRightIcon, CloudArrowUpIcon, PlayIcon, PlusIcon, TrophyIcon } from "phosphor-react-native";
import { useCallback, useState } from "react";
import { View } from "react-native";

import { Button, Card, Chip, Empty, IconTile, ListRow, Notice, Num, Press, Rise, Screen, Section, Title, Txt } from "@/components/ui";
import { formatDateTime, plural } from "@/lib/format";
import { useSession } from "@/lib/session";
import { fonts, radius, space, useColors } from "@/lib/theme";
import type { ProgressItem, Routine, Workout } from "@/lib/types";
import { useCached } from "@/lib/useCached";
import { pendingWorkouts, syncWorkouts } from "@/lib/workouts";

type Day = Routine["days"][number];

function Bars({ series }: { series: { kg: number }[] }) {
  const c = useColors();
  const last = series.slice(-8);
  const max = Math.max(...last.map((s) => s.kg), 1);
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-end", gap: 3, height: 30 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {last.map((s, i) => (
        <View
          key={i}
          style={{ width: 6, height: Math.max(4, (s.kg / max) * 30), borderRadius: 2, backgroundColor: i === last.length - 1 ? c.brand : c.lineStrong }}
        />
      ))}
    </View>
  );
}

function dayName(d: Day) {
  return d.title || `Día ${d.day_index + 1}`;
}

function exercisePreview(d: Day) {
  const names = d.exercises.map((e) => e.exercise_name);
  if (!names.length) return "Sin ejercicios todavía";
  const head = names.slice(0, 3).join(", ");
  return names.length > 3 ? `${head} y ${names.length - 3} más` : head;
}

/** El día que sigue al último registrado de esta rutina; si no hay, el primero con ejercicios. */
function suggestedDay(r: Routine, history: Workout[]): { day: Day | undefined; fromHistory: boolean } {
  const days = [...r.days].sort((a, b) => a.day_index - b.day_index);
  const usable = days.filter((d) => d.exercises.length);
  if (!usable.length) return { day: undefined, fromHistory: false };
  const last = history
    .filter((w) => w.source === "gym_routine" && w.routine_ref?.routine_id === r.id && typeof w.routine_ref?.day_index === "number")
    .sort((a, b) => b.started_at.localeCompare(a.started_at))[0];
  if (!last) return { day: usable[0], fromHistory: false };
  const lastIndex = last.routine_ref!.day_index as number;
  const next = usable.find((d) => d.day_index > lastIndex) ?? usable[0];
  return { day: next, fromHistory: true };
}

function duration(w: Workout): string | null {
  if (!w.ended_at) return null;
  const min = Math.round((new Date(w.ended_at).getTime() - new Date(w.started_at).getTime()) / 60_000);
  if (!Number.isFinite(min) || min <= 0) return null;
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

const fmtKg = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");

const start = (d: Day) => router.push({ pathname: "/workout", params: { day: String(d.day_index) } });

export default function Train() {
  const c = useColors();
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
  const next = r ? suggestedDay(r, items) : { day: undefined, fromHistory: false };
  const others = r ? [...r.days].sort((a, b) => a.day_index - b.day_index).filter((d) => d.id !== next.day?.id) : [];
  const records = (progress.data ?? []).filter((p) => p.best_kg).slice(0, 5);

  return (
    <Screen refreshing={history.loading && Boolean(history.data)} onRefresh={() => { void history.reload(); void progress.reload(); void routine.reload(); }}>
      <Title sub="Registra series y pesos; se guarda aunque no tengas señal.">Entrenar</Title>

      {pending.length ? (
        <Notice tone="info" icon={CloudArrowUpIcon}>
          {plural(pending.length, "entreno guardado en el celular", "entrenos guardados en el celular")}. Se suben solos cuando vuelva la señal.
        </Notice>
      ) : null}

      {r ? (
        <Rise>
          <Card style={{ gap: space.lg, padding: space.xl }}>
            <View style={{ gap: 6 }}>
              <Txt muted size={13} weight="medium">Rutina de tu entrenador</Txt>
              <Txt size={22} style={{ fontFamily: fonts.display, lineHeight: 27, letterSpacing: -0.3 }}>{r.name}</Txt>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm, marginTop: 2 }}>
                <Chip tone="neutral" icon={BarbellIcon} label={plural(r.days.length, "día", "días")} />
                {r.goal_label ? <Chip tone="neutral" label={r.goal_label} /> : null}
                {r.level_es ? <Chip tone="neutral" label={r.level_es} /> : null}
              </View>
            </View>

            {next.day ? (
              <View style={{ backgroundColor: c.brandMuted, borderRadius: radius.row, padding: space.lg, gap: space.md }}>
                <View style={{ gap: 4 }}>
                  <Txt size={13} weight="semi" style={{ color: c.brandInk }}>{next.fromHistory ? "Sigue en tu rutina" : "Para empezar"}</Txt>
                  <Txt size={18} weight="semi">{dayName(next.day)}</Txt>
                  <Txt size={13.5} muted numberOfLines={2}>
                    {plural(next.day.exercises.length, "ejercicio", "ejercicios")} · {exercisePreview(next.day)}
                  </Txt>
                </View>
                <Button label="Empezar entrenamiento" icon={PlayIcon} size="lg" onPress={() => start(next.day!)} />
              </View>
            ) : (
              <Txt muted size={14}>Tu entrenador todavía no agrega ejercicios a esta rutina.</Txt>
            )}

            {others.length ? (
              <View style={{ gap: space.sm }}>
                {others.map((d) => {
                  const empty = !d.exercises.length;
                  return (
                    <Press
                      key={d.id}
                      accessibilityRole="button"
                      accessibilityLabel={`Empezar ${dayName(d)}`}
                      accessibilityState={{ disabled: empty }}
                      disabled={empty}
                      onPress={() => start(d)}
                      scaleTo={0.985}
                      style={{ flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: c.muted, borderRadius: radius.row, paddingHorizontal: space.md, paddingVertical: space.md, minHeight: 60, opacity: empty ? 0.6 : 1 }}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Txt weight="semi">{dayName(d)}</Txt>
                        <Txt muted size={13} numberOfLines={1}>
                          {empty ? "Sin ejercicios todavía" : `${plural(d.exercises.length, "ejercicio", "ejercicios")} · ${exercisePreview(d)}`}
                        </Txt>
                      </View>
                      {empty ? null : <PlayIcon size={18} color={c.inkMuted} weight="bold" />}
                    </Press>
                  );
                })}
              </View>
            ) : null}
          </Card>
          <Card style={{ marginTop: space.md, paddingVertical: space.xs }}>
            <ListRow
              icon={PlusIcon}
              title="Registrar entreno libre"
              detail="Elige ejercicios del catálogo y anota tus series"
              onPress={() => router.push("/workout")}
              right={<CaretRightIcon size={18} color={c.inkFaint} weight="bold" />}
              last
            />
          </Card>
        </Rise>
      ) : (
        <Rise>
          <Empty
            icon={BarbellIcon}
            title={usable ? "Tu entrenador aún no te asigna rutina" : "Arma tu entreno"}
            action={<Button label="Empezar entreno libre" icon={PlayIcon} size="lg" onPress={() => router.push("/workout")} style={{ alignSelf: "stretch", marginTop: space.sm }} />}>
            Elige ejercicios del catálogo y anota series, repeticiones y peso.
          </Empty>
        </Rise>
      )}

      {records.length ? (
        <Rise delay={50}>
          <Section>Tu progreso</Section>
          <Card style={{ paddingVertical: space.xs }}>
            {records.map((p, i) => (
              <View
                key={p.exercise_id ?? p.exercise_name}
                accessible
                accessibilityLabel={`${p.exercise_name}: mejor marca ${fmtKg(p.best_kg!)} kilos en ${plural(p.sessions, "sesión", "sesiones")}${p.last_kg ? `; la última, ${fmtKg(p.last_kg)} kilos` : ""}`}
                style={{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 68, paddingVertical: 10, borderBottomWidth: i === records.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
                <IconTile icon={TrophyIcon} tone="wash" />
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt weight="semi" numberOfLines={1}>{p.exercise_name}</Txt>
                  <Txt muted size={13} numberOfLines={1}>
                    {plural(p.sessions, "sesión", "sesiones")}
                    {p.last_kg ? ` · última ${fmtKg(p.last_kg)} kg` : ""}
                  </Txt>
                </View>
                {p.series.length > 1 ? <Bars series={p.series} /> : null}
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 3, minWidth: 64, justifyContent: "flex-end" }}>
                  <Num size={26} style={{ color: c.brandInk }}>{fmtKg(p.best_kg!)}</Num>
                  <Txt muted size={13} weight="medium">kg</Txt>
                </View>
              </View>
            ))}
          </Card>
        </Rise>
      ) : null}

      <Rise delay={100}>
        <Section>Últimos entrenos</Section>
        {items.length ? (
          <Card style={{ paddingVertical: space.xs }}>
            {items.map((w, i) => {
              const sets = w.entries.reduce((a, e) => a + e.sets.length, 0);
              const dur = duration(w);
              const queued = pending.some((p) => p.id === w.id);
              return (
                <View
                  key={w.id}
                  style={{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 64, paddingVertical: 10, borderBottomWidth: i === items.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt weight="semi" numberOfLines={2}>{w.title}</Txt>
                    <Txt muted size={13} style={{ fontVariant: ["tabular-nums"] }}>
                      {formatDateTime(w.started_at)} · {plural(w.entries.length, "ejercicio", "ejercicios")} · {plural(sets, "serie", "series")}
                    </Txt>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 4 }}>
                    {dur ? <Chip tone="neutral" label={dur} /> : null}
                    {queued ? <Chip tone="info" icon={CloudArrowUpIcon} label="Por subir" /> : null}
                  </View>
                </View>
              );
            })}
          </Card>
        ) : (
          <Txt muted size={14}>Todavía no hay entrenos registrados.</Txt>
        )}
      </Rise>
    </Screen>
  );
}
