import { router, useFocusEffect } from "expo-router";
import { ArrowsClockwiseIcon, CaretLeftIcon, CaretRightIcon, DropIcon, ListChecksIcon, PlusIcon, SparkleIcon, TrashIcon } from "phosphor-react-native";
import { useCallback, useState } from "react";
import { Pressable, Text, View } from "react-native";

import { CalorieRing, Meter, WeekBars } from "@/components/charts";
import { Segmented, Sheet, Skeleton, Stepper } from "@/components/controls";
import { MacroLine, NutrientTable, fmt } from "@/components/nutrition";
import { Button, Card, Notice, Screen, Section, Title, Txt } from "@/components/ui";
import { api } from "@/lib/api";
import { addDays, bogotaToday, copyMeals, pendingMeals, syncMeals } from "@/lib/meals";
import { fonts, radius, space, useColors } from "@/lib/theme";
import type { DayMeals, MealEntry, MealKey, TargetsResponse, WeekSummary } from "@/lib/types";
import { useCached } from "@/lib/useCached";

const ORDER: { key: MealKey; label: string }[] = [
  { key: "breakfast", label: "Desayuno" },
  { key: "lunch", label: "Almuerzo" },
  { key: "dinner", label: "Cena" },
  { key: "snack", label: "Entre comidas" },
];
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function dayTitle(iso: string, today: string) {
  if (iso === today) return "Hoy";
  if (iso === addDays(today, -1)) return "Ayer";
  const [, m, d] = iso.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]}`;
}

export default function Eat() {
  const c = useColors();
  const today = bogotaToday();
  const [day, setDay] = useState(today);
  const [view, setView] = useState<"day" | "week">("day");
  const targets = useCached<TargetsResponse>("/api/v1/me/nutrition/targets");
  const meals = useCached<DayMeals>(`/api/v1/me/meals?day=${day}`);
  const week = useCached<WeekSummary>(view === "week" ? "/api/v1/me/nutrition/week" : null);
  const [pending, setPending] = useState<MealEntry[]>([]);
  const [editing, setEditing] = useState<MealEntry | null>(null);
  const [grams, setGrams] = useState(100);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        setPending(await syncMeals().catch(() => pendingMeals()));
        void meals.reload();
        void targets.reload();
      })();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [day]),
  );

  const server = meals.data?.day === day ? meals.data.entries : [];
  const entries = [...server, ...pending.filter((p) => p.day === day && !server.some((e) => e.id === p.id))];
  const sum = (k: "kcal" | "protein_g" | "carbs_g" | "fat_g" | "fiber_g") => entries.reduce((s, e) => s + e[k], 0);
  const t = targets.data?.available ? targets.data.targets : undefined;
  const loading = !meals.data && meals.loading;

  const openEdit = (e: MealEntry) => {
    if (e.pending) return;
    setEditing(e);
    setGrams(Math.round(e.grams));
  };

  const saveEdit = async () => {
    if (!editing) return;
    setBusy(true);
    await api(`/api/v1/me/meals/${editing.id}`, { method: "PATCH", json: { grams } }).catch((e) => setNotice((e as Error).message));
    setBusy(false);
    setEditing(null);
    void meals.reload();
  };

  const remove = async () => {
    if (!editing) return;
    setBusy(true);
    await api(`/api/v1/me/meals/${editing.id}`, { method: "DELETE" }).catch((e) => setNotice((e as Error).message));
    setBusy(false);
    setEditing(null);
    void meals.reload();
  };

  const repeatYesterday = async () => {
    const yesterday = addDays(day, -1);
    setBusy(true);
    setNotice(null);
    try {
      const prev = await api<DayMeals>(`/api/v1/me/meals?day=${yesterday}`);
      if (!prev.entries.length) {
        setNotice("El día anterior no tiene comidas registradas.");
      } else {
        await copyMeals(yesterday, prev.entries.length, { toDay: day });
        void meals.reload();
      }
    } catch (e) {
      setNotice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen refreshing={meals.loading && Boolean(meals.data)} onRefresh={() => { void meals.reload(); void targets.reload(); void week.reload(); }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between" }}>
        <Title sub={t?.pace_label ? `${t.pace_label} · ${t.weekly_change_kg < 0 ? "bajas" : "subes"} unos ${String(Math.abs(Math.round(t.weekly_change_kg * 10) / 10)).replace(".", ",")} kg por semana` : "Lo que comes, sin contar de más"}>
          Comer
        </Title>
      </View>

      <Segmented
        value={view}
        onChange={setView}
        options={[{ value: "day", label: "Día" }, { value: "week", label: "Semana" }]}
        style={{ marginBottom: space.lg }}
      />

      {targets.data && !targets.data.available ? (
        <Notice tone="info">{targets.data.message}</Notice>
      ) : null}
      {targets.data?.pace_note ? <Notice tone="warn">{targets.data.pace_note}</Notice> : null}
      {notice ? <Notice tone="warn">{notice}</Notice> : null}

      {view === "week" ? (
        <WeekView week={week.data} loading={!week.data && week.loading} />
      ) : (
        <>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.md }}>
            <Pressable accessibilityRole="button" accessibilityLabel="Día anterior" hitSlop={8} onPress={() => setDay(addDays(day, -1))} style={{ minWidth: 44, minHeight: 44, justifyContent: "center" }}>
              <CaretLeftIcon size={20} color={c.ink} />
            </Pressable>
            <Text accessibilityRole="header" style={{ fontFamily: fonts.bodySemi, fontSize: 16, color: c.ink }}>{dayTitle(day, today)}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Día siguiente"
              accessibilityState={{ disabled: day >= today }}
              disabled={day >= today}
              hitSlop={8}
              onPress={() => setDay(addDays(day, 1))}
              style={{ minWidth: 44, minHeight: 44, justifyContent: "center", alignItems: "flex-end", opacity: day >= today ? 0.3 : 1 }}>
              <CaretRightIcon size={20} color={c.ink} />
            </Pressable>
          </View>

          <Card style={{ gap: space.lg }}>
            {loading ? (
              <View style={{ flexDirection: "row", gap: space.lg, alignItems: "center" }}>
                <Skeleton height={136} width={136} style={{ borderRadius: 68 }} />
                <View style={{ flex: 1, gap: space.lg }}>
                  <Skeleton height={26} />
                  <Skeleton height={26} />
                  <Skeleton height={26} />
                </View>
              </View>
            ) : (
              <View style={{ flexDirection: "row", gap: space.lg, alignItems: "center" }}>
                <CalorieRing value={sum("kcal")} target={t?.kcal} size={136} />
                <View style={{ flex: 1, gap: space.md }}>
                  <Meter label="Proteína" value={sum("protein_g")} target={t?.protein_g} unit="g" />
                  <Meter label="Carbohidratos" value={sum("carbs_g")} target={t?.carbs_g} unit="g" />
                  <Meter label="Grasa" value={sum("fat_g")} target={t?.fat_g} unit="g" />
                </View>
              </View>
            )}
            {t ? (
              <View style={{ flexDirection: "row", gap: space.lg, alignItems: "center", paddingTop: space.md, borderTopWidth: 1, borderTopColor: c.muted }}>
                <View style={{ flex: 1 }}>
                  <Meter label="Fibra" value={sum("fiber_g")} target={t.fiber_g} unit="g" />
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                  <DropIcon size={18} color={c.info} />
                  <Txt size={13} muted>{(t.water_ml / 1000).toFixed(1).replace(".", ",")} L de agua</Txt>
                </View>
              </View>
            ) : null}
            {targets.data?.clamped_message ? <Txt size={13} muted>{targets.data.clamped_message}</Txt> : null}
          </Card>

          {ORDER.map(({ key, label }) => {
            const items = entries.filter((e) => e.meal === key);
            const kcal = items.reduce((s, e) => s + e.kcal, 0);
            return (
              <View key={key}>
                <Section
                  action={
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Agregar a ${label}`}
                      hitSlop={8}
                      onPress={() => router.push({ pathname: "/add-food", params: { meal: key, day } })}
                      style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 4, minHeight: 44, paddingHorizontal: 4 }, pressed && { opacity: 0.6 }]}>
                      <PlusIcon size={16} color={c.brandInk} weight="bold" />
                      <Txt size={14} weight="semi" style={{ color: c.brandInk }}>Agregar</Txt>
                    </Pressable>
                  }>
                  {label}
                  {items.length ? <Text style={{ fontFamily: fonts.body, color: c.inkMuted }}>{`  ${fmt(kcal)} kcal`}</Text> : null}
                </Section>
                {items.length ? (
                  <Card style={{ paddingVertical: space.xs }}>
                    {items.map((e, i) => (
                      <Pressable
                        key={e.id}
                        accessibilityRole="button"
                        accessibilityLabel={`${e.food_name}, ${Math.round(e.grams)} gramos, ${Math.round(e.kcal)} kilocalorías. Toca para cambiar la cantidad o borrar.`}
                        onPress={() => openEdit(e)}
                        style={({ pressed }) => [
                          { flexDirection: "row", alignItems: "center", gap: space.md, paddingVertical: 12, borderBottomWidth: i === items.length - 1 ? 0 : 1, borderBottomColor: c.muted },
                          pressed && { opacity: 0.6 },
                        ]}>
                        <View style={{ flex: 1 }}>
                          <Txt weight="medium" numberOfLines={1}>{e.food_name}</Txt>
                          <Txt muted size={13}>
                            {Math.round(e.grams)} g · {fmt(e.protein_g)} g proteína{e.pending ? " · por subir" : ""}
                          </Txt>
                        </View>
                        <Text style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: c.ink, fontVariant: ["tabular-nums"] }}>{fmt(e.kcal)}</Text>
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

          {!loading && !entries.length ? (
            <Button
              label="Repetir lo del día anterior"
              variant="secondary"
              icon={ArrowsClockwiseIcon}
              loading={busy}
              onPress={() => void repeatYesterday()}
              style={{ marginTop: space.lg }}
            />
          ) : null}

          {entries.length ? (
            <>
              <Section>Nutrientes del día</Section>
              <Card>
                <NutrientTable
                  macros={{ kcal: sum("kcal"), protein_g: sum("protein_g"), carbs_g: sum("carbs_g"), fat_g: sum("fat_g"), fiber_g: sum("fiber_g") }}
                  values={meals.data?.day === day && !pending.some((p) => p.day === day) ? meals.data.totals.nutrients : {}}
                  targets={t}
                />
                <Txt muted size={12} style={{ marginTop: space.sm }}>
                  «≥» quiere decir que algún alimento del día no trae ese dato: la cifra real es igual o mayor.
                </Txt>
              </Card>
            </>
          ) : null}
        </>
      )}

      <Section>Planes</Section>
      <Card style={{ gap: space.md }}>
        <Txt muted size={14}>Un día de comidas armado con tus metas y alimentos colombianos. Gratis, o con IA usando créditos.</Txt>
        <Button label="Generar un plan" icon={SparkleIcon} onPress={() => router.push({ pathname: "/generate", params: { kind: "meals" } })} />
        <Button label="Mis planes" variant="secondary" icon={ListChecksIcon} onPress={() => router.push("/plans")} />
      </Card>
      {targets.data?.notice ? <Txt muted size={12} style={{ marginTop: space.lg }}>{targets.data.notice}</Txt> : null}

      <Sheet open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.food_name}>
        {editing ? (
          <>
            <Stepper value={grams} onChange={setGrams} />
            <MacroLine
              kcal={(editing.kcal * grams) / editing.grams}
              protein={(editing.protein_g * grams) / editing.grams}
              carbs={(editing.carbs_g * grams) / editing.grams}
              fat={(editing.fat_g * grams) / editing.grams}
            />
            <Button label="Guardar cantidad" onPress={() => void saveEdit()} loading={busy} disabled={grams === Math.round(editing.grams)} />
            <Button label="Borrar de este día" variant="danger" icon={TrashIcon} onPress={() => void remove()} />
          </>
        ) : null}
      </Sheet>
    </Screen>
  );
}

function WeekView({ week, loading }: { week: WeekSummary | null; loading: boolean }) {
  const c = useColors();
  if (loading || !week) {
    return (
      <Card style={{ gap: space.md }}>
        <Skeleton height={24} width="50%" />
        <Skeleton height={132} />
      </Card>
    );
  }
  const avg = week.average;
  const tgt = week.target;
  const logged = week.days.filter((d) => d.logged).length;
  const diff = avg && tgt ? Math.round(avg.kcal - tgt.kcal) : null;
  return (
    <>
      <Card style={{ gap: space.lg }}>
        <WeekBars days={week.days} target={tgt?.kcal} />
      </Card>
      <Section>Promedio de los días registrados</Section>
      <Card style={{ gap: space.md }}>
        {avg ? (
          <>
            <MacroLine kcal={avg.kcal} protein={avg.protein_g} carbs={avg.carbs_g} fat={avg.fat_g} />
            <Text style={{ fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: c.inkMuted }}>
              {`${logged} de 7 días con registro.`}
              {diff !== null ? ` En promedio ${Math.abs(diff)} kcal ${diff > 0 ? "por encima" : "por debajo"} de tu meta.` : ""}
              {avg && tgt ? ` Proteína: ${Math.round((avg.protein_g / tgt.protein_g) * 100)} % de la meta.` : ""}
            </Text>
          </>
        ) : (
          <Txt muted size={14}>Aún no registras comidas esta semana.</Txt>
        )}
      </Card>
    </>
  );
}
