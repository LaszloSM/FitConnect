import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { BarbellIcon, CheckIcon, PlusIcon, TrashIcon } from "phosphor-react-native";
import { useEffect, useRef, useState } from "react";
import { Platform, TextInput, View } from "react-native";

import { Button, Card, Field, IconButton, ListRow, Notice, Num, Press, Rise, Screen, Txt } from "@/components/ui";
import { api } from "@/lib/api";
import { plural } from "@/lib/format";
import { useSession } from "@/lib/session";
import { cache } from "@/lib/storage";
import { fonts, radius, space, useColors } from "@/lib/theme";
import type { Routine, SavedPlan, Workout, WorkoutEntry } from "@/lib/types";
import { saveWorkout } from "@/lib/workouts";

const DRAFT = "q:draft-workout";

interface Exercise {
  id: string;
  name_es: string;
}

function emptySets(n: number, reps: string): WorkoutEntry["sets"] {
  const r = parseInt(reps, 10);
  return Array.from({ length: Math.max(1, n) }, () => ({ reps: Number.isFinite(r) ? r : null, weight_kg: null, done: false }));
}

function NumInput({ value, onChange, label }: { value: number | null; onChange: (v: number | null) => void; label: string }) {
  const c = useColors();
  const [focus, setFocus] = useState(false);
  return (
    <TextInput
      accessibilityLabel={label}
      value={value === null ? "" : String(value)}
      onChangeText={(t) => {
        const v = t.replace(",", ".").replace(/[^\d.]/g, "");
        onChange(v === "" ? null : Number(v));
      }}
      onFocus={() => setFocus(true)}
      onBlur={() => setFocus(false)}
      keyboardType="decimal-pad"
      selectTextOnFocus
      placeholder="0"
      placeholderTextColor={c.inkFaint}
      style={{
        flex: 1,
        minWidth: 0,
        height: 48,
        borderRadius: radius.md,
        borderWidth: focus ? 1.5 : 1,
        borderColor: focus ? c.brand : c.lineStrong,
        backgroundColor: c.field,
        textAlign: "center",
        fontFamily: fonts.display,
        fontSize: 20,
        color: c.ink,
        fontVariant: ["tabular-nums"],
        padding: 0,
      }}
    />
  );
}

/** Tiempo desde que empezó el entreno; se cuenta en su propio componente para no redibujar los campos cada segundo. */
function Elapsed({ since }: { since: string }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const total = Math.max(0, Math.floor((now - new Date(since).getTime()) / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return <Num size={30}>{h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`}</Num>;
}

const COLS = { num: 32, check: 52 };

export default function WorkoutScreen() {
  const { day, planId, weekday } = useLocalSearchParams<{ day?: string; planId?: string; weekday?: string }>();
  const { gym } = useSession();
  const c = useColors();
  const [workout, setWorkout] = useState<Workout | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Exercise[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  // Arranca desde el borrador (si la app se cerró a mitad) o desde la rutina del día.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      const draft = await AsyncStorage.getItem(DRAFT);
      if (draft) {
        setWorkout(JSON.parse(draft));
        return;
      }
      let entries: WorkoutEntry[] = [];
      let title = "Entreno libre";
      let routineRef: Workout["routine_ref"] = null;
      if (planId && weekday !== undefined) {
        const saved = await cache.get<SavedPlan>(`/api/v1/me/plans/${planId}`);
        const p = saved?.value;
        const d = p?.kind === "training" ? p.data.days.find((x) => String(x.weekday) === weekday) : undefined;
        if (p && d) {
          title = `${p.title} · ${d.title}`;
          routineRef = { plan_id: p.id, weekday: d.weekday };
          entries = d.exercises.map((e) => ({ exercise_id: null, exercise_name: e.name, sets: emptySets(e.sets, e.reps) }));
        }
      } else if (day !== undefined && gym) {
        const saved = await cache.get<{ routine: Routine | null }>(`/api/v1/me/gyms/${gym.link_id}/routine`);
        const r = saved?.value.routine;
        const d = r?.days.find((x) => String(x.day_index) === day);
        if (r && d) {
          title = `${r.name} · ${d.title || `Día ${d.day_index + 1}`}`;
          routineRef = { link_id: gym.link_id, routine_id: r.id, day_index: d.day_index };
          entries = d.exercises.map((e) => ({ exercise_id: e.exercise_id, exercise_name: e.exercise_name, sets: emptySets(e.sets, e.reps) }));
        }
      }
      setWorkout({
        id: Crypto.randomUUID(),
        title,
        started_at: new Date().toISOString(),
        ended_at: null,
        source: routineRef && !planId ? "gym_routine" : "free",
        routine_ref: routineRef,
        entries,
        notes: null,
      });
    })();
  }, [day, gym, planId, weekday]);

  useEffect(() => {
    if (workout) void AsyncStorage.setItem(DRAFT, JSON.stringify(workout));
  }, [workout]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      return;
    }
    const t = setTimeout(() => {
      api<Exercise[]>(`/api/v1/me/exercises?q=${encodeURIComponent(q)}&limit=8`).then(setResults).catch(() => setResults([]));
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  if (!workout) return <Screen edges={[]}><Txt muted>Preparando…</Txt></Screen>;

  const update = (fn: (entries: WorkoutEntry[]) => WorkoutEntry[]) => setWorkout({ ...workout, entries: fn(workout.entries) });
  const setSet = (ei: number, si: number, patch: Partial<WorkoutEntry["sets"][number]>) =>
    update((es) => es.map((e, i) => (i !== ei ? e : { ...e, sets: e.sets.map((s, j) => (j === si ? { ...s, ...patch } : s)) })));

  const add = (name: string, id: string | null) => {
    update((es) => [...es, { exercise_id: id, exercise_name: name, sets: emptySets(3, "10") }]);
    setQuery("");
    setResults([]);
  };

  const finish = async () => {
    const entries = workout.entries
      .map((e) => ({ ...e, sets: e.sets.filter((s) => s.done || s.reps || s.weight_kg) }))
      .filter((e) => e.sets.length);
    if (!entries.length) {
      setError("Marca al menos una serie para guardar el entreno.");
      return;
    }
    setSaving(true);
    const result = await saveWorkout({ ...workout, entries, ended_at: new Date().toISOString() });
    await AsyncStorage.removeItem(DRAFT);
    setSaving(false);
    if (result === "queued") setError(null);
    router.back();
  };

  const discard = async () => {
    await AsyncStorage.removeItem(DRAFT);
    router.back();
  };

  const totalSets = workout.entries.reduce((a, e) => a + e.sets.length, 0);
  const doneSets = workout.entries.reduce((a, e) => a + e.sets.filter((s) => s.done).length, 0);

  return (
    <Screen
      edges={["bottom"]}
      footer={
        <>
          <Button label="Descartar" variant="ghost" onPress={discard} size="lg" style={{ paddingHorizontal: space.md }} />
          <Button label="Terminar y guardar" icon={CheckIcon} onPress={finish} loading={saving} size="lg" style={{ flex: 1 }} />
        </>
      }>
      <Rise>
        <Txt size={22} style={{ fontFamily: fonts.display, lineHeight: 27, letterSpacing: -0.3, marginBottom: space.md }}>{workout.title}</Txt>
        <Card tone="muted" style={{ flexDirection: "row", gap: space.lg, marginBottom: space.lg }}>
          <View style={{ flex: 1, gap: 2 }} accessible accessibilityLabel="Tiempo de entreno">
            <Txt muted size={13} weight="medium">Tiempo</Txt>
            <Elapsed since={workout.started_at} />
          </View>
          <View style={{ width: 1, backgroundColor: c.line }} />
          <View style={{ flex: 1, gap: 2 }} accessible accessibilityLabel={`${doneSets} de ${totalSets} series hechas`}>
            <Txt muted size={13} weight="medium">Series hechas</Txt>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
              <Num size={30} style={{ color: doneSets ? c.brandInk : c.ink }}>{doneSets}</Num>
              <Txt muted size={15} style={{ fontVariant: ["tabular-nums"] }}>de {totalSets}</Txt>
            </View>
          </View>
        </Card>
      </Rise>

      {error ? <Notice tone="warn">{error}</Notice> : null}

      <View style={{ gap: space.md }}>
        {workout.entries.length ? null : (
          <Card style={{ gap: 4 }}>
            <Txt weight="semi" size={16}>Agrega tu primer ejercicio</Txt>
            <Txt muted size={14}>Búscalo abajo y anota repeticiones y peso de cada serie.</Txt>
          </Card>
        )}
        {workout.entries.map((e, ei) => {
          const done = e.sets.filter((s) => s.done).length;
          return (
            <Rise key={`${e.exercise_name}-${ei}`} delay={Math.min(ei, 4) * 50}>
              <Card style={{ gap: space.sm }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm }}>
                  <View style={{ flex: 1, gap: 2 }}>
                    <Txt weight="semi" size={17}>{e.exercise_name}</Txt>
                    <Txt muted size={13} style={{ fontVariant: ["tabular-nums"] }}>{done} de {plural(e.sets.length, "serie", "series")}</Txt>
                  </View>
                  <IconButton icon={TrashIcon} tone="plain" label={`Quitar ${e.exercise_name}`} onPress={() => update((es) => es.filter((_, i) => i !== ei))} />
                </View>

                <View style={{ flexDirection: "row", alignItems: "center", gap: space.sm, paddingHorizontal: space.sm }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <Txt faint size={12} weight="medium" style={{ width: COLS.num, textAlign: "center" }}>Serie</Txt>
                  <Txt faint size={12} weight="medium" style={{ flex: 1, textAlign: "center" }}>Reps</Txt>
                  <Txt faint size={12} weight="medium" style={{ flex: 1, textAlign: "center" }}>Kg</Txt>
                  <View style={{ width: COLS.check }} />
                </View>

                {e.sets.map((s, si) => (
                  <View
                    key={si}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: space.sm,
                      backgroundColor: s.done ? c.okBg : c.muted,
                      borderRadius: radius.row,
                      padding: space.sm,
                    }}>
                    <View style={{ width: COLS.num, alignItems: "center" }}>
                      <Num size={18} style={{ color: s.done ? c.ok : c.inkMuted }}>{si + 1}</Num>
                    </View>
                    <NumInput label={`Repeticiones serie ${si + 1}`} value={s.reps} onChange={(v) => setSet(ei, si, { reps: v === null ? null : Math.round(v) })} />
                    <NumInput label={`Peso serie ${si + 1}`} value={s.weight_kg} onChange={(v) => setSet(ei, si, { weight_kg: v })} />
                    <Press
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: s.done }}
                      accessibilityLabel={`Serie ${si + 1} hecha`}
                      onPress={() => {
                        if (!s.done && Platform.OS !== "web") void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
                        setSet(ei, si, { done: !s.done });
                      }}
                      scaleTo={0.92}
                      hitSlop={4}
                      style={{
                        width: COLS.check,
                        height: 48,
                        borderRadius: radius.md,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: s.done ? c.ok : c.card,
                        borderWidth: s.done ? 0 : 1,
                        borderColor: c.lineStrong,
                      }}>
                      <CheckIcon size={22} color={s.done ? c.card : c.inkFaint} weight="bold" />
                    </Press>
                  </View>
                ))}

                <Press
                  accessibilityRole="button"
                  accessibilityLabel={`Agregar serie a ${e.exercise_name}`}
                  onPress={() => update((es) => es.map((x, i) => (i === ei ? { ...x, sets: [...x.sets, { ...(x.sets.at(-1) ?? { reps: null, weight_kg: null }), done: false }] } : x)))}
                  style={{ flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, alignSelf: "flex-start" }}>
                  <PlusIcon size={16} color={c.brandInk} weight="bold" />
                  <Txt size={14} weight="semi" style={{ color: c.brandInk }}>Agregar serie</Txt>
                </Press>
              </Card>
            </Rise>
          );
        })}
      </View>

      <View style={{ marginTop: space.xl }}>
        <Field label="Agregar ejercicio" value={query} onChangeText={setQuery} placeholder="Busca: sentadilla, press, remo…" />
        {results.length || query.trim().length >= 2 ? (
          <Card style={{ paddingVertical: space.xs }}>
            {results.map((r, i) => (
              <ListRow
                key={r.id}
                icon={BarbellIcon}
                title={r.name_es}
                accessibilityLabel={`Agregar ${r.name_es}`}
                onPress={() => add(r.name_es, r.id)}
                right={<PlusIcon size={18} color={c.brandInk} weight="bold" />}
                last={i === results.length - 1 && query.trim().length < 2}
              />
            ))}
            {query.trim().length >= 2 ? (
              <ListRow
                icon={PlusIcon}
                title={`Agregar «${query.trim()}» como ejercicio propio`}
                onPress={() => add(query.trim(), null)}
                last
              />
            ) : null}
          </Card>
        ) : null}
      </View>
    </Screen>
  );
}
