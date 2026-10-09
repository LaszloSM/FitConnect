import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import { router, useLocalSearchParams } from "expo-router";
import { useRef, useState } from "react";
import { View } from "react-native";

import { Button, Notice, Screen, Txt } from "@/components/ui";
import { api, ApiError } from "@/lib/api";
import { radius, space } from "@/lib/theme";
import type { Food } from "@/lib/types";

/** Lee el código de barras de un empaque y busca el producto (Open Food Facts). */
export default function Scan() {
  const { meal, day } = useLocalSearchParams<{ meal?: string; day?: string }>();
  const [permission, request] = useCameraPermissions();
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const onScan = async ({ data }: BarcodeScanningResult) => {
    if (busy.current || !/^\d{8,14}$/.test(data)) return;
    busy.current = true;
    try {
      await api<Food>(`/api/v1/me/foods/barcode/${data}`);
      router.replace({ pathname: "/add-food", params: { meal: meal ?? "snack", day: day ?? "", barcode: data } });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        router.replace({ pathname: "/create-food", params: { meal: meal ?? "snack", day: day ?? "", barcode: data } });
      } else {
        setError("No pudimos buscar el producto. Revisa tu conexión.");
        busy.current = false;
      }
    }
  };

  if (!permission) return <Screen edges={["bottom"]}><Txt muted>Preparando la cámara…</Txt></Screen>;
  if (!permission.granted) {
    return (
      <Screen edges={["bottom"]}>
        <Txt style={{ marginBottom: space.lg }}>Para leer el código de barras necesitamos permiso para usar la cámara.</Txt>
        <Button label="Dar permiso" onPress={() => void request()} />
      </Screen>
    );
  }
  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"] }}
        onBarcodeScanned={onScan}
      />
      <View style={{ position: "absolute", left: space.xl, right: space.xl, top: "38%", height: 140, borderRadius: radius.lg, borderWidth: 3, borderColor: "#FFFFFF" }} pointerEvents="none" />
      <View style={{ position: "absolute", left: space.lg, right: space.lg, bottom: 48 }}>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <Txt style={{ color: "#FFFFFF", textAlign: "center" }}>Apunta al código de barras del empaque</Txt>
      </View>
    </View>
  );
}
