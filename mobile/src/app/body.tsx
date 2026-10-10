import { router } from "expo-router";
import { InfoIcon, ScalesIcon, UserIcon, WarningCircleIcon, type Icon } from "phosphor-react-native";
import { useState } from "react";
import { View } from "react-native";

import { WeightLine } from "@/components/charts";
import { Choices } from "@/components/controls";
import { Button, Card, Chip, Field, IconTile, Notice, Num, Rise, Screen, Section, Txt } from "@/components/ui";
import { api } from "@/lib/api";
import { formatDay, plural } from "@/lib/format";
import { useSession } from "@/lib/session";
import { radius, space, useColors } from "@/lib/theme";
import type { Pace, Profile, WeightPoint } from "@/lib/types";
import { useCached } from "@/lib/useCached";

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

const PACES: Record<"lose_fat" | "gain_muscle", { value: Pace; label: string; hint: string }[]> = {
  lose_fat: [
    { value: "gentle", label: "Suave · −10 %", hint: "Bajas despacio y con menos hambre. Bueno para empezar o si ya estás cerca de tu meta." },
    { value: "moderate", label: "Moderado · −20 %", hint: "El punto medio: el cambio se nota en pocas semanas sin que sea duro de llevar." },
    { value: "aggressive", label: "Fuerte · −25 %", hint: "Más rápido y más difícil de sostener. Cuida la proteína y el descanso." },
  ],
  gain_muscle: [
    { value: "lean", label: "Limpio · +5 %", hint: "Ganas músculo con poca grasa. Más lento, ideal si ya entrenas hace tiempo." },
    { value: "standard", label: "Estándar · +10 %", hint: "Ganas más rápido; algo de grasa viene con el músculo." },
  ],
};

export default function Body() {
  const { me, refresh } = useSession();
  const c = useColors();
  const p = me?.profile;
  const [name, setName] = useState(me?.user.full_name ?? "");
  const [birth, setBirth] = useState(p?.birth_date ?? "");
  const [sex, setSex] = useState<Profile["sex"]>(p?.sex ?? null);
  const [goal, setGoal] = useState<Profile["goal"]>(p?.goal ?? null);
  const [pace, setPace] = useState<Pace | null>(p?.pace ?? null);
  const [activity, setActivity] = useState<string | null>(p?.activity_level ?? null);
  const [height, setHeight] = useState(p?.height_cm ? String(p.height_cm) : "");
  const [weight, setWeight] = useState(p?.weight_kg ? String(p.weight_kg) : "");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const health = Boolean(me?.consents.health);
  const weights = useCached<{ available: boolean; points: WeightPoint[] }>(health ? "/api/v1/me/weight" : null);
  const paces = goal === "lose_fat" || goal === "gain_muscle" ? PACES[goal] : null;
  const paceHint = paces?.find((x) => x.value === pace)?.hint;

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
          pace: paces && pace && paces.some((x) => x.value === pace) ? pace : null,
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

  const points = weights.data?.points ?? [];
  const last = points[points.length - 1];

  return (
    <Screen edges={["bottom"]} footer={<Button label="Guardar" onPress={save} loading={busy} size="lg" style={{ flex: 1 }} />}>
      {error ? <Notice tone="danger" icon={WarningCircleIcon}>{error}</Notice> : null}

      <Rise>
        <Card>
          <CardHead icon={UserIcon} title="Sobre ti" />
          <Field label="Nombre" value={name} onChangeText={setName} autoComplete="name" />
          <Field label="Fecha de nacimiento" value={birth} onChangeText={setBirth} placeholder="AAAA-MM-DD" keyboardType="numbers-and-punctuation" />
          <Txt weight="semi" size={13.5} style={{ marginBottom: 6 }}>Sexo</Txt>
          <Choices options={SEX} value={sex} onChange={setSex} />
        </Card>
      </Rise>

      <Rise delay={50}>
        <Section>Objetivo</Section>
        <Card style={{ gap: space.md }}>
          <Choices options={GOALS} value={goal} onChange={setGoal} />
          {paces ? (
            <View style={{ gap: space.sm, paddingTop: space.md, borderTopWidth: 1, borderTopColor: c.line }}>
              <Txt weight="semi" size={14}>{goal === "lose_fat" ? "¿Qué tan rápido quieres bajar?" : "¿Qué tan rápido quieres subir?"}</Txt>
              <Choices options={paces} value={pace} onChange={setPace} />
              <View style={{ backgroundColor: c.muted, borderRadius: radius.row, padding: space.md }}>
                <Txt muted size={13.5}>
                  {paceHint ?? (goal === "lose_fat" ? "Si no eliges, usamos el moderado." : "Si no eliges, usamos el limpio.")}{" "}
                  Nunca bajamos de tu mínimo seguro de calorías.
                </Txt>
              </View>
            </View>
          ) : null}
        </Card>
      </Rise>

      <Rise delay={100}>
        <Section>Actividad física</Section>
        <Card style={{ gap: space.md }}>
          <Txt muted size={14}>¿Cuánto ejercicio haces por semana?</Txt>
          <Choices options={ACTIVITY} value={activity} onChange={setActivity} />
        </Card>
      </Rise>

      <Rise delay={150}>
        <Section>Peso y talla</Section>
        {health ? (
          <Card style={{ paddingBottom: space.xs }}>
            <View style={{ flexDirection: "row", gap: space.md }}>
              <View style={{ flex: 1 }}>
                <Field label="Talla (cm)" value={height} onChangeText={setHeight} keyboardType="number-pad" />
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Peso (kg)" value={weight} onChangeText={setWeight} keyboardType="decimal-pad" />
              </View>
            </View>
          </Card>
        ) : (
          <Notice tone="info" icon={InfoIcon}>Para guardar tu peso y talla, autoriza los datos de salud en Perfil › Autorizaciones y privacidad.</Notice>
        )}
      </Rise>

      {health && last ? (
        <Rise delay={200}>
          <Section>Tu peso</Section>
          <Card style={{ gap: space.md }}>
            <View style={{ flexDirection: "row", alignItems: "flex-end", justifyContent: "space-between", gap: space.md }}>
              <View style={{ gap: 2 }}>
                <Txt muted size={13}>Último pesaje · {formatDay(last.day)}</Txt>
                <View style={{ flexDirection: "row", alignItems: "baseline", gap: 4 }}>
                  <Num size={30}>{last.weight_kg.toLocaleString("es-CO")}</Num>
                  <Txt muted size={14}>kg</Txt>
                </View>
              </View>
              <Chip tone="neutral" icon={ScalesIcon} label={plural(points.length, "pesaje", "pesajes")} />
            </View>
            {points.length >= 2 ? (
              <WeightLine points={points} />
            ) : (
              <Txt muted size={14}>Guarda tu peso de nuevo en unos días y aquí verás la tendencia.</Txt>
            )}
            <Txt muted size={13}>Los puntos son cada pesaje; la línea, el promedio de los últimos 7. El peso sube y baja a diario por agua y sal: mira la línea.</Txt>
          </Card>
        </Rise>
      ) : null}
    </Screen>
  );
}

function CardHead({ icon, title }: { icon: Icon; title: string }) {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, marginBottom: space.lg }}>
      <IconTile icon={icon} tone="wash" size={36} />
      <Txt weight="semi" size={16}>{title}</Txt>
    </View>
  );
}
