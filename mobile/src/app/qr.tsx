import * as Brightness from "expo-brightness";
import { router } from "expo-router";
import { WarningCircleIcon, XIcon } from "phosphor-react-native";
import { useEffect, useMemo, useState } from "react";
import { Platform, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { SafeAreaView } from "react-native-safe-area-context";

import { Bar } from "@/components/charts";
import { Chip, IconButton, Notice, Num, Rise, Txt } from "@/components/ui";
import { api, OfflineError } from "@/lib/api";
import { STATUS_TONE, savedQr, stripQr } from "@/lib/gym";
import { qrPayload } from "@/lib/qr";
import { useSession } from "@/lib/session";
import { cache } from "@/lib/storage";
import { fonts, radius, space, useColors } from "@/lib/theme";
import type { GymSummary, QrInfo } from "@/lib/types";

const QR_SIZE = 260;

/**
 * El código cambia cada 30 segundos y se calcula en el celular: funciona sin
 * internet. Una captura de pantalla deja de servir en minuto y medio.
 */
export default function QrScreen() {
  const { gym } = useSession();
  const c = useColors();
  const [info, setInfo] = useState<QrInfo | null>(null);
  const [summary, setSummary] = useState<GymSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!gym) return;
    const path = `/api/v1/me/gyms/${gym.link_id}`;
    void (async () => {
      const local = await savedQr(gym.link_id);
      if (local) setInfo(local);
      const saved = await cache.get<GymSummary>(path);
      if (saved) setSummary(saved.value);
      try {
        const fresh = await api<GymSummary>(path);
        setInfo(fresh.qr);
        setSummary(fresh);
        await cache.set(path, stripQr(fresh));
      } catch (e) {
        if (!local) setError(e instanceof OfflineError ? "Abre la app una vez con internet para activar tu QR." : (e as Error).message);
      }
    })();
  }, [gym]);

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    if (Platform.OS === "web") return;
    let previous: number | null = null;
    void Brightness.getBrightnessAsync()
      .then((b) => {
        previous = b;
        return Brightness.setBrightnessAsync(1);
      })
      .catch(() => undefined);
    return () => {
      if (previous !== null) void Brightness.setBrightnessAsync(previous).catch(() => undefined);
    };
  }, []);

  const code = useMemo(() => (info ? qrPayload(info, now) : null), [info, now]);
  const progress = code && info ? code.secondsLeft / info.period : 0;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.bg }} edges={["top", "bottom"]}>
      <View style={{ flexDirection: "row", justifyContent: "flex-end", padding: space.lg }}>
        <IconButton icon={XIcon} label="Cerrar" tone="muted" onPress={() => router.back()} />
      </View>

      <View style={{ flex: 1, alignItems: "center", paddingHorizontal: space.xl, gap: space.xl }}>
        <Rise style={{ alignItems: "center", gap: 6 }}>
          <Text
            accessibilityRole="header"
            style={{ fontFamily: fonts.display, fontSize: 28, lineHeight: 33, letterSpacing: -0.5, color: c.ink, textAlign: "center" }}>
            {summary?.member.full_name ?? "Mi QR de entrada"}
          </Text>
          {gym?.gym_name ? <Txt muted>{gym.gym_name}</Txt> : null}
          {summary ? <Chip tone={STATUS_TONE[summary.membership.status]} label={summary.membership.status_label} style={{ alignSelf: "center", marginTop: 4 }} /> : null}
        </Rise>

        {error ? <Notice tone="warn" icon={WarningCircleIcon}>{error}</Notice> : null}

        {code ? (
          <Rise delay={60} style={{ alignItems: "center", gap: space.lg, width: "100%" }}>
            {/* Fondo blanco fijo: el lector necesita contraste aunque el celular esté en modo oscuro. */}
            <View
              accessible
              accessibilityRole="image"
              accessibilityLabel="Código QR de entrada"
              style={{ backgroundColor: "#FFFFFF", padding: 20, borderRadius: radius.xl, borderWidth: 1, borderColor: c.line }}>
              <QRCode value={code.value} size={QR_SIZE} color="#140E0B" backgroundColor="#FFFFFF" ecl="M" />
            </View>

            <View style={{ width: QR_SIZE + 40, gap: space.sm }}>
              <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between" }}>
                <Txt muted size={14} weight="medium">El código cambia en</Txt>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 3 }} accessible accessibilityLabel={`${code.secondsLeft} segundos`}>
                  <Num size={24}>{code.secondsLeft}</Num>
                  <Txt muted size={14} weight="medium">s</Txt>
                </View>
              </View>
              <Bar ratio={progress} color={c.brand} height={6} />
            </View>

            <Txt muted size={14} style={{ textAlign: "center", maxWidth: QR_SIZE + 40 }}>
              Acércalo al lector o muéstralo en recepción. Funciona sin internet.
            </Txt>
          </Rise>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
