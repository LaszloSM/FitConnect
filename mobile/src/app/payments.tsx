import * as WebBrowser from "expo-web-browser";
import { ArrowCounterClockwiseIcon, CheckIcon, InfoIcon, LockSimpleIcon, ReceiptIcon, WarningCircleIcon } from "phosphor-react-native";
import { useState } from "react";
import { Text, View } from "react-native";

import { Skeleton } from "@/components/controls";
import { Button, Card, Chip, Empty, IconTile, Notice, Num, Press, Rise, Screen, Section, Txt } from "@/components/ui";
import { api } from "@/lib/api";
import { formatCOP, formatDateTime, plural } from "@/lib/format";
import { useSession } from "@/lib/session";
import { fonts, radius, space, useColors } from "@/lib/theme";
import type { Payment, Plan } from "@/lib/types";
import { useCached } from "@/lib/useCached";

const METHOD: Record<string, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  wompi: "Pago en línea",
};

function PlanOption({ plan, selected, onPress }: { plan: Plan; selected: boolean; onPress: () => void }) {
  const c = useColors();
  const length = plan.entries_total ? plural(plan.entries_total, "entrada", "entradas") : plural(plan.duration_days, "día", "días");
  return (
    <Press
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      accessibilityLabel={`${plan.name}, ${length}, ${formatCOP(plan.price)}`}
      onPress={onPress}
      scaleTo={0.985}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: space.md,
        minHeight: 64,
        paddingHorizontal: space.md,
        paddingVertical: space.md,
        borderRadius: radius.row,
        borderWidth: selected ? 1.5 : 1,
        borderColor: selected ? c.brand : c.line,
        backgroundColor: selected ? c.brandMuted : c.muted,
      }}>
      <View
        style={{
          width: 22,
          height: 22,
          borderRadius: 11,
          borderWidth: selected ? 0 : 1.5,
          borderColor: c.lineStrong,
          backgroundColor: selected ? c.brand : c.card,
          alignItems: "center",
          justifyContent: "center",
        }}>
        {selected ? <CheckIcon size={13} color={c.brandContrast} weight="bold" /> : null}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Txt weight="semi" size={15.5} numberOfLines={2}>{plan.name}</Txt>
        <Txt muted size={13}>{length}</Txt>
      </View>
      <Num size={20}>{formatCOP(plan.price)}</Num>
    </Press>
  );
}

export default function Payments() {
  const { gym } = useSession();
  const c = useColors();
  const base = gym ? `/api/v1/me/gyms/${gym.link_id}` : null;
  const payments = useCached<Payment[]>(base ? `${base}/payments` : null);
  const plans = useCached<{ online_payments: boolean; plans: Plan[] }>(base ? `${base}/plans` : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);

  const renew = async (plan: Plan) => {
    if (!base) return;
    setBusy(plan.id);
    setError(null);
    try {
      const r = await api<{ checkout_url: string }>(`${base}/renew`, { method: "POST", json: { plan_id: plan.id } });
      await WebBrowser.openBrowserAsync(r.checkout_url);
      void payments.reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const online = plans.data?.online_payments ? plans.data.plans : [];
  const selected = online.find((p) => p.id === picked) ?? online[0] ?? null;

  return (
    <Screen
      edges={["bottom"]}
      refreshing={payments.loading && Boolean(payments.data)}
      onRefresh={() => {
        void payments.reload();
        void plans.reload();
      }}
      footer={
        selected ? (
          <Button
            label={`Pagar ${formatCOP(selected.price)} en línea`}
            icon={LockSimpleIcon}
            onPress={() => void renew(selected)}
            loading={busy === selected.id}
            disabled={Boolean(busy)}
            size="lg"
            style={{ flex: 1 }}
          />
        ) : undefined
      }>
      {error ? <Notice tone="danger" icon={WarningCircleIcon}>{error}</Notice> : null}

      <Rise>
        <Section>Renovar</Section>
        {!plans.data ? (
          plans.error ? (
            <Notice tone="danger" icon={WarningCircleIcon}>{plans.error}</Notice>
          ) : (
            <Card style={{ gap: space.sm }}>
              <Skeleton height={64} />
              <Skeleton height={64} />
            </Card>
          )
        ) : !plans.data.online_payments ? (
          <Notice tone="info" icon={InfoIcon}>{gym?.gym_name} todavía no recibe pagos en línea. Renueva en recepción.</Notice>
        ) : online.length ? (
          <>
            <Card style={{ gap: space.sm }}>
              <View accessibilityRole="radiogroup" accessibilityLabel="Elige tu plan" style={{ gap: space.sm }}>
                {online.map((p) => (
                  <PlanOption key={p.id} plan={p} selected={selected?.id === p.id} onPress={() => setPicked(p.id)} />
                ))}
              </View>
            </Card>
            <Txt muted size={13} style={{ marginTop: space.sm }}>El pago lo procesa Wompi. Tu membresía se activa sola cuando el pago se confirma.</Txt>
          </>
        ) : (
          <Notice tone="info" icon={InfoIcon}>{gym?.gym_name} no tiene planes para pagar en línea ahora. Renueva en recepción.</Notice>
        )}
      </Rise>

      <Rise delay={50}>
        <Section>Historial</Section>
        {payments.error && !payments.data ? <Notice tone="danger" icon={WarningCircleIcon}>{payments.error}</Notice> : null}
        {!payments.data && !payments.error ? (
          <Card style={{ gap: space.md }}>
            <Skeleton height={44} />
            <Skeleton height={44} />
          </Card>
        ) : null}
        {payments.data && !payments.data.length ? <Empty icon={ReceiptIcon} title="Aún no hay pagos registrados" /> : null}
        {payments.data?.length ? (
          <Card style={{ paddingVertical: space.xs }}>
            {payments.data.map((p, i, arr) => (
              <View
                key={p.id}
                style={{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 64, paddingVertical: 10, borderBottomWidth: i === arr.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
                <IconTile icon={ReceiptIcon} tone="wash" />
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt weight="semi" size={15} numberOfLines={2}>{p.concept}</Txt>
                  <Txt muted size={13}>{formatDateTime(p.date)} · {METHOD[p.method] ?? p.method}</Txt>
                  {p.status === "refunded" || p.refunded ? (
                    <Chip tone="info" icon={ArrowCounterClockwiseIcon} label={`Devuelto ${formatCOP(p.refunded || p.amount)}`} style={{ marginTop: 4 }} />
                  ) : null}
                </View>
                <Text style={{ fontFamily: fonts.display, fontSize: 16, color: c.ink, fontVariant: ["tabular-nums"] }}>{formatCOP(p.amount)}</Text>
              </View>
            ))}
          </Card>
        ) : null}
      </Rise>
    </Screen>
  );
}
