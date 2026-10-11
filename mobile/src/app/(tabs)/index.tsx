import { router, useFocusEffect } from "expo-router";
import {
  ArrowRightIcon,
  ArrowsClockwiseIcon,
  CalendarCheckIcon,
  CaretDownIcon,
  CloudSlashIcon,
  IdentificationCardIcon,
  MapPinIcon,
  MegaphoneIcon,
  PlusIcon,
  SparkleIcon,
  UsersThreeIcon,
} from "phosphor-react-native";
import { useCallback, useState } from "react";
import { Text, View } from "react-native";

import { CalorieRing, Meter } from "@/components/charts";
import { AppHeader, RegisterSheet, StreakCard, WaterCard } from "@/components/today";
import { Button, Card, Chip, Empty, IconButton, IconTile, ListRow, Notice, Press, Rise, Screen, Section, TextLink, Ticker, Txt } from "@/components/ui";
import { formatDay, formatTime, plural, weekdayLabel } from "@/lib/format";
import { STATUS_TONE } from "@/lib/gym";
import { bogotaToday, pendingMeals, syncMeals } from "@/lib/meals";
import { useSession } from "@/lib/session";
import { fonts, space, typeScale, useColors } from "@/lib/theme";
import type { Announcement, DayMeals, GymSummary, MealEntry, Streak, TargetsResponse } from "@/lib/types";
import { useCached } from "@/lib/useCached";
import { useWater } from "@/lib/water";

function timeOf(ms: number) {
  const d = new Date(ms);
  return formatTime(`${d.getHours()}:${d.getMinutes()}`);
}

export default function Home() {
  const { me, gym, setGym } = useSession();
  const c = useColors();
  const day = bogotaToday();
  const first = (me?.user.full_name ?? "").split(" ")[0];
  const usable = gym?.app_enabled ? gym : null;
  const summary = useCached<GymSummary>(usable ? `/api/v1/me/gyms/${usable.link_id}` : null);
  const news = useCached<Announcement[]>(usable ? `/api/v1/me/gyms/${usable.link_id}/announcements` : null);
  const s = summary.data;
  const health = Boolean(me?.consents.health);
  const targets = useCached<TargetsResponse>(health ? "/api/v1/me/nutrition/targets" : null);
  const today = useCached<DayMeals>(`/api/v1/me/meals?day=${day}`);
  const streak = useCached<Streak>("/api/v1/me/streak");
  const water = useWater(day);
  const [pending, setPending] = useState<MealEntry[]>([]);
  const [register, setRegister] = useState(false);
  const [pickGym, setPickGym] = useState(false);
  const t = targets.data?.available ? targets.data.targets : undefined;

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        setPending(await syncMeals().catch(() => pendingMeals()));
        void today.reload();
        void streak.reload();
        void targets.reload();
        void water.reload();
      })();
      // Las recargas cambian cuando cambia la consulta (p. ej. al autorizar
      // datos de salud): con [] se quedaba la primera, que no pedía nada.
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [today.reload, streak.reload, targets.reload, water.reload]),
  );

  const reload = () => {
    void summary.reload();
    void news.reload();
    void today.reload();
    void streak.reload();
    void water.reload();
  };

  const server = today.data?.entries ?? [];
  const entries = [...server, ...pending.filter((p) => p.day === day && !server.some((e) => e.id === p.id))];
  const kcal = entries.reduce((a, e) => a + e.kcal, 0);
  const protein = entries.reduce((a, e) => a + e.protein_g, 0);
  const left = t ? Math.round(t.kcal - kcal) : null;
  const m = s?.membership;
  const daysLeft = m?.days_left !== null && m?.days_left !== undefined && m.days_left >= 0 ? m.days_left : null;
  const manyGyms = (me?.gyms.length ?? 0) > 1;

  return (
    <Screen refreshing={summary.loading && Boolean(s)} onRefresh={reload}>
      <AppHeader name={me?.user.full_name ?? undefined} />

      <View style={{ marginBottom: space.lg, gap: space.sm }}>
        <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: typeScale.title.size + 4, lineHeight: typeScale.title.line + 4, letterSpacing: -0.6, color: c.ink }}>
          {first ? `Hola, ${first}` : "Hola"}
        </Text>
        {gym ? (
          <Press
            accessibilityRole={manyGyms ? "button" : "text"}
            accessibilityLabel={manyGyms ? `Sede: ${gym.gym_name}. Toca para cambiar` : `Sede: ${gym.gym_name}`}
            disabled={!manyGyms}
            onPress={() => setPickGym((v) => !v)}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: c.muted, borderRadius: 999, paddingHorizontal: 12, minHeight: 34 }}>
            <MapPinIcon size={15} color={c.brandInk} weight="bold" />
            <Txt size={13.5} weight="semi" numberOfLines={1}>{gym.gym_name}</Txt>
            {manyGyms ? <CaretDownIcon size={13} color={c.inkMuted} weight="bold" /> : null}
          </Press>
        ) : null}
        {pickGym && manyGyms ? (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
            {me!.gyms.map((g) => (
              <Press key={g.link_id} accessibilityRole="button" onPress={() => { setGym(g.link_id); setPickGym(false); }}>
                <Chip tone={g.link_id === gym?.link_id ? "brand" : "neutral"} label={g.gym_name} />
              </Press>
            ))}
          </View>
        ) : null}
      </View>

      {summary.stale ? (
        <Notice tone="info" icon={CloudSlashIcon}>
          Sin conexión. Datos de las {timeOf(summary.stale)}.
        </Notice>
      ) : null}

      {!gym ? (
        <Empty
          icon={IdentificationCardIcon}
          title="¿Entrenas en un gimnasio con LSMFit?"
          action={<Button label="Vincular mi gimnasio" onPress={() => router.push("/link")} style={{ marginTop: space.sm, alignSelf: "stretch" }} />}>
          Pide en recepción tu código para la app. Con él y tu documento ves tu membresía y reservas clases.
        </Empty>
      ) : !gym.app_enabled ? (
        <Notice tone="warn">{gym.gym_name} todavía no tiene activa la app para socios. Tus entrenos y comidas sí quedan guardados aquí.</Notice>
      ) : summary.error && !s ? (
        <Notice tone="danger">{summary.error}</Notice>
      ) : m ? (
        <Rise>
          <Card style={{ gap: space.lg, padding: space.xl }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: space.sm }}>
              <Txt weight="semi" size={16}>Mi membresía</Txt>
              <Chip tone={STATUS_TONE[m.status]} label={m.status_label} />
            </View>
            {m.end_date ? (
              <View style={{ gap: 6 }}>
                {daysLeft !== null ? (
                  <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
                    <Ticker value={daysLeft} size={52} style={{ color: c.brand }} />
                    <Txt size={18} weight="semi">{daysLeft === 1 ? "día restante" : "días restantes"}</Txt>
                  </View>
                ) : (
                  <Txt size={18} weight="semi">Venció el {formatDay(m.end_date)}</Txt>
                )}
                <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md }}>
                  <Txt size={13.5} weight="semi" numberOfLines={1} style={{ flex: 1 }}>{m.plan_name}</Txt>
                  <Txt size={13.5} muted>
                    {daysLeft !== null ? "Vence" : "Venció"} {formatDay(m.end_date)}
                    {m.entries_left !== null ? ` · ${plural(m.entries_left, "entrada", "entradas")}` : ""}
                  </Txt>
                </View>
              </View>
            ) : (
              <Txt muted size={14}>No tienes una membresía vigente. Puedes renovar desde Pagos o en recepción.</Txt>
            )}
            {!s.membership.can_enter ? (
              <Button label="Renovar" variant="secondary" icon={ArrowsClockwiseIcon} onPress={() => router.push("/payments")} />
            ) : null}
          </Card>
          {!s.profile.complete ? (
            <Press
              accessibilityRole="button"
              accessibilityLabel="Completar mi ficha del gimnasio"
              onPress={() => router.push("/gym-profile")}
              style={{ flexDirection: "row", alignItems: "center", gap: space.sm, marginTop: space.md, paddingHorizontal: space.xs }}>
              <IdentificationCardIcon size={18} color={c.warn} />
              <Txt size={13.5} muted style={{ flex: 1 }} numberOfLines={1}>
                Tu ficha va en {s.profile.percent} %: falta {s.profile.missing.join(", ").toLowerCase()}
              </Txt>
              <Txt size={13.5} weight="semi" style={{ color: c.brandInk }}>Completar</Txt>
            </Press>
          ) : null}
        </Rise>
      ) : null}

      <Rise delay={60}>
        <Section action={<TextLink label="Ver día" onPress={() => router.push("/eat")} />}>Hoy en tu plato</Section>
        <Card style={{ gap: space.lg }}>
          {t ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.lg }}>
              <CalorieRing value={kcal} target={t.kcal} size={104} stroke={11} />
              <View style={{ flex: 1, gap: 2 }}>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
                  <Ticker value={Math.abs(left ?? 0)} size={34} />
                  <Txt size={14} weight="semi">{left !== null && left < 0 ? "kcal de más" : "kcal restantes"}</Txt>
                </View>
                <Txt muted size={13}>{entries.length ? `${plural(entries.length, "registro", "registros")} hoy` : "Aún no registras comidas hoy"}</Txt>
              </View>
              <IconButton icon={PlusIcon} label="Registrar comida" onPress={() => setRegister(true)} />
            </View>
          ) : (
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Txt weight="semi">{entries.length ? `${Math.round(kcal).toLocaleString("es-CO")} kcal hoy` : "Aún no registras comidas hoy"}</Txt>
                <Txt muted size={13}>
                  {targets.data?.message ?? "Con tus medidas calculamos tu meta del día."}
                </Txt>
              </View>
              <IconButton icon={PlusIcon} label="Registrar comida" onPress={() => setRegister(true)} />
            </View>
          )}
          {t ? (
            <View style={{ gap: space.md }}>
              <Meter label="Calorías" value={kcal} target={t.kcal} unit="kcal" color={c.brand} showPct={false} />
              <Meter label="Proteína" value={protein} target={t.protein_g} unit="g" color={c.protein} showPct={false} />
            </View>
          ) : null}
        </Card>
      </Rise>

      <Rise delay={120} style={{ flexDirection: "row", gap: space.md, marginTop: space.md }}>
        <WaterCard water={water.water} onAdd={() => void water.add()} onRemove={() => void water.remove()} />
        <StreakCard streak={streak.data} />
      </Rise>

      {s?.next_bookings.length ? (
        <Rise delay={180}>
          <Section action={<TextLink label="Ver agenda" onPress={() => router.push("/classes")} />}>Próximas clases</Section>
          <Card style={{ paddingVertical: space.xs }}>
            {s.next_bookings.slice(0, 2).map((b, i, arr) => (
              <ListRow
                key={b.booking_id}
                icon={CalendarCheckIcon}
                title={b.class_name}
                detail={`${weekdayLabel(b.session_date)} · ${formatTime(b.start_time)}`}
                right={b.status === "waitlisted" ? <Chip tone="warn" label="En espera" /> : <Chip tone="ok" label="Reservada" />}
                last={i === arr.length - 1}
                onPress={() => router.push("/classes")}
              />
            ))}
          </Card>
        </Rise>
      ) : null}

      <Rise delay={220}>
        <Card tone="peach" style={{ marginTop: space.xl, gap: space.md, padding: space.xl }} onPress={() => router.push("/generate")} accessibilityLabel="Generar un plan">
          <Chip tone="brand" label="Planes" icon={SparkleIcon} style={{ backgroundColor: c.card }} />
          <View style={{ gap: 4 }}>
            <Text style={{ fontFamily: fonts.display, fontSize: 22, letterSpacing: -0.3, color: c.ink }}>Generar un plan</Text>
            <Txt muted size={14}>De comidas o de entreno, con tus metas. El automático es gratis.</Txt>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Txt weight="semi" size={14.5} style={{ color: c.brandInk }}>Diseñar mi plan</Txt>
            <ArrowRightIcon size={16} color={c.brandInk} weight="bold" />
          </View>
        </Card>
      </Rise>

      {s ? (
        <Rise delay={260}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, marginTop: space.xl }}>
            <IconTile icon={UsersThreeIcon} />
            <View style={{ flex: 1 }}>
              <Txt weight="semi">
                {s.occupancy.recent_entries === 0 ? "Sede tranquila" : `${plural(s.occupancy.recent_entries, "persona", "personas")} en la sede`}
              </Txt>
              <Txt muted size={13}>Entradas en la última hora y media</Txt>
            </View>
          </View>
        </Rise>
      ) : null}

      {news.data?.length ? (
        <Rise delay={300}>
          <Section>Avisos de la sede</Section>
          <View style={{ gap: space.sm }}>
            {news.data.slice(0, 3).map((a) => (
              <Card key={a.id} tone="muted" style={{ flexDirection: "row", gap: space.md }}>
                <IconTile icon={MegaphoneIcon} tone="wash" />
                <View style={{ flex: 1, gap: 4 }}>
                  <Txt weight="semi">{a.title}</Txt>
                  <Txt muted size={14}>{a.body}</Txt>
                </View>
              </Card>
            ))}
          </View>
        </Rise>
      ) : null}

      <RegisterSheet
        open={register}
        onClose={() => setRegister(false)}
        day={day}
        onLogged={() => {
          void (async () => {
            setPending(await pendingMeals());
            void today.reload();
            void streak.reload();
          })();
        }}
      />
    </Screen>
  );
}
