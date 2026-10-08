import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { router, useLocalSearchParams } from "expo-router";
import { CheckIcon, MagnifyingGlassIcon, PlusIcon, TrashIcon } from "phosphor-react-native";
import { useEffect, useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";

import { Button, Card, Field, Notice, Screen, Txt } from "@/components/ui";
import { api } from "@/lib/api";
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

function NumInput({ value, onChange, label, suffix }: { value: number | null; onChange: (v: number | null) => void; label: string; suffix: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
      <TextInput
        accessibilityLabel={label}
        value={value === null ? "" : String(value)}
        onChangeText={(t) => {
          const v = t.replace(",", ".").replace(/[^\d.]/g, "");
          onChange(v === "" ? null : Number(v));
        }}
        keyboardType="decimal-pad"
        style={{
          width: 64,
          height: 44,
          borderRadius: radius.md,
          borderWidth: 1,
          borderColor: c.line,
          backgroundColor: c.field,
          textAlign: "center",
          fontFamily: fonts.display,
          fontSize: 18,
          color: c.ink,
        }}
      />
      <Txt muted size={13}>{suffix}</Txt>
    </View>
  );
}

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

  return (
    <Screen edges={["bottom"]}>
      <Txt weight="semi" size={18} style={{ marginBottom: space.md }}>{workout.title}</Txt>
      {error ? <Notice tone="warn">{error}</Notice> : null}

      <View style={{ gap: space.md }}>
        {workout.entries.map((e, ei) => (
          <Card key={`${e.exercise_name}-${ei}`} style={{ gap: space.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
              <Txt weight="semi" style={{ flex: 1 }}>{e.exercise_name}</Txt>
              <Pressable accessibilityRole="button" accessibilityLabel={`Quitar ${e.exercise_name}`} hitSlop={10} onPress={() => update((es) => es.filter((_, i) => i !== ei))}>
                <TrashIcon size={20} color={c.inkMuted} />
              </Pressable>
            </View>
            {e.sets.map((s, si) => (
              <View key={si} style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                <Txt muted size={14} style={{ width: 22 }}>{si + 1}</Txt>
                <NumInput label={`Repeticiones serie ${si + 1}`} value={s.reps} onChange={(v) => setSet(ei, si, { reps: v === null ? null : Math.round(v) })} suffix="rep" />
                <NumInput label={`Peso serie ${si + 1}`} value={s.weight_kg} onChange={(v) => setSet(ei, si, { weight_kg: v })} suffix="kg" />
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: s.done }}
                  accessibilityLabel={`Serie ${si + 1} hecha`}
                  onPress={() => setSet(ei, si, { done: !s.done })}
                  style={{
                    marginLeft: "auto",
                    width: 44,
                    height: 44,
                    borderRadius: radius.md,
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: s.done ? c.okBg : c.muted,
                  }}>
                  <CheckIcon size={20} color={s.done ? c.ok : c.inkMuted} weight="bold" />
                </Pressable>
              </View>
            ))}
            <Pressable
              accessibilityRole="button"
              onPress={() => update((es) => es.map((x, i) => (i === ei ? { ...x, sets: [...x.sets, { ...(x.sets.at(-1) ?? { reps: null, weight_kg: null }), done: false }] } : x)))}
              style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingVertical: 8 }}>
              <PlusIcon size={16} color={c.brandInk} weight="bold" />
              <Txt size={14} weight="semi" style={{ color: c.brandInk }}>Agregar serie</Txt>
            </Pressable>
          </Card>
        ))}
      </View>

      <View style={{ marginTop: space.xl }}>
        <Field label="Agregar ejercicio" value={query} onChangeText={setQuery} placeholder="Busca: sentadilla, press, remo…" />
        {results.map((r) => (
          <Pressable key={r.id} accessibilityRole="button" onPress={() => add(r.name_es, r.id)} style={{ paddingVertical: 12, flexDirection: "row", gap: 8, alignItems: "center" }}>
            <MagnifyingGlassIcon size={16} color={c.inkMuted} />
            <Txt>{r.name_es}</Txt>
          </Pressable>
        ))}
        {query.trim().length >= 2 ? (
          <Pressable accessibilityRole="button" onPress={() => add(query.trim(), null)} style={{ paddingVertical: 12 }}>
            <Txt weight="semi" style={{ color: c.brandInk }}>Agregar «{query.trim()}» como ejercicio propio</Txt>
          </Pressable>
        ) : null}
      </View>

      <View style={{ gap: space.sm, marginTop: space.xl }}>
        <Button label="Terminar y guardar" onPress={finish} loading={saving} />
        <Button label="Descartar entreno" variant="ghost" onPress={discard} />
      </View>
    </Screen>
  );
}
