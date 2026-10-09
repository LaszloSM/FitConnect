import { router, useFocusEffect } from "expo-router";
import { BarbellIcon, CaretRightIcon, ForkKnifeIcon } from "phosphor-react-native";
import { useCallback } from "react";
import { View } from "react-native";

import { Button, Card, Chip, Empty, Loading, Notice, Screen, Txt } from "@/components/ui";
import { formatDay, plural } from "@/lib/format";
import { space, useColors } from "@/lib/theme";
import type { SavedPlan } from "@/lib/types";
import { useCached } from "@/lib/useCached";

export default function Plans() {
  const c = useColors();
  const list = useCached<SavedPlan[]>("/api/v1/me/plans");

  useFocusEffect(
    useCallback(() => {
      void list.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  );

  return (
    <Screen edges={["bottom"]}>
      {list.error && !list.data ? <Notice tone="danger">{list.error}</Notice> : null}
      {!list.data ? <Loading /> : null}
      {list.data && !list.data.length ? (
        <Empty title="Aún no tienes planes" action={<Button label="Generar un plan" onPress={() => router.push("/generate")} style={{ alignSelf: "stretch", marginTop: space.sm }} />}>
          Arma un plan de comidas o de entreno con tus metas. Queda guardado aquí como agenda.
        </Empty>
      ) : null}
      <View style={{ gap: space.sm }}>
        {list.data?.map((p) => {
          const Icon = p.kind === "training" ? BarbellIcon : ForkKnifeIcon;
          const detail =
            p.kind === "training"
              ? plural(p.data.days.length, "día por semana", "días por semana")
              : `${Math.round(p.data.totals?.kcal ?? 0).toLocaleString("es-CO")} kcal · ${plural(p.data.meals.length, "comida", "comidas")}`;
          return (
            <Card key={p.id} onPress={() => router.push({ pathname: "/plan/[id]", params: { id: p.id } })} accessibilityLabel={p.title}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                <Icon size={24} color={c.brandInk} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt weight="semi">{p.title}</Txt>
                  <Txt muted size={13}>{detail} · {formatDay(p.created_at)}</Txt>
                </View>
                {!p.active ? <Chip tone="neutral" label="Pausado" /> : null}
                <CaretRightIcon size={18} color={c.inkMuted} />
              </View>
            </Card>
          );
        })}
      </View>
    </Screen>
  );
}
