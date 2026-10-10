import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { type Icon, CalendarBlankIcon, CheckCircleIcon, CloudSlashIcon, HourglassIcon, UserIcon, UsersThreeIcon, WarningCircleIcon } from "phosphor-react-native";
import { useMemo, useState } from "react";
import { Alert, Platform, ScrollView, Text, View } from "react-native";

import { Button, Card, Chip, Empty, Loading, Notice, Num, Press, Rise, Screen, Title, Txt, type Tone } from "@/components/ui";
import { api } from "@/lib/api";
import { formatTime, plural, weekdayLabel } from "@/lib/format";
import { useSession } from "@/lib/session";
import { fonts, radius, space, useColors } from "@/lib/theme";
import type { ClassItem } from "@/lib/types";
import { useCached } from "@/lib/useCached";

function confirm(title: string, body: string): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(window.confirm(`${title}\n\n${body}`));
  return new Promise((resolve) =>
    Alert.alert(title, body, [
      { text: "No", style: "cancel", onPress: () => resolve(false) },
      { text: "Sí, cancelar", style: "destructive", onPress: () => resolve(true) },
    ]),
  );
}

function status(c: ClassItem): { tone: Tone; label: string; icon: Icon } {
  if (c.my_booking?.status === "booked") return { tone: "ok", label: "Reservada", icon: CheckCircleIcon };
  if (c.my_booking?.status === "waitlisted")
    return { tone: "warn", label: c.my_booking.waitlist_position ? `En espera #${c.my_booking.waitlist_position}` : "En lista de espera", icon: HourglassIcon };
  if (!c.spots_left) return { tone: "warn", label: "Llena", icon: WarningCircleIcon };
  const few = c.spots_left <= Math.max(2, Math.ceil(c.capacity * 0.2));
  if (few) return { tone: "warn", label: c.spots_left === 1 ? "Queda 1 cupo" : `Quedan ${c.spots_left} cupos`, icon: UsersThreeIcon };
  return { tone: "ok", label: plural(c.spots_left, "cupo", "cupos"), icon: UsersThreeIcon };
}

function DayChip({ label, count, on, onPress }: { label: string; count: number; on: boolean; onPress: () => void }) {
  const c = useColors();
  return (
    <Press
      accessibilityRole="tab"
      accessibilityState={{ selected: on }}
      accessibilityLabel={`${label}, ${plural(count, "clase", "clases")}`}
      onPress={onPress}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        minHeight: 40,
        paddingHorizontal: 16,
        borderRadius: radius.pill,
        backgroundColor: on ? c.brandMuted : c.muted,
      }}>
      <Text style={{ fontFamily: on ? fonts.bodySemi : fonts.bodyMedium, fontSize: 14, color: on ? c.brandInk : c.inkMuted }}>{label}</Text>
      <Text style={{ fontFamily: fonts.bodySemi, fontSize: 12.5, color: on ? c.brandInk : c.inkFaint, fontVariant: ["tabular-nums"] }}>{count}</Text>
    </Press>
  );
}

export default function Classes() {
  const c = useColors();
  const { gym } = useSession();
  const usable = gym?.app_enabled ? gym : null;
  const list = useCached<ClassItem[]>(usable ? `/api/v1/me/gyms/${usable.link_id}/classes?days=7` : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const groups: Record<string, ClassItem[]> = {};
    for (const c of list.data ?? []) (groups[c.session_date] ??= []).push(c);
    return Object.entries(groups);
  }, [list.data]);

  const selected = byDay.find(([d]) => d === picked) ?? byDay[0];
  const dayItems = selected?.[1] ?? [];
  // Un solo botón coral: la primera clase del día en la que todavía puedes reservar.
  const featured = list.stale ? undefined : dayItems.find((x) => !x.my_booking && x.spots_left > 0)?.session_id;

  const act = async (c: ClassItem) => {
    if (!usable) return;
    setError(null);
    if (c.my_booking) {
      const ok = await confirm("¿Cancelar tu cupo?", `${c.class_name}, ${weekdayLabel(c.session_date).toLowerCase()} a las ${formatTime(c.start_time)}.`);
      if (!ok) return;
    }
    setBusy(c.session_id);
    try {
      if (c.my_booking) {
        await api(`/api/v1/me/gyms/${usable.link_id}/classes/${c.session_id}/book/${c.my_booking.booking_id}`, { method: "DELETE" });
      } else {
        await api(`/api/v1/me/gyms/${usable.link_id}/classes/${c.session_id}/book`, { method: "POST" });
        if (Platform.OS !== "web") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }
      await list.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen refreshing={list.loading && Boolean(list.data)} onRefresh={usable ? list.reload : undefined}>
      <Title sub="Próximos 7 días">Clases</Title>
      {!gym ? (
        <Empty
          icon={CalendarBlankIcon}
          title="Vincula tu gimnasio para ver sus clases"
          action={<Button label="Vincular mi gimnasio" size="lg" onPress={() => router.push("/link")} style={{ alignSelf: "stretch", marginTop: space.sm }} />}>
          Reservas tu cupo desde aquí y te avisamos si sales de la lista de espera.
        </Empty>
      ) : !usable ? (
        <Notice tone="warn" icon={WarningCircleIcon}>{gym.gym_name} todavía no tiene activa la app para socios.</Notice>
      ) : (
        <>
          {list.stale ? <Notice tone="info" icon={CloudSlashIcon}>Sin conexión. Para reservar necesitas internet.</Notice> : null}
          {error ? <Notice tone="danger" icon={WarningCircleIcon}>{error}</Notice> : null}
          {list.error && !list.data ? <Notice tone="danger" icon={WarningCircleIcon}>{list.error}</Notice> : null}
          {!list.data && list.loading ? <Loading /> : null}
          {list.data && !list.data.length ? (
            <Empty icon={CalendarBlankIcon} title="No hay clases programadas esta semana">Cuando tu gimnasio publique horarios, aparecen aquí.</Empty>
          ) : null}

          {byDay.length ? (
            <Rise>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                accessibilityRole="tablist"
                style={{ marginHorizontal: -space.xl, marginBottom: space.lg }}
                contentContainerStyle={{ paddingHorizontal: space.xl, gap: space.sm }}>
                {byDay.map(([d, items]) => (
                  <DayChip key={d} label={weekdayLabel(d)} count={items.length} on={d === selected?.[0]} onPress={() => setPicked(d)} />
                ))}
              </ScrollView>
            </Rise>
          ) : null}

          <View style={{ gap: space.md }}>
            {dayItems.map((x, i) => {
              const st = status(x);
              const [clock, ...suffix] = formatTime(x.start_time).split(" ");
              const primary = x.session_id === featured;
              return (
                <Rise key={x.session_id} delay={40 + Math.min(i, 5) * 40}>
                  <Card style={{ gap: space.md }}>
                    <View style={{ flexDirection: "row", gap: space.lg }}>
                      <View style={{ minWidth: 72 }}>
                        <Num size={26}>{clock}</Num>
                        <Txt muted size={13} weight="medium">{suffix.join(" ")}</Txt>
                        <Txt faint size={12.5} style={{ fontVariant: ["tabular-nums"], marginTop: 2 }}>{x.duration_minutes} min</Txt>
                      </View>
                      <View style={{ flex: 1, gap: 6 }}>
                        <Txt weight="semi" size={17} numberOfLines={2}>{x.class_name}</Txt>
                        {x.instructor ? (
                          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                            <UserIcon size={15} color={c.inkMuted} />
                            <Txt muted size={13.5} numberOfLines={1} style={{ flex: 1 }}>{x.instructor}</Txt>
                          </View>
                        ) : null}
                        <Chip tone={st.tone} icon={st.icon} label={st.label} />
                      </View>
                    </View>
                    <Button
                      variant={x.my_booking ? "danger" : primary ? "primary" : "secondary"}
                      label={x.my_booking ? "Cancelar" : x.spots_left ? "Reservar" : "Entrar a la lista de espera"}
                      onPress={() => void act(x)}
                      loading={busy === x.session_id}
                      disabled={Boolean(list.stale)}
                    />
                  </Card>
                </Rise>
              );
            })}
          </View>
        </>
      )}
    </Screen>
  );
}
