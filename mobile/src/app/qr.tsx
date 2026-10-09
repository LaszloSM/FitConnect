import * as Brightness from "expo-brightness";
import { router } from "expo-router";
import { XIcon } from "phosphor-react-native";
import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, Text, View } from "react-native";
import QRCode from "react-native-qrcode-svg";
import { SafeAreaView } from "react-native-safe-area-context";

import { Chip, Notice, Txt } from "@/components/ui";
import { api, OfflineError } from "@/lib/api";
import { STATUS_TONE, savedQr, stripQr } from "@/lib/gym";
import { qrPayload } from "@/lib/qr";
import { useSession } from "@/lib/session";
import { cache } from "@/lib/storage";
import { fonts, radius, space, useColors } from "@/lib/theme";
import type { GymSummary, QrInfo } from "@/lib/types";

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
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Cerrar"
          onPress={() => router.back()}
          hitSlop={12}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: c.muted, alignItems: "center", justifyContent: "center" }}>
          <XIcon size={22} color={c.ink} weight="bold" />
        </Pressable>
      </View>

      <View style={{ flex: 1, alignItems: "center", paddingHorizontal: space.xl, gap: space.lg }}>
        <View style={{ alignItems: "center", gap: 6 }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 28, color: c.ink, textAlign: "center" }}>
            {summary?.member.full_name ?? "Mi QR de entrada"}
          </Text>
          <Txt muted>{gym?.gym_name}</Txt>
          {summary ? <Chip tone={STATUS_TONE[summary.membership.status]} label={summary.membership.status_label} style={{ alignSelf: "center" }} /> : null}
        </View>

        {error ? <Notice tone="warn">{error}</Notice> : null}

        {code ? (
          <>
            {/* Fondo blanco fijo: el lector necesita contraste aunque el celular esté en modo oscuro. */}
            <View accessibilityLabel="Código QR de entrada" style={{ backgroundColor: "#FFFFFF", padding: 20, borderRadius: radius.xl }}>
              <QRCode value={code.value} size={260} color="#140E0B" backgroundColor="#FFFFFF" ecl="M" />
            </View>
            <View style={{ width: 260, height: 6, borderRadius: 3, backgroundColor: c.muted, overflow: "hidden" }}>
              <View style={{ height: 6, width: `${progress * 100}%`, backgroundColor: c.brand, borderRadius: 3 }} />
            </View>
            <Txt muted size={14} style={{ textAlign: "center" }}>
              Cambia en {code.secondsLeft} s. Acércalo al lector o muéstralo en recepción. Funciona sin internet.
            </Txt>
          </>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
