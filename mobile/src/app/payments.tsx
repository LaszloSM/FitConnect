import * as WebBrowser from "expo-web-browser";
import { useState } from "react";
import { View } from "react-native";

import { Button, Card, Chip, Loading, Notice, Num, Screen, Section, Txt } from "@/components/ui";
import { api } from "@/lib/api";
import { formatCOP, formatDateTime, plural } from "@/lib/format";
import { useSession } from "@/lib/session";
import { space } from "@/lib/theme";
import type { Payment, Plan } from "@/lib/types";
import { useCached } from "@/lib/useCached";

const METHOD: Record<string, string> = {
  cash: "Efectivo",
  card: "Tarjeta",
  transfer: "Transferencia",
  wompi: "Pago en línea",
};

export default function Payments() {
  const { gym } = useSession();
  const base = gym ? `/api/v1/me/gyms/${gym.link_id}` : null;
  const payments = useCached<Payment[]>(base ? `${base}/payments` : null);
  const plans = useCached<{ online_payments: boolean; plans: Plan[] }>(base ? `${base}/plans` : null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <Screen edges={["bottom"]} refreshing={payments.loading && Boolean(payments.data)} onRefresh={() => { void payments.reload(); void plans.reload(); }}>
      {error ? <Notice tone="danger">{error}</Notice> : null}

      <Section>Renovar</Section>
      {!plans.data ? (
        <Loading />
      ) : !plans.data.online_payments ? (
        <Notice tone="info">{gym?.gym_name} todavía no recibe pagos en línea. Renueva en recepción.</Notice>
      ) : (
        <View style={{ gap: space.sm }}>
          {plans.data.plans.map((p) => (
            <Card key={p.id} style={{ gap: space.sm }}>
              <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", gap: space.md }}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Txt weight="semi" size={16}>{p.name}</Txt>
                  <Txt muted size={13}>{p.entries_total ? plural(p.entries_total, "entrada", "entradas") : plural(p.duration_days, "día", "días")}</Txt>
                </View>
                <Num size={22}>{formatCOP(p.price)}</Num>
              </View>
              <Button label="Pagar en línea" variant="secondary" onPress={() => void renew(p)} loading={busy === p.id} />
            </Card>
          ))}
          <Txt muted size={13}>El pago lo procesa Wompi. Tu membresía se activa sola cuando el pago se confirma.</Txt>
        </View>
      )}

      <Section>Historial</Section>
      {payments.error && !payments.data ? <Notice tone="danger">{payments.error}</Notice> : null}
      {payments.data && !payments.data.length ? <Txt muted size={14}>Aún no hay pagos registrados.</Txt> : null}
      {payments.data?.length ? (
        <Card style={{ gap: space.md }}>
          {payments.data.map((p) => (
            <View key={p.id} style={{ flexDirection: "row", justifyContent: "space-between", gap: space.md }}>
              <View style={{ flex: 1, gap: 2 }}>
                <Txt weight="medium">{p.concept}</Txt>
                <Txt muted size={13}>{formatDateTime(p.date)} · {METHOD[p.method] ?? p.method}</Txt>
                {p.status === "refunded" || p.refunded ? <Chip tone="info" label={`Devuelto ${formatCOP(p.refunded || p.amount)}`} /> : null}
              </View>
              <Num size={18}>{formatCOP(p.amount)}</Num>
            </View>
          ))}
        </Card>
      ) : null}
    </Screen>
  );
}
