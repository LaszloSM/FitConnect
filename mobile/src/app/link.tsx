import { router } from "expo-router";
import { LinkIcon, StorefrontIcon, WarningCircleIcon } from "phosphor-react-native";
import { useState } from "react";
import { View } from "react-native";

import { Button, Card, Field, Notice, Rise, Screen, Txt } from "@/components/ui";
import { api, OfflineError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { fonts, radius, space, useColors } from "@/lib/theme";
import type { GymRef } from "@/lib/types";

export default function LinkGym() {
  const { refresh, setGym } = useSession();
  const c = useColors();
  const [code, setCode] = useState("");
  const [idNumber, setIdNumber] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const gym = await api<GymRef>("/api/v1/me/links", { method: "POST", json: { code: code.trim(), id_number: idNumber.trim() } });
      setGym(gym.link_id);
      await refresh();
      router.back();
    } catch (e) {
      setError(e instanceof OfflineError ? "No hay conexión. Intenta de nuevo cuando tengas internet." : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const ready = code.replace(/\W/g, "").length >= 8 && idNumber.trim().length >= 3;

  return (
    <Screen edges={[]}>
      <Rise>
        <Card tone="peach" style={{ flexDirection: "row", gap: space.md, alignItems: "flex-start", marginBottom: space.lg }}>
          <View style={{ width: 40, height: 40, borderRadius: radius.md, backgroundColor: c.card, alignItems: "center", justifyContent: "center" }}>
            <StorefrontIcon size={20} color={c.brandInk} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Txt weight="semi" size={15}>Pide tu código en recepción</Txt>
            <Txt muted size={13.5}>Vence en 48 horas y solo sirve con tu documento.</Txt>
          </View>
        </Card>
      </Rise>

      {error ? <Notice tone="danger" icon={WarningCircleIcon}>{error}</Notice> : null}

      <Rise delay={50}>
        <Card style={{ paddingBottom: space.xs }}>
          <Field
            label="Código del gimnasio"
            value={code}
            onChangeText={(v) => setCode(v.toUpperCase())}
            autoCapitalize="characters"
            autoCorrect={false}
            placeholder="ABCD-2345"
            style={{ fontFamily: fonts.bodySemi, letterSpacing: 2 }}
          />
          <Field label="Tu número de documento" value={idNumber} onChangeText={setIdNumber} keyboardType="number-pad" placeholder="Sin puntos" />
        </Card>
      </Rise>

      <Rise delay={100}>
        <Button label="Vincular" icon={LinkIcon} size="lg" onPress={submit} loading={busy} disabled={!ready} style={{ marginTop: space.lg }} />
      </Rise>
    </Screen>
  );
}
