import { CameraView, useCameraPermissions, type BarcodeScanningResult } from "expo-camera";
import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { CaretLeftIcon, CheckCircleIcon, FlashlightIcon, KeyboardIcon, MagnifyingGlassIcon, PlusIcon, XIcon } from "phosphor-react-native";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, KeyboardAvoidingView, Platform, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Choices, Stepper } from "@/components/controls";
import { MacroLine } from "@/components/nutrition";
import { MEALS, MEAL_LABEL } from "@/components/today";
import { Button, Chip, Notice, Press, Screen, Txt, useReducedMotion } from "@/components/ui";
import { api, ApiError, OfflineError } from "@/lib/api";
import { bogotaToday, entryFor, logMeal, mealNow } from "@/lib/meals";
import { fonts, motion, radius, space, useColors } from "@/lib/theme";
import type { Food, MealKey } from "@/lib/types";

const NATIVE = Platform.OS !== "web";
const FRAME_H = 150;

type Found = { kind: "found"; food: Food; code: string } | { kind: "missing"; code: string } | null;

/**
 * Escáner en lote: lee un código, muestra el producto en una hoja sobre la
 * cámara y, al agregarlo, queda listo para el siguiente sin salir.
 */
export default function Scan() {
  const params = useLocalSearchParams<{ meal?: MealKey; day?: string }>();
  const day = params.day || bogotaToday();
  const c = useColors();
  const insets = useSafeAreaInsets();
  const reduced = useReducedMotion();
  const [permission, request] = useCameraPermissions();
  const [torch, setTorch] = useState(false);
  const [found, setFound] = useState<Found>(null);
  const [error, setError] = useState<string | null>(null);
  const [meal, setMeal] = useState<MealKey>(params.meal ?? mealNow());
  const [grams, setGrams] = useState(100);
  const [added, setAdded] = useState(0);
  const [saving, setSaving] = useState(false);
  const [typing, setTyping] = useState(false);
  const [code, setCode] = useState("");
  const busy = useRef(false);
  const last = useRef<{ code: string; at: number } | null>(null);
  const line = useRef(new Animated.Value(0)).current;
  const sheet = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (reduced) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(line, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE }),
        Animated.timing(line, { toValue: 0, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: NATIVE }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [line, reduced]);

  useEffect(() => {
    Animated.timing(sheet, {
      toValue: found ? 1 : 0,
      duration: found ? 420 : 200,
      easing: found ? motion.drawer : motion.out,
      useNativeDriver: NATIVE,
    }).start();
  }, [found, sheet]);

  const lookup = async (raw: string) => {
    const value = raw.trim();
    if (busy.current || found || !/^\d{8,14}$/.test(value)) return;
    // La cámara lee el mismo código varias veces por segundo.
    if (last.current && last.current.code === value && Date.now() - last.current.at < 3000) return;
    busy.current = true;
    last.current = { code: value, at: Date.now() };
    setError(null);
    if (NATIVE) void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => undefined);
    try {
      const food = await api<Food>(`/api/v1/me/foods/barcode/${value}`);
      const portion = food.portions.find((p) => p.label !== "100 g") ?? food.portions[0];
      setGrams(Math.round(portion?.grams ?? 100));
      setFound({ kind: "found", food, code: value });
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) setFound({ kind: "missing", code: value });
      else setError(e instanceof OfflineError ? "Sin conexión: el escáner necesita internet para buscar el producto." : "No pudimos buscar el producto. Intenta otra vez.");
    } finally {
      busy.current = false;
    }
  };

  const add = async () => {
    if (found?.kind !== "found") return;
    setSaving(true);
    await logMeal(entryFor(found.food, grams, meal, day));
    setSaving(false);
    setAdded((n) => n + 1);
    setFound(null);
  };

  if (!permission) return <Screen edges={["bottom"]}><Txt muted>Preparando la cámara…</Txt></Screen>;
  if (!permission.granted) {
    return (
      <Screen edges={["top", "bottom"]}>
        <Txt style={{ marginBottom: space.lg }}>Para leer el código de barras necesitamos permiso para usar la cámara.</Txt>
        <Button label="Dar permiso" onPress={() => void request()} />
        <Button label="Escribir el código" variant="secondary" icon={KeyboardIcon} onPress={() => setTyping(true)} style={{ marginTop: space.sm }} />
        {typing ? <CodeInput value={code} onChange={setCode} onSubmit={() => void lookup(code)} /> : null}
        {found?.kind === "found" ? <Notice tone="ok">{found.food.name}: ábrelo desde Agregar alimento.</Notice> : null}
      </Screen>
    );
  }

  const read = found?.kind === "found";
  const portion = found?.kind === "found" ? found.food.portions.find((p) => p.label !== "100 g") : undefined;
  const f = found?.kind === "found" ? found.food : null;
  const scale = grams / 100;

  return (
    <View style={{ flex: 1, backgroundColor: "#0E0B09" }}>
      <CameraView
        style={{ flex: 1 }}
        facing="back"
        enableTorch={torch}
        barcodeScannerSettings={{ barcodeTypes: ["ean13", "ean8", "upc_a", "upc_e"] }}
        onBarcodeScanned={found ? undefined : ({ data }: BarcodeScanningResult) => void lookup(data)}
      />

      <View pointerEvents="box-none" style={{ position: "absolute", top: insets.top + space.sm, left: space.lg, right: space.lg, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
        <Press accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.back()} scaleTo={0.92} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" }}>
          <CaretLeftIcon size={22} color="#FFFFFF" weight="bold" />
        </Press>
        {added ? (
          <Press accessibilityRole="button" accessibilityLabel={`${added} agregados. Ver el día`} onPress={() => router.back()} style={{ flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "#FFFFFF", borderRadius: 999, paddingHorizontal: 14, minHeight: 40 }}>
            <CheckCircleIcon size={18} color="#15803D" weight="fill" />
            <Text style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: "#1C1917" }}>{added} {added === 1 ? "agregado" : "agregados"} · Listo</Text>
          </Press>
        ) : (
          <Text style={{ fontFamily: fonts.display, fontSize: 18, color: "#FFFFFF" }}>Escanear</Text>
        )}
        <Press accessibilityRole="button" accessibilityLabel={torch ? "Apagar linterna" : "Encender linterna"} accessibilityState={{ selected: torch }} onPress={() => setTorch((v) => !v)} scaleTo={0.92} style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: torch ? "#FFFFFF" : "rgba(0,0,0,0.45)", alignItems: "center", justifyContent: "center" }}>
          <FlashlightIcon size={21} color={torch ? "#1C1917" : "#FFFFFF"} weight={torch ? "fill" : "regular"} />
        </Press>
      </View>

      <View pointerEvents="none" style={{ position: "absolute", left: 40, right: 40, top: "30%", height: FRAME_H }}>
        <Corners color={read || found?.kind === "missing" ? (read ? "#6FCF8E" : "#E9B35A") : "#FFFFFF"} />
        {!found ? (
          <Animated.View
            style={{
              position: "absolute",
              left: 14,
              right: 14,
              height: 2,
              borderRadius: 1,
              backgroundColor: c.brand,
              opacity: 0.9,
              transform: [{ translateY: line.interpolate({ inputRange: [0, 1], outputRange: [16, FRAME_H - 18] }) }],
            }}
          />
        ) : null}
      </View>

      {!found ? (
        <View style={{ position: "absolute", left: space.lg, right: space.lg, bottom: insets.bottom + space.xl, gap: space.md }}>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 15, color: "#FFFFFF", textAlign: "center" }}>
            {added ? "Listo para el siguiente producto" : "Apunta al código de barras del empaque"}
          </Text>
          {typing ? (
            <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
              <CodeInput value={code} onChange={setCode} onSubmit={() => void lookup(code)} onClose={() => setTyping(false)} dark />
            </KeyboardAvoidingView>
          ) : (
            <Press accessibilityRole="button" onPress={() => setTyping(true)} style={{ alignSelf: "center", flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(0,0,0,0.45)", borderRadius: 999, paddingHorizontal: 16, minHeight: 44 }}>
              <KeyboardIcon size={18} color="#FFFFFF" />
              <Text style={{ fontFamily: fonts.bodySemi, fontSize: 14, color: "#FFFFFF" }}>Escribir código</Text>
            </Press>
          )}
        </View>
      ) : null}

      <Animated.View
        pointerEvents={found ? "auto" : "none"}
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: c.card,
          borderTopLeftRadius: radius.xl,
          borderTopRightRadius: radius.xl,
          paddingHorizontal: space.xl,
          paddingTop: space.md,
          paddingBottom: insets.bottom + space.lg,
          gap: space.md,
          transform: [{ translateY: sheet.interpolate({ inputRange: [0, 1], outputRange: [520, 0] }) }],
        }}>
        <View style={{ alignItems: "center" }}>
          <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: c.lineStrong }} />
        </View>
        {f ? (
          <>
            <View style={{ flexDirection: "row", alignItems: "flex-start", gap: space.md }}>
              <View style={{ flex: 1, gap: 4 }}>
                <Text style={{ fontFamily: fonts.display, fontSize: 21, lineHeight: 25, color: c.ink }} numberOfLines={2}>{f.name}</Text>
                <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center", flexWrap: "wrap" }}>
                  {f.brand ? <Txt muted size={13.5}>{f.brand}</Txt> : null}
                  <Chip tone="ok" icon={CheckCircleIcon} label="Código leído" />
                </View>
              </View>
              <Press accessibilityRole="button" accessibilityLabel="Descartar y seguir escaneando" onPress={() => setFound(null)} scaleTo={0.9} style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c.muted, alignItems: "center", justifyContent: "center" }}>
                <XIcon size={18} color={c.inkMuted} weight="bold" />
              </Press>
            </View>
            <Stepper value={grams} onChange={setGrams} />
            {portion ? (
              <Txt muted size={12.5} style={{ textAlign: "center", marginTop: -space.sm }}>
                {portion.label} = {Math.round(portion.grams)} g
              </Txt>
            ) : null}
            <MacroLine kcal={f.kcal * scale} protein={f.protein_g * scale} carbs={f.carbs_g * scale} fat={f.fat_g * scale} />
            <Choices options={MEALS.map((m) => ({ value: m.key, label: m.label }))} value={meal} onChange={setMeal} />
            <Button label={`Agregar a ${MEAL_LABEL[meal].toLowerCase()}`} icon={PlusIcon} onPress={() => void add()} loading={saving} size="lg" />
            <Txt faint size={11.5} style={{ textAlign: "center" }}>{f.origin ?? "Open Food Facts"}</Txt>
          </>
        ) : found?.kind === "missing" ? (
          <>
            <Text style={{ fontFamily: fonts.display, fontSize: 21, color: c.ink }}>No encontramos ese producto</Text>
            <Txt muted size={14}>Código {found.code}. Créalo con los datos de la etiqueta y la próxima vez aparece solo.</Txt>
            <Button
              label="Crear con la etiqueta"
              onPress={() => router.push({ pathname: "/create-food", params: { meal, day, barcode: found.code } })}
              size="lg"
            />
            <Button label="Seguir escaneando" variant="secondary" icon={MagnifyingGlassIcon} onPress={() => setFound(null)} />
          </>
        ) : null}
      </Animated.View>
    </View>
  );
}

function Corners({ color }: { color: string }) {
  const L = 28;
  const W = 4;
  const base = { position: "absolute" as const, width: L, height: L, borderColor: color };
  return (
    <>
      <View style={[base, { left: 0, top: 0, borderLeftWidth: W, borderTopWidth: W, borderTopLeftRadius: 16 }]} />
      <View style={[base, { right: 0, top: 0, borderRightWidth: W, borderTopWidth: W, borderTopRightRadius: 16 }]} />
      <View style={[base, { left: 0, bottom: 0, borderLeftWidth: W, borderBottomWidth: W, borderBottomLeftRadius: 16 }]} />
      <View style={[base, { right: 0, bottom: 0, borderRightWidth: W, borderBottomWidth: W, borderBottomRightRadius: 16 }]} />
    </>
  );
}

function CodeInput({ value, onChange, onSubmit, onClose, dark }: { value: string; onChange: (v: string) => void; onSubmit: () => void; onClose?: () => void; dark?: boolean }) {
  const c = useColors();
  const ok = /^\d{8,14}$/.test(value);
  return (
    <View style={{ flexDirection: "row", gap: space.sm, alignItems: "center", backgroundColor: dark ? "#FFFFFF" : c.card, borderRadius: radius.row, padding: 6, marginTop: space.sm }}>
      <TextInput
        accessibilityLabel="Código de barras"
        value={value}
        onChangeText={(t) => onChange(t.replace(/\D/g, "").slice(0, 14))}
        keyboardType="number-pad"
        autoFocus
        placeholder="7702011045123"
        placeholderTextColor="#A8A29E"
        onSubmitEditing={() => ok && onSubmit()}
        style={{ flex: 1, minHeight: 44, paddingHorizontal: 10, fontFamily: fonts.bodyMedium, fontSize: 17, color: "#1C1917", letterSpacing: 1, fontVariant: ["tabular-nums"] }}
      />
      <Button label="Buscar" onPress={onSubmit} disabled={!ok} style={{ minHeight: 44 }} />
      {onClose ? (
        <Press accessibilityRole="button" accessibilityLabel="Cerrar" onPress={onClose} style={{ width: 40, height: 44, alignItems: "center", justifyContent: "center" }}>
          <XIcon size={18} color="#57534E" />
        </Press>
      ) : null}
    </View>
  );
}
