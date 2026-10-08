import { router } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";

import { Button, Field, Notice, Screen, Section, Txt } from "@/components/ui";
import { api } from "@/lib/api";
import { useSession } from "@/lib/session";
import { radius, space, useColors } from "@/lib/theme";
import type { Profile } from "@/lib/types";

const GOALS: { value: NonNullable<Profile["goal"]>; label: string }[] = [
  { value: "lose_fat", label: "Bajar grasa" },
  { value: "gain_muscle", label: "Ganar músculo" },
  { value: "maintain", label: "Mantenerme" },
  { value: "performance", label: "Rendimiento" },
  { value: "health", label: "Salud" },
];

const ACTIVITY: { value: string; label: string }[] = [
  { value: "sedentary", label: "Casi nada" },
  { value: "light", label: "1 a 3 días" },
  { value: "moderate", label: "3 a 5 días" },
  { value: "active", label: "6 a 7 días" },
  { value: "very_active", label: "Intenso a diario" },
];

const SEX: { value: NonNullable<Profile["sex"]>; label: string }[] = [
  { value: "female", label: "Mujer" },
  { value: "male", label: "Hombre" },
  { value: "other", label: "Otro" },
];

function Choice<T extends string>({ options, value, onChange }: { options: { value: T; label: string }[]; value: T | null; onChange: (v: T) => void }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: space.sm }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            onPress={() => onChange(o.value)}
            style={{ paddingHorizontal: 14, minHeight: 44, justifyContent: "center", borderRadius: radius.md, borderWidth: 1, borderColor: on ? c.brand : c.line, backgroundColor: on ? c.brandMuted : c.card }}>
            <Txt size={14} weight={on ? "semi" : "regular"} style={{ color: on ? c.brandInk : c.ink }}>{o.label}</Txt>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function Body() {
  const { me, refresh } = useSession();
  const p = me?.profile;
  const [name, setName] = useState(me?.user.full_name ?? "");
  const [birth, setBirth] = useState(p?.birth_date ?? "");
  const [sex, setSex] = useState<Profile["sex"]>(p?.sex ?? null);
  const [goal, setGoal] = useState<Profile["goal"]>(p?.goal ?? null);
  const [activity, setActivity] = useState<string | null>(p?.activity_level ?? null);
  const [height, setHeight] = useState(p?.height_cm ? String(p.height_cm) : "");
  const [weight, setWeight] = useState(p?.weight_kg ? String(p.weight_kg) : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const health = Boolean(me?.consents.health);

  const save = async () => {
    setError(null);
    if (birth && !/^\d{4}-\d{2}-\d{2}$/.test(birth)) {
      setError("Escribe la fecha como AAAA-MM-DD, por ejemplo 1995-04-23.");
      return;
    }
    setBusy(true);
    try {
      await api("/api/v1/me", {
        method: "PATCH",
        json: {
          full_name: name.trim() || null,
          birth_date: birth || null,
          sex,
          goal,
          activity_level: activity,
          ...(health ? { height_cm: height ? Number(height) : null, weight_kg: weight ? Number(weight.replace(",", ".")) : null } : {}),
        },
      });
      await refresh();
      router.back();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen edges={["bottom"]}>
      {error ? <Notice tone="danger">{error}</Notice> : null}
      <Field label="Nombre" value={name} onChangeText={setName} autoComplete="name" />
      <Field label="Fecha de nacimiento" value={birth} onChangeText={setBirth} placeholder="AAAA-MM-DD" keyboardType="numbers-and-punctuation" />
      <Txt weight="semi" size={14} style={{ marginBottom: 6 }}>Sexo</Txt>
      <Choice options={SEX} value={sex} onChange={setSex} />
      <Section>Objetivo</Section>
      <Choice options={GOALS} value={goal} onChange={setGoal} />
      <Section>¿Cuánto ejercicio haces por semana?</Section>
      <Choice options={ACTIVITY} value={activity} onChange={setActivity} />

      <Section>Peso y talla</Section>
      {health ? (
        <View style={{ flexDirection: "row", gap: space.md }}>
          <View style={{ flex: 1 }}>
            <Field label="Talla (cm)" value={height} onChangeText={setHeight} keyboardType="number-pad" />
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Peso (kg)" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" />
          </View>
        </View>
      ) : (
        <Notice tone="info">Para guardar tu peso y talla, autoriza los datos de salud en Perfil › Autorizaciones.</Notice>
      )}

      <Button label="Guardar" onPress={save} loading={busy} style={{ marginTop: space.lg }} />
    </Screen>
  );
}
