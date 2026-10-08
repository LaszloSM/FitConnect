import Constants from "expo-constants";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { CaretRightIcon } from "phosphor-react-native";
import { useState } from "react";
import { Alert, Platform, Pressable, Switch, View } from "react-native";

import { Button, Card, Notice, Screen, Section, Title, Txt } from "@/components/ui";
import { api } from "@/lib/api";
import { LEGAL_URL } from "@/lib/config";
import { useSession } from "@/lib/session";
import { space, useColors } from "@/lib/theme";

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

function LinkRow({ label, onPress, last }: { label: string; onPress: () => void; last?: boolean }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={{ flexDirection: "row", alignItems: "center", paddingVertical: 14, borderBottomWidth: last ? 0 : 1, borderBottomColor: c.muted }}>
      <Txt style={{ flex: 1 }}>{label}</Txt>
      <CaretRightIcon size={18} color={c.inkMuted} />
    </Pressable>
  );
}

export default function Profile() {
  const { me, gym, refresh, signOut } = useSession();
  const c = useColors();
  const [notice, setNotice] = useState<{ tone: "ok" | "warn" | "danger"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  if (!me) return null;

  const setConsent = async (kind: "health" | "notifications", granted: boolean) => {
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

  return (
    <Screen>
      <Title sub={me.user.email}>{me.user.full_name ?? "Mi perfil"}</Title>
      {notice ? <Notice tone={notice.tone}>{notice.text}</Notice> : null}

      <Card style={{ paddingVertical: space.xs }}>
        <LinkRow label="Mis medidas y objetivo" onPress={() => router.push("/body")} />
        {gym?.app_enabled ? (
          <>
            <LinkRow label="Mis datos en el gimnasio" onPress={() => router.push("/gym-profile")} />
            <LinkRow label="Pagos y renovación" onPress={() => router.push("/payments")} />
          </>
        ) : null}
        <LinkRow label={gym ? "Vincular otro gimnasio" : "Vincular mi gimnasio"} onPress={() => router.push("/link")} last />
      </Card>

      <Section>Autorizaciones</Section>
      <Card style={{ gap: space.md }}>
        {(["health", "notifications"] as const).map((kind) => (
          <View key={kind} style={{ flexDirection: "row", alignItems: "center", gap: space.md }}>
            <Txt size={14} style={{ flex: 1 }}>{me.consent_labels[kind]}</Txt>
            <Switch
              accessibilityLabel={me.consent_labels[kind]}
              value={me.consents[kind]}
              disabled={busy === kind}
              onValueChange={(v) => void setConsent(kind, v)}
              trackColor={{ true: c.brand, false: c.line }}
              thumbColor={c.card}
            />
          </View>
        ))}
        <Txt muted size={13}>Puedes cambiarlas cuando quieras. Ninguna es obligatoria para usar la app.</Txt>
      </Card>

      <Section>Legal</Section>
      <Card style={{ paddingVertical: space.xs }}>
        <LinkRow label="Términos y política de datos" onPress={() => void WebBrowser.openBrowserAsync(LEGAL_URL)} last />
      </Card>

      <View style={{ gap: space.sm, marginTop: space.xl }}>
        {gym ? <Button label={`Desvincular ${gym.gym_name}`} variant="secondary" onPress={unlink} /> : null}
        <Button label="Cerrar sesión" variant="secondary" onPress={() => void signOut()} />
        <Button label="Borrar mi cuenta" variant="danger" onPress={deleteAccount} />
      </View>
    </Screen>
  );
}
