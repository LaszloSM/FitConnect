import { router } from "expo-router";
import { CaretRightIcon, CloudSlashIcon, ForkKnifeIcon, IdentificationCardIcon, MegaphoneIcon, QrCodeIcon, SparkleIcon, UsersIcon } from "phosphor-react-native";
import { Pressable, View } from "react-native";

import { Meter } from "@/components/charts";
import { Button, Card, Chip, Empty, Notice, Num, Screen, Section, Title, Txt } from "@/components/ui";
import { formatDay, formatTime, plural, weekdayLabel } from "@/lib/format";
import { STATUS_TONE, stripQr } from "@/lib/gym";
import { bogotaToday } from "@/lib/meals";
import { useSession } from "@/lib/session";
import { space, useColors } from "@/lib/theme";
import type { Announcement, DayMeals, GymSummary, TargetsResponse } from "@/lib/types";
import { useCached } from "@/lib/useCached";

function timeOf(ms: number) {
  const d = new Date(ms);
  return formatTime(`${d.getHours()}:${d.getMinutes()}`);
}

export default function Home() {
  const { me, gym, setGym } = useSession();
  const c = useColors();
  const first = (me?.user.full_name ?? "").split(" ")[0];
  const usable = gym?.app_enabled ? gym : null;
  const summary = useCached<GymSummary>(usable ? `/api/v1/me/gyms/${usable.link_id}` : null, stripQr);
  const news = useCached<Announcement[]>(usable ? `/api/v1/me/gyms/${usable.link_id}/announcements` : null);
  const s = summary.data;
  const health = Boolean(me?.consents.health);
  const targets = useCached<TargetsResponse>(health ? "/api/v1/me/nutrition/targets" : null);
  const today = useCached<DayMeals>(health ? `/api/v1/me/meals?day=${bogotaToday()}` : null);
  const t = targets.data?.targets;

  const reload = () => {
    void summary.reload();
    void news.reload();
    void today.reload();
  };

  return (
    <Screen refreshing={summary.loading && Boolean(s)} onRefresh={usable ? reload : undefined}>
      <Title sub={gym ? gym.gym_name : "Tu entreno, tu progreso"}>{first ? `Hola, ${first}` : "Hola"}</Title>

      {(me?.gyms.length ?? 0) > 1 ? (
        <View style={{ flexDirection: "row", gap: space.sm, marginBottom: space.md, flexWrap: "wrap" }}>
          {me!.gyms.map((g) => (
            <Pressable key={g.link_id} accessibilityRole="button" onPress={() => setGym(g.link_id)}>
              <Chip tone={g.link_id === gym?.link_id ? "info" : "neutral"} label={g.gym_name} />
            </Pressable>
          ))}
        </View>
      ) : null}

      {summary.stale ? (
        <Notice tone="info" icon={CloudSlashIcon}>
          Sin conexión. Datos de las {timeOf(summary.stale)}. Tu QR funciona igual.
        </Notice>
      ) : null}

      {!gym ? (
        <Empty
          title="¿Entrenas en un gimnasio con FitConnect?"
          action={<Button label="Vincular mi gimnasio" onPress={() => router.push("/link")} style={{ marginTop: space.sm, alignSelf: "stretch" }} />}>
          Pide en recepción tu código para la app. Con él y tu documento ves tu membresía, entras con QR y reservas clases.
        </Empty>
      ) : !gym.app_enabled ? (
        <Notice tone="warn">{gym.gym_name} todavía no tiene activa la app para socios. Tus entrenos sí quedan guardados aquí.</Notice>
      ) : summary.error && !s ? (
        <Notice tone="danger">{summary.error}</Notice>
      ) : s ? (
        <>
          <Card style={{ gap: space.md }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Txt weight="semi" size={16}>Mi membresía</Txt>
              <Chip tone={STATUS_TONE[s.membership.status]} label={s.membership.status_label} />
            </View>
            {s.membership.end_date ? (
              <View style={{ gap: 2 }}>
                <Num size={40}>
                  {s.membership.days_left !== null && s.membership.days_left >= 0
                    ? plural(s.membership.days_left, "día", "días")
                    : formatDay(s.membership.end_date)}
                </Num>
                <Txt muted size={14}>
                  {s.membership.plan_name} · {s.membership.days_left !== null && s.membership.days_left >= 0 ? "vence" : "venció"} el {formatDay(s.membership.end_date)}
                  {s.membership.entries_left !== null ? ` · ${plural(s.membership.entries_left, "entrada", "entradas")}` : ""}
                </Txt>
              </View>
            ) : (
              <Txt muted size={14}>No tienes una membresía vigente. Puedes renovar desde Pagos o en recepción.</Txt>
            )}
            <Button label="Mostrar mi QR de entrada" icon={QrCodeIcon} onPress={() => router.push("/qr")} />
            {!s.membership.can_enter ? (
              <Button label="Renovar" variant="secondary" onPress={() => router.push("/payments")} />
            ) : null}
          </Card>

          <Card style={{ marginTop: space.md, flexDirection: "row", alignItems: "center", gap: space.md }}>
            <UsersIcon size={24} color={c.inkMuted} />
            <Txt size={14} style={{ flex: 1 }}>
              {s.occupancy.recent_entries === 0
                ? "Nadie ha entrado en la última hora y media."
                : `${plural(s.occupancy.recent_entries, "persona entró", "personas entraron")} en la última hora y media.`}
            </Txt>
          </Card>

          {!s.profile.complete ? (
            <Card style={{ marginTop: space.md }} onPress={() => router.push("/gym-profile")} accessibilityLabel="Completar mi ficha">
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                <IdentificationCardIcon size={24} color={c.warn} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt weight="semi">Completa tu ficha ({s.profile.percent} %)</Txt>
                  <Txt muted size={13} numberOfLines={2}>Falta: {s.profile.missing.join(", ").toLowerCase()}</Txt>
                </View>
                <CaretRightIcon size={18} color={c.inkMuted} />
              </View>
            </Card>
          ) : null}

          {s.next_bookings.length ? (
            <>
              <Section>Tus próximas clases</Section>
              <Card style={{ gap: space.md }}>
                {s.next_bookings.map((b) => (
                  <View key={b.booking_id} style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                    <View>
                      <Txt weight="semi">{b.class_name}</Txt>
                      <Txt muted size={13}>
                        {weekdayLabel(b.session_date)} · {formatTime(b.start_time)}
                      </Txt>
                    </View>
                    {b.status === "waitlisted" ? <Chip tone="warn" label="En espera" /> : <Chip tone="ok" label="Reservada" />}
                  </View>
                ))}
              </Card>
            </>
          ) : null}

          {news.data?.length ? (
            <>
              <Section>Avisos del gimnasio</Section>
              <View style={{ gap: space.sm }}>
                {news.data.slice(0, 3).map((a) => (
                  <Card key={a.id} style={{ gap: 4 }}>
                    <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center" }}>
                      <MegaphoneIcon size={18} color={c.brandInk} />
                      <Txt weight="semi" style={{ flex: 1 }}>{a.title}</Txt>
                    </View>
                    <Txt muted size={14}>{a.body}</Txt>
                  </Card>
                ))}
              </View>
            </>
          ) : null}
        </>
      ) : null}

      {t ? (
        <>
          <Section>Hoy en tu plato</Section>
          <Card onPress={() => router.push("/eat")} accessibilityLabel="Ver lo que comí hoy" style={{ gap: space.md }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
              <ForkKnifeIcon size={22} color={c.brandInk} />
              <Txt weight="semi" style={{ flex: 1 }}>
                {today.data?.entries.length ? `Te quedan ${Math.max(0, Math.round(t.kcal - today.data.totals.kcal)).toLocaleString("es-CO")} kcal` : "Aún no registras comidas hoy"}
              </Txt>
              <CaretRightIcon size={18} color={c.inkMuted} />
            </View>
            <Meter label="Calorías" value={today.data?.totals.kcal ?? 0} target={t.kcal} unit="kcal" />
            <Meter label="Proteína" value={today.data?.totals.protein_g ?? 0} target={t.protein_g} unit="g" />
          </Card>
        </>
      ) : null}

      <Card style={{ marginTop: space.xl }} onPress={() => router.push("/generate")} accessibilityLabel="Generar un plan">
        <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
          <SparkleIcon size={26} color={c.brandInk} />
          <View style={{ flex: 1, gap: 2 }}>
            <Txt weight="semi">Generar un plan</Txt>
            <Txt muted size={13}>De comidas o de entreno, con tus metas. El automático es gratis.</Txt>
          </View>
          <CaretRightIcon size={18} color={c.inkMuted} />
        </View>
      </Card>
    </Screen>
  );
}
