import { router, useFocusEffect } from "expo-router";
import {
  BarcodeIcon,
  CaretDownIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CaretUpIcon,
  FlaskIcon,
  LightningIcon,
  ListChecksIcon,
  PlusIcon,
  SparkleIcon,
  TrashIcon,
} from "phosphor-react-native";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";

import { CalorieRing, Meter, WeekBars } from "@/components/charts";
import { Segmented, Sheet, Skeleton, Stepper } from "@/components/controls";
import { MacroLine, NutrientTable, fmt } from "@/components/nutrition";
import { MEALS, MealTile, RegisterSheet, foodIcon } from "@/components/today";
import { Button, Card, IconTile, Notice, Press, Rise, Screen, Section, TextLink, Txt } from "@/components/ui";
import { api } from "@/lib/api";
import { addDays, bogotaToday, pendingMeals, syncMeals } from "@/lib/meals";
import { fonts, radius, space, typeScale, useColors } from "@/lib/theme";
import type { DayMeals, MealEntry, MealKey, TargetsResponse, WeekSummary } from "@/lib/types";
import { useCached } from "@/lib/useCached";
import { useWater } from "@/lib/water";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function dayTitle(iso: string, today: string) {
  const [, m, d] = iso.split("-").map(Number);
  const date = `${d} ${MONTHS[m - 1]}`;
  if (iso === today) return `Hoy, ${date}`;
  if (iso === addDays(today, -1)) return `Ayer, ${date}`;
  return date;
}

export default function Eat() {
  const c = useColors();
  const today = bogotaToday();
  const [day, setDay] = useState(today);
  const [view, setView] = useState<"day" | "week">("day");
  const targets = useCached<TargetsResponse>("/api/v1/me/nutrition/targets");
  const meals = useCached<DayMeals>(`/api/v1/me/meals?day=${day}`);
  const week = useCached<WeekSummary>(view === "week" ? "/api/v1/me/nutrition/week" : null);
  const water = useWater(day);
  const [pending, setPending] = useState<MealEntry[]>([]);
  const [editing, setEditing] = useState<MealEntry | null>(null);
  const [grams, setGrams] = useState(100);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [register, setRegister] = useState<{ meal?: MealKey; quick?: boolean } | null>(null);
  const [micro, setMicro] = useState(false);

  const refresh = useCallback(async () => {
    setPending(await syncMeals().catch(() => pendingMeals()));
    void meals.reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [day]);

  useFocusEffect(
    useCallback(() => {
      void refresh();
      void targets.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [day]),
  );

  const server = meals.data?.day === day ? meals.data.entries : [];
  const entries = [...server, ...pending.filter((p) => p.day === day && !server.some((e) => e.id === p.id))];
  const sum = (k: "kcal" | "protein_g" | "carbs_g" | "fat_g" | "fiber_g") => entries.reduce((s, e) => s + e[k], 0);
  const t = targets.data?.available ? targets.data.targets : undefined;
  const loading = !meals.data && meals.loading;
  const kcal = sum("kcal");
  const left = t ? Math.round(t.kcal - kcal) : null;
  const filledMeals = MEALS.filter((m) => entries.some((e) => e.meal === m.key)).length;

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

  const isQuick = (e: MealEntry) => !e.food_id && !e.grams;

  return (
    <Screen refreshing={meals.loading && Boolean(meals.data)} onRefresh={() => { void refresh(); void targets.reload(); void week.reload(); void water.reload(); }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: space.lg, gap: space.md }}>
        <View style={{ flex: 1 }}>
          <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: typeScale.title.size + 4, letterSpacing: -0.6, color: c.ink }}>
            Comer
          </Text>
          {t?.pace_label ? <Txt muted size={13.5} numberOfLines={1}>{t.pace_label}</Txt> : null}
        </View>
        {view === "day" ? (
          <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: c.muted, borderRadius: 999, paddingHorizontal: 4, minHeight: 40 }}>
            <Press accessibilityRole="button" accessibilityLabel="Día anterior" hitSlop={6} onPress={() => setDay(addDays(day, -1))} style={{ width: 34, height: 40, alignItems: "center", justifyContent: "center" }}>
              <CaretLeftIcon size={16} color={c.ink} weight="bold" />
            </Press>
            <Text style={{ fontFamily: fonts.bodySemi, fontSize: 13.5, color: c.ink, minWidth: 84, textAlign: "center" }}>{dayTitle(day, today)}</Text>
            <Press
              accessibilityRole="button"
              accessibilityLabel="Día siguiente"
              accessibilityState={{ disabled: day >= today }}
              disabled={day >= today}
              hitSlop={6}
              onPress={() => setDay(addDays(day, 1))}
              style={{ width: 34, height: 40, alignItems: "center", justifyContent: "center", opacity: day >= today ? 0.3 : 1 }}>
              <CaretRightIcon size={16} color={c.ink} weight="bold" />
            </Press>
          </View>
        ) : null}
      </View>

      <Segmented
        value={view}
        onChange={setView}
        options={[{ value: "day", label: "Día" }, { value: "week", label: "Semana" }]}
        style={{ marginBottom: space.lg }}
      />

      {targets.data && !targets.data.available ? <Notice tone="info">{targets.data.message}</Notice> : null}
      {targets.data?.pace_note ? <Notice tone="warn">{targets.data.pace_note}</Notice> : null}
      {notice ? <Notice tone="warn">{notice}</Notice> : null}

      {view === "week" ? (
        <WeekView week={week.data} loading={!week.data && week.loading} />
      ) : (
        <>
          <Rise>
            <Card style={{ padding: space.xl }}>
              {loading ? (
                <View style={{ flexDirection: "row", gap: space.lg, alignItems: "center" }}>
                  <Skeleton height={132} width={132} style={{ borderRadius: 66 }} />
                  <View style={{ flex: 1, gap: space.md }}>
                    <Skeleton height={64} />
                    <Skeleton height={20} />
                  </View>
                </View>
              ) : (
                <View style={{ flexDirection: "row", gap: space.lg, alignItems: "center" }}>
                  <CalorieRing value={kcal} target={t?.kcal} size={132} stroke={14} show="consumed" />
                  <View style={{ flex: 1, gap: space.md }}>
                    <View style={{ backgroundColor: c.peach, borderRadius: radius.row, padding: space.md, gap: 2 }}>
                      <Txt size={12.5} weight="semi" muted>{left !== null && left < 0 ? "Por encima" : "Te quedan"}</Txt>
                      <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 28, lineHeight: 30, color: c.brandInk, fontVariant: ["tabular-nums"] }}>
                        {left === null ? "—" : Math.abs(left).toLocaleString("es-CO")}
                        <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: c.inkMuted }}> kcal</Text>
                      </Text>
                    </View>
                    <View style={{ gap: 2 }}>
                      <Txt size={12.5} muted>Agua</Txt>
                      <Text style={{ fontFamily: fonts.display, fontSize: 18, color: c.ink, fontVariant: ["tabular-nums"] }}>
                        {(water.water?.total_ml ?? 0).toLocaleString("es-CO")}
                        <Text style={{ fontFamily: fonts.body, fontSize: 13, color: c.inkMuted }}> / {(water.water?.goal_ml ?? 2000).toLocaleString("es-CO")} ml</Text>
                      </Text>
                    </View>
                  </View>
                </View>
              )}
              {targets.data?.clamped_message ? <Txt size={13} muted style={{ marginTop: space.md }}>{targets.data.clamped_message}</Txt> : null}
            </Card>
          </Rise>

          {t ? (
            <Rise delay={60}>
              <Card style={{ gap: space.lg, marginTop: space.md }}>
                <Txt weight="semi" size={16}>Macronutrientes</Txt>
                <Meter label="Proteína" value={sum("protein_g")} target={t.protein_g} unit="g" color={c.protein} />
                <Meter label="Carbohidratos" value={sum("carbs_g")} target={t.carbs_g} unit="g" color={c.carbs} />
                <Meter label="Grasa" value={sum("fat_g")} target={t.fat_g} unit="g" color={c.fat} />
                <Meter label="Fibra" value={sum("fiber_g")} target={t.fiber_g} unit="g" color={c.fiber} />
              </Card>
            </Rise>
          ) : null}

          <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.lg }}>
            <Button label="Registrar" icon={PlusIcon} onPress={() => setRegister({})} style={{ flex: 1 }} />
            <Button label="Escanear" icon={BarcodeIcon} variant="secondary" onPress={() => router.push({ pathname: "/scan", params: { day } })} style={{ flex: 1 }} />
          </View>

          <Section action={<TextLink label="Registro rápido" icon={LightningIcon} onPress={() => setRegister({ quick: true })} />}>
            Diario de comidas
          </Section>
          <Txt muted size={13} style={{ marginTop: -space.sm, marginBottom: space.md }}>{filledMeals} de 4 registradas</Txt>

          <View style={{ gap: space.md }}>
            {MEALS.map(({ key, label }, mi) => {
              const items = entries.filter((e) => e.meal === key);
              const total = items.reduce((s, e) => s + e.kcal, 0);
              return (
                <Rise key={key} delay={100 + mi * 40}>
                  <Card style={{ gap: space.md }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                      <MealTile meal={key} />
                      <View style={{ flex: 1 }}>
                        <Txt weight="semi" size={16}>{label}</Txt>
                        <Txt muted size={12.5}>{items.length ? `${items.length} ${items.length === 1 ? "alimento" : "alimentos"}` : "Sin registros"}</Txt>
                      </View>
                      <Text style={{ fontFamily: fonts.display, fontSize: 20, color: items.length ? c.brandInk : c.inkFaint, fontVariant: ["tabular-nums"] }}>
                        {fmt(total)}
                        <Text style={{ fontFamily: fonts.body, fontSize: 12.5, color: c.inkMuted }}> kcal</Text>
                      </Text>
                    </View>
                    {items.map((e) => (
                      <Press
                        key={e.id}
                        accessibilityRole="button"
                        accessibilityLabel={`${e.food_name}, ${isQuick(e) ? "registro rápido" : `${Math.round(e.grams)} gramos`}, ${Math.round(e.kcal)} kilocalorías. Toca para cambiar o borrar.`}
                        onPress={() => openEdit(e)}
                        scaleTo={0.985}
                        style={{ flexDirection: "row", alignItems: "center", gap: space.md, backgroundColor: c.muted, borderRadius: radius.row, padding: 10 }}>
                        <View style={{ width: 38, height: 38, borderRadius: radius.md, backgroundColor: c.card, alignItems: "center", justifyContent: "center" }}>
                          {(() => {
                            const I = isQuick(e) ? LightningIcon : foodIcon(e.food_name);
                            return <I size={20} color={c.inkMuted} />;
                          })()}
                        </View>
                        <View style={{ flex: 1 }}>
                          <Txt weight="semi" size={14.5} numberOfLines={1}>{e.food_name}</Txt>
                          <Txt muted size={12.5} numberOfLines={1}>
                            {isQuick(e) ? "Registro rápido" : `${Math.round(e.grams)} g`} · P {fmt(e.protein_g)} g{e.pending ? " · por subir" : ""}
                          </Txt>
                        </View>
                        <Text style={{ fontFamily: fonts.display, fontSize: 17, color: c.ink, fontVariant: ["tabular-nums"] }}>
                          {fmt(e.kcal)}
                          <Text style={{ fontFamily: fonts.body, fontSize: 12, color: c.inkMuted }}> kcal</Text>
                        </Text>
                      </Press>
                    ))}
                    <Press
                      accessibilityRole="button"
                      accessibilityLabel={`Agregar a ${label}`}
                      onPress={() => setRegister({ meal: key })}
                      scaleTo={0.985}
                      style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 42, borderRadius: radius.row, borderWidth: 1, borderColor: c.line, borderStyle: "dashed" }}>
                      <PlusIcon size={15} color={c.brandInk} weight="bold" />
                      <Txt size={14} weight="semi" style={{ color: c.brandInk }}>Agregar alimento</Txt>
                    </Press>
                  </Card>
                </Rise>
              );
            })}
          </View>

          {entries.length ? (
            <Card style={{ marginTop: space.md, paddingVertical: space.sm }}>
              <Press
                accessibilityRole="button"
                accessibilityState={{ expanded: micro }}
                onPress={() => setMicro((v) => !v)}
                style={{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 52 }}>
                <IconTile icon={FlaskIcon} tone="wash" />
                <View style={{ flex: 1 }}>
                  <Txt weight="semi">Micronutrientes</Txt>
                  <Txt muted size={12.5}>Sodio, minerales y vitaminas del día</Txt>
                </View>
                {micro ? <CaretUpIcon size={18} color={c.inkMuted} /> : <CaretDownIcon size={18} color={c.inkMuted} />}
              </Press>
              {micro ? (
                <View style={{ paddingTop: space.sm, paddingBottom: space.sm }}>
                  <NutrientTable
                    macros={{ kcal, protein_g: sum("protein_g"), carbs_g: sum("carbs_g"), fat_g: sum("fat_g"), fiber_g: sum("fiber_g") }}
                    values={meals.data?.day === day && !pending.some((p) => p.day === day) ? meals.data.totals.nutrients : {}}
                    targets={t}
                  />
                  <Txt muted size={12} style={{ marginTop: space.sm }}>
                    «≥» quiere decir que algún alimento del día no trae ese dato: la cifra real es igual o mayor.
                  </Txt>
                </View>
              ) : null}
            </Card>
          ) : null}
        </>
      )}

      <Section>Planes</Section>
      <Card style={{ gap: space.md }}>
        <Txt muted size={14}>Un día de comidas armado con tus metas y alimentos colombianos. Gratis, o con IA usando créditos.</Txt>
        <View style={{ flexDirection: "row", gap: space.sm }}>
          <Button label="Generar" variant="secondary" icon={SparkleIcon} onPress={() => router.push({ pathname: "/generate", params: { kind: "meals" } })} style={{ flex: 1 }} />
          <Button label="Mis planes" variant="secondary" icon={ListChecksIcon} onPress={() => router.push("/plans")} style={{ flex: 1 }} />
        </View>
      </Card>
      {targets.data?.notice ? <Txt muted size={12} style={{ marginTop: space.lg }}>{targets.data.notice}</Txt> : null}

      <RegisterSheet
        open={Boolean(register)}
        onClose={() => setRegister(null)}
        day={day}
        meal={register?.meal}
        quickFirst={register?.quick}
        onLogged={() => void refresh()}
      />

      <Sheet open={Boolean(editing)} onClose={() => setEditing(null)} title={editing?.food_name}>
        {editing ? (
          isQuick(editing) ? (
            <>
              <MacroLine kcal={editing.kcal} protein={editing.protein_g} carbs={editing.carbs_g} fat={editing.fat_g} />
              <Txt muted size={13}>Un registro rápido no tiene gramos. Si cambió, bórralo y anótalo otra vez.</Txt>
              <Button label="Borrar de este día" variant="danger" icon={TrashIcon} onPress={() => void remove()} loading={busy} />
            </>
          ) : (
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
          )
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
