import { router, useFocusEffect } from "expo-router";
import { BarbellIcon, CaretRightIcon, ForkKnifeIcon, PauseIcon, PlusIcon, SparkleIcon } from "phosphor-react-native";
import { useCallback } from "react";
import { View } from "react-native";

import { Skeleton } from "@/components/controls";
import { Button, Card, Chip, Empty, IconTile, Notice, Rise, Screen, Txt } from "@/components/ui";
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

  const hasPlans = Boolean(list.data?.length);

  return (
    <Screen
      edges={["bottom"]}
      footer={hasPlans ? <Button label="Generar otro plan" icon={PlusIcon} size="lg" onPress={() => router.push("/generate")} style={{ flex: 1 }} /> : undefined}>
      {list.error && !list.data ? <Notice tone="danger">{list.error}</Notice> : null}
      {!list.data && !list.error ? (
        <View style={{ gap: space.sm }}>
          <Skeleton height={76} />
          <Skeleton height={76} />
          <Skeleton height={76} />
        </View>
      ) : null}
      {list.data && !list.data.length ? (
        <Rise>
          <Empty
            icon={ForkKnifeIcon}
            title="Aún no tienes planes"
            action={<Button label="Generar un plan" onPress={() => router.push("/generate")} style={{ alignSelf: "stretch", marginTop: space.sm }} />}>
            Arma un plan de comidas o de entreno con tus metas. Queda guardado aquí como agenda.
          </Empty>
        </Rise>
      ) : null}
      <View style={{ gap: space.sm }}>
        {list.data?.map((p, i) => {
          const detail =
            p.kind === "training"
              ? plural(p.data.days.length, "día por semana", "días por semana")
              : `${Math.round(p.data.totals?.kcal ?? 0).toLocaleString("es-CO")} kcal · ${plural(p.data.meals.length, "comida", "comidas")}`;
          return (
            <Rise key={p.id} delay={Math.min(i, 6) * 50}>
              <Card onPress={() => router.push({ pathname: "/plan/[id]", params: { id: p.id } })} accessibilityLabel={p.title}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
                  <IconTile icon={p.kind === "training" ? BarbellIcon : ForkKnifeIcon} tone="wash" size={44} />
                  <View style={{ flex: 1, gap: 4 }}>
                    <Txt weight="semi" size={15.5} numberOfLines={2}>{p.title}</Txt>
                    <Txt muted size={13} style={{ fontVariant: ["tabular-nums"] }}>{detail} · {formatDay(p.created_at)}</Txt>
                    {p.data.engine === "ai" || !p.active ? (
                      <View style={{ flexDirection: "row", gap: 6, flexWrap: "wrap", marginTop: 2 }}>
                        {p.data.engine === "ai" ? <Chip tone="info" icon={SparkleIcon} label="Con IA" /> : null}
                        {!p.active ? <Chip tone="neutral" icon={PauseIcon} label="Pausado" /> : null}
                      </View>
                    ) : null}
                  </View>
                  <CaretRightIcon size={18} color={c.inkFaint} />
                </View>
              </Card>
            </Rise>
          );
        })}
      </View>
    </Screen>
  );
}
