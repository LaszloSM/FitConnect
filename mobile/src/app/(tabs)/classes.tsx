import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { CloudSlashIcon } from "phosphor-react-native";
import { useMemo, useState } from "react";
import { Alert, Platform, View } from "react-native";

import { Button, Card, Chip, Empty, Loading, Notice, Screen, Section, Title, Txt } from "@/components/ui";
import { api } from "@/lib/api";
import { formatTime, plural, weekdayLabel } from "@/lib/format";
import { useSession } from "@/lib/session";
import { space } from "@/lib/theme";
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

export default function Classes() {
  const { gym } = useSession();
  const usable = gym?.app_enabled ? gym : null;
  const list = useCached<ClassItem[]>(usable ? `/api/v1/me/gyms/${usable.link_id}/classes?days=7` : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const groups: Record<string, ClassItem[]> = {};
    for (const c of list.data ?? []) (groups[c.session_date] ??= []).push(c);
    return Object.entries(groups);
  }, [list.data]);

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
        <Empty title="Vincula tu gimnasio para ver sus clases" action={<Button label="Vincular mi gimnasio" onPress={() => router.push("/link")} style={{ alignSelf: "stretch", marginTop: space.sm }} />}>
          Reservas tu cupo desde aquí y te avisamos si sales de la lista de espera.
        </Empty>
      ) : !usable ? (
        <Notice tone="warn">{gym.gym_name} todavía no tiene activa la app para socios.</Notice>
      ) : (
        <>
          {list.stale ? <Notice tone="info" icon={CloudSlashIcon}>Sin conexión. Para reservar necesitas internet.</Notice> : null}
          {error ? <Notice tone="danger">{error}</Notice> : null}
          {list.error && !list.data ? <Notice tone="danger">{list.error}</Notice> : null}
          {!list.data && list.loading ? <Loading /> : null}
          {list.data && !list.data.length ? <Empty title="No hay clases programadas esta semana">Cuando tu gimnasio publique horarios, aparecen aquí.</Empty> : null}
          {byDay.map(([day, items]) => (
            <View key={day}>
              <Section>{weekdayLabel(day)}</Section>
              <View style={{ gap: space.sm }}>
                {items.map((c) => (
                  <Card key={c.session_id} style={{ gap: space.sm }}>
                    <View style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md }}>
                      <View style={{ flex: 1, gap: 2 }}>
                        <Txt weight="semi" size={16}>{c.class_name}</Txt>
                        <Txt muted size={13}>
                          {formatTime(c.start_time)} · {c.duration_minutes} min{c.instructor ? ` · ${c.instructor}` : ""}
                        </Txt>
                      </View>
                      {c.my_booking?.status === "booked" ? (
                        <Chip tone="ok" label="Reservada" />
                      ) : c.my_booking?.status === "waitlisted" ? (
                        <Chip tone="warn" label={`En espera #${c.my_booking.waitlist_position ?? ""}`} />
                      ) : (
                        <Chip tone={c.spots_left ? "neutral" : "warn"} label={c.spots_left ? plural(c.spots_left, "cupo", "cupos") : "Llena"} />
                      )}
                    </View>
                    <Button
                      variant={c.my_booking ? "danger" : "secondary"}
                      label={c.my_booking ? "Cancelar" : c.spots_left ? "Reservar" : "Entrar a la lista de espera"}
                      onPress={() => void act(c)}
                      loading={busy === c.session_id}
                      disabled={Boolean(list.stale)}
                    />
                  </Card>
                ))}
              </View>
            </View>
          ))}
        </>
      )}
    </Screen>
  );
}
