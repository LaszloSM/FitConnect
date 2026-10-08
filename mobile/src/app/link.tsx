import { router } from "expo-router";
import { useState } from "react";

import { Button, Field, Notice, Screen, Txt } from "@/components/ui";
import { api, OfflineError } from "@/lib/api";
import { useSession } from "@/lib/session";
import { space } from "@/lib/theme";
import type { GymRef } from "@/lib/types";

export default function LinkGym() {
  const { refresh, setGym } = useSession();
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

  return (
    <Screen edges={[]}>
      <Txt muted style={{ marginBottom: space.lg }}>
        Pide en recepción tu código para la app. Vence en 48 horas y solo sirve con tu documento.
      </Txt>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Field
        label="Código del gimnasio"
        value={code}
        onChangeText={(v) => setCode(v.toUpperCase())}
        autoCapitalize="characters"
        autoCorrect={false}
        placeholder="ABCD-2345"
      />
      <Field label="Tu número de documento" value={idNumber} onChangeText={setIdNumber} keyboardType="number-pad" placeholder="Sin puntos" />
      <Button label="Vincular" onPress={submit} loading={busy} disabled={code.replace(/\W/g, "").length < 8 || idNumber.trim().length < 3} />
    </Screen>
  );
}
