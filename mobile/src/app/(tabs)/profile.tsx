import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router, useFocusEffect } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import {
  ArrowSquareOutIcon,
  BarbellIcon,
  BellIcon,
  CaretRightIcon,
  CheckCircleIcon,
  CreditCardIcon,
  FileTextIcon,
  FireIcon,
  HeartbeatIcon,
  IdentificationCardIcon,
  InfoIcon,
  LinkIcon,
  MapPinIcon,
  RulerIcon,
  SparkleIcon,
  TrashIcon,
  TrophyIcon,
  WarningIcon,
  XCircleIcon,
  type Icon,
} from "phosphor-react-native";
import { useCallback, useState } from "react";
import { Alert, Platform, Switch, Text, View } from "react-native";

import { Skeleton } from "@/components/controls";
import { Button, Card, Chip, IconTile, ListRow, Notice, Press, Rise, Screen, Section, Ticker, Txt, type Tone } from "@/components/ui";
import { api } from "@/lib/api";
import { LEGAL_URL } from "@/lib/config";
import { STATUS_TONE, stripQr } from "@/lib/gym";
import { bogotaToday } from "@/lib/meals";
import { useSession } from "@/lib/session";
import { fonts, radius, space, useColors, useIsDark } from "@/lib/theme";
import type { GymSummary, Profile as BodyProfile, Streak, Workout } from "@/lib/types";
import { useCached } from "@/lib/useCached";

function ask(title: string, body: string, yes: string): Promise<boolean> {
  if (Platform.OS === "web") return Promise.resolve(window.confirm(`${title}\n\n${body}`));
  return new Promise((resolve) =>
    Alert.alert(title, body, [
      { text: "Cancelar", style: "cancel", onPress: () => resolve(false) },
      { text: yes, style: "destructive", onPress: () => resolve(true) },
    ]),
  );
}

/** Token de Expo para avisos. Solo en un celular de verdad y con un proyecto EAS configurado. */
async function pushToken(): Promise<string | null> {
  if (Platform.OS === "web" || !Device.isDevice) return null;
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") return null;
  const projectId = Constants.expoConfig?.extra?.eas?.projectId as string | undefined;
  if (!projectId) return null;
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}

const GOAL_LABEL: Record<NonNullable<BodyProfile["goal"]>, string> = {
  lose_fat: "Bajar grasa",
  gain_muscle: "Ganar músculo",
  maintain: "Mantenerme",
  performance: "Rendimiento",
  health: "Salud",
};

const CONSENT_ICON: Record<"health" | "notifications" | "ai_plans", Icon> = {
  health: HeartbeatIcon,
  notifications: BellIcon,
  ai_plans: SparkleIcon,
};

const TONE_ICON: Record<Tone, Icon> = {
  ok: CheckCircleIcon,
  warn: WarningIcon,
  danger: XCircleIcon,
  info: InfoIcon,
  neutral: InfoIcon,
  brand: InfoIcon,
};

/** En web, react-native-web pinta el pulgar activo con su propio color si no se le pasa. */
const WEB_SWITCH = (Platform.OS === "web" ? { activeThumbColor: "#FFFFFF" } : {}) as object;

/** Hasta 100 entrenos por consulta: si llegan 100 del mes, se muestra «100+». */
const WORKOUT_LIMIT = 100;

function initialsOf(name: string | null | undefined) {
  return (name ?? "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
}

function Stat({ icon: IconCmp, value, unit, label, loading, plus }: { icon: Icon; value: number | null; unit?: string; label: string; loading: boolean; plus?: boolean }) {
  const c = useColors();
  return (
    <Card style={{ flex: 1, minWidth: 0, gap: space.sm, padding: space.md }}>
      <IconCmp size={18} color={c.brand} weight="fill" />
      <View accessible accessibilityLabel={value === null ? `${label}: sin datos` : `${label}: ${plus ? "más de " : ""}${value}${unit ? ` ${unit}` : ""}`} style={{ gap: 2 }}>
        {value === null ? (
          loading ? (
            <Skeleton height={26} width={44} />
          ) : (
            <Txt faint size={13} style={{ lineHeight: 26 }}>Sin datos</Txt>
          )
        ) : (
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 3 }}>
            <Ticker value={value} size={24} heavy={false} format={(n) => `${Math.round(n)}${plus ? "+" : ""}`} />
            {unit ? <Txt size={12} muted>{unit}</Txt> : null}
          </View>
        )}
        <Txt size={12} muted numberOfLines={2}>{label}</Txt>
      </View>
    </Card>
  );
}

export default function Profile() {
  const { me, gym, refresh, signOut } = useSession();
  const c = useColors();
  const dark = useIsDark();
  const [notice, setNotice] = useState<{ tone: "ok" | "warn" | "danger"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const usable = gym?.app_enabled ? gym : null;
  const summary = useCached<GymSummary>(usable ? `/api/v1/me/gyms/${usable.link_id}` : null, stripQr);
  const streak = useCached<Streak>("/api/v1/me/streak");
  const workouts = useCached<Workout[]>(`/api/v1/me/workouts?limit=${WORKOUT_LIMIT}`);

  useFocusEffect(
    useCallback(() => {
      void streak.reload();
      void workouts.reload();
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [streak.reload, workouts.reload]),
  );

  if (!me) return null;

  const month = bogotaToday().slice(0, 7);
  const monthWorkouts = workouts.data ? workouts.data.filter((w) => bogotaToday(Date.parse(w.started_at)).slice(0, 7) === month).length : null;
  const membership = summary.data?.membership;
  const statusTone = membership ? STATUS_TONE[membership.status] : null;
  const initials = initialsOf(me.user.full_name);
  const version = Constants.expoConfig?.version;
  const goal = me.profile.goal ? GOAL_LABEL[me.profile.goal] : null;
  const weight = me.consents.health && me.profile.weight_kg ? `${me.profile.weight_kg.toLocaleString("es-CO")} kg` : null;
  const bodyDetail = [goal, weight].filter(Boolean).join(" · ") || "Todavía sin objetivo";

  const setConsent = async (kind: "health" | "notifications" | "ai_plans", granted: boolean) => {
    if (!granted && kind === "health") {
      const ok = await ask("¿Retirar la autorización de salud?", "Se borran tu peso y tu talla de la app.", "Retirar");
      if (!ok) return;
    }
    setBusy(kind);
    setNotice(null);
    try {
      await api("/api/v1/me/consents", { method: "POST", json: { kind, granted } });
      if (kind === "notifications" && granted) {
        const token = await pushToken().catch(() => null);
        if (token) await api("/api/v1/me/push-token", { method: "POST", json: { token, platform: Platform.OS } });
        else setNotice({ tone: "warn", text: "Quedó autorizado. Los avisos llegan cuando instales la app desde la tienda y des permiso al celular." });
      }
      await refresh();
    } catch (e) {
      setNotice({ tone: "danger", text: (e as Error).message });
    } finally {
      setBusy(null);
    }
  };

  const unlink = async () => {
    if (!gym) return;
    const ok = await ask(`¿Desvincular ${gym.gym_name}?`, "Tu QR deja de servir en este celular. Tu ficha en el gimnasio no cambia.", "Desvincular");
    if (!ok) return;
    await api(`/api/v1/me/links/${gym.link_id}`, { method: "DELETE" }).catch((e) => setNotice({ tone: "danger", text: (e as Error).message }));
    await refresh();
  };

  const deleteAccount = async () => {
    const ok = await ask(
      "¿Borrar tu cuenta?",
      "Se borran ya tu cuenta, tus entrenos, tus medidas y tus autorizaciones. No se puede deshacer. Tu ficha en el gimnasio no se borra: para eso habla con tu gimnasio.",
      "Borrar mi cuenta",
    );
    if (!ok) return;
    try {
      await api("/api/v1/me", { method: "DELETE" });
      await signOut();
    } catch (e) {
      setNotice({ tone: "danger", text: (e as Error).message });
    }
  };

  const offTrack = dark ? c.lineStrong : c.muted;
  const chevron = <CaretRightIcon size={18} color={c.inkFaint} weight="bold" />;
  const consents = ["health", "notifications", "ai_plans"] as const;

  return (
    <Screen>
      <Rise>
        <View style={{ alignItems: "center", gap: space.sm, paddingTop: space.md, paddingBottom: space.sm }}>
          <View
            accessible
            accessibilityLabel={me.user.full_name ? `Iniciales de ${me.user.full_name}` : "Tu perfil"}
            style={{ width: 92, height: 92, borderRadius: 46, backgroundColor: c.brandMuted, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: c.line, marginBottom: space.xs }}>
            <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 34, letterSpacing: -0.5, color: c.brandInk }}>{initials || "·"}</Text>
          </View>
          <Text accessibilityRole="header" numberOfLines={2} style={{ fontFamily: fonts.display, fontSize: 26, lineHeight: 32, letterSpacing: -0.5, color: c.ink, textAlign: "center" }}>
            {me.user.full_name ?? "Mi perfil"}
          </Text>
          <Txt muted size={14} numberOfLines={1}>{me.user.email}</Txt>
          {gym ? (
            <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: space.sm, marginTop: space.xs }}>
              <Chip tone="neutral" icon={MapPinIcon} label={gym.gym_name} />
              {membership && statusTone ? <Chip tone={statusTone} icon={TONE_ICON[statusTone]} label={membership.status_label} /> : null}
            </View>
          ) : null}
        </View>
      </Rise>

      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

      <Rise delay={50}>
        <View style={{ flexDirection: "row", gap: space.sm, marginTop: space.lg }}>
          <Stat icon={FireIcon} value={streak.data?.current ?? null} unit={streak.data?.current === 1 ? "día" : "días"} label="Racha actual" loading={streak.loading} />
          <Stat icon={TrophyIcon} value={streak.data?.best ?? null} unit={streak.data?.best === 1 ? "día" : "días"} label="Mejor racha" loading={streak.loading} />
          <Stat icon={BarbellIcon} value={monthWorkouts} plus={monthWorkouts === WORKOUT_LIMIT} label="Entrenos este mes" loading={workouts.loading} />
        </View>
      </Rise>

      <Rise delay={100}>
        <Section>Mi cuenta</Section>
        <Card style={{ paddingVertical: space.xs }}>
          <ListRow icon={RulerIcon} title="Mis medidas y objetivo" detail={bodyDetail} right={chevron} onPress={() => router.push("/body")} />
          {gym?.app_enabled ? (
            <>
              <ListRow icon={IdentificationCardIcon} title="Mis datos en el gimnasio" detail={`Tu ficha en ${gym.gym_name}`} right={chevron} onPress={() => router.push("/gym-profile")} />
              <ListRow icon={CreditCardIcon} title="Pagos y renovación" detail="Historial y renovación en línea" right={chevron} onPress={() => router.push("/payments")} />
            </>
          ) : null}
          <ListRow
            icon={LinkIcon}
            title={gym ? "Vincular otro gimnasio" : "Vincular mi gimnasio"}
            detail="Con el código que te dan en recepción"
            right={chevron}
            onPress={() => router.push("/link")}
            last
          />
        </Card>
      </Rise>

      <Rise delay={150}>
        <Section>Autorizaciones y privacidad</Section>
        <Card style={{ paddingVertical: space.xs }}>
          {consents.map((kind, i) => (
            <View
              key={kind}
              style={{ flexDirection: "row", alignItems: "center", gap: space.md, minHeight: 64, paddingVertical: 10, borderBottomWidth: i === consents.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
              <IconTile icon={CONSENT_ICON[kind]} tone="wash" />
              <Txt size={14} style={{ flex: 1 }}>{me.consent_labels[kind]}</Txt>
              <Switch
                accessibilityLabel={me.consent_labels[kind]}
                value={me.consents[kind]}
                disabled={busy === kind}
                onValueChange={(v) => void setConsent(kind, v)}
                trackColor={{ true: c.brand, false: offTrack }}
                ios_backgroundColor={offTrack}
                thumbColor="#FFFFFF"
                {...WEB_SWITCH}
              />
            </View>
          ))}
        </Card>
        <Txt muted size={13} style={{ marginTop: space.sm }}>Puedes cambiarlas cuando quieras. Ninguna es obligatoria para usar la app.</Txt>
      </Rise>

      <Rise delay={200}>
        <Section>Legal</Section>
        <Card style={{ paddingVertical: space.xs }}>
          <ListRow
            icon={FileTextIcon}
            title="Términos y política de datos"
            right={<ArrowSquareOutIcon size={18} color={c.inkFaint} weight="bold" />}
            onPress={() => void WebBrowser.openBrowserAsync(LEGAL_URL)}
            last
          />
        </Card>

        <View style={{ gap: space.sm, marginTop: space.xl }}>
          {gym ? <Button label={`Desvincular ${gym.gym_name}`} variant="secondary" onPress={unlink} /> : null}
          <Button label="Cerrar sesión" variant="secondary" onPress={() => void signOut()} />
          <Press
            accessibilityRole="button"
            accessibilityLabel="Borrar mi cuenta"
            onPress={deleteAccount}
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, minHeight: 46, borderRadius: radius.md }}>
            <TrashIcon size={18} color={c.danger} weight="bold" />
            <Text style={{ fontFamily: fonts.bodySemi, fontSize: 15, color: c.danger }}>Borrar mi cuenta</Text>
          </Press>
        </View>

        {version ? (
          <Txt faint size={12} style={{ textAlign: "center", marginTop: space.lg, fontVariant: ["tabular-nums"] }}>
            FitConnect · versión {version}
          </Txt>
        ) : null}
      </Rise>
    </Screen>
  );
}
