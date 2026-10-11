import * as WebBrowser from "expo-web-browser";
import { CheckCircleIcon, IdentificationCardIcon, WarningCircleIcon, WarningIcon, type Icon } from "phosphor-react-native";
import { useEffect, useState } from "react";
import { Text, View } from "react-native";

import { Check } from "@/components/controls";
import { Button, Card, Chip, Field, IconTile, Loading, Notice, Press, Rise, Row, Screen, Section, Txt } from "@/components/ui";
import { api } from "@/lib/api";
import { LEGAL_URL } from "@/lib/config";
import { formatFullDay } from "@/lib/format";
import { useSession } from "@/lib/session";
import { fonts, radius, space, useColors } from "@/lib/theme";

/** Mismas preguntas que frontend/components/common/PARQForm.tsx. */
const PARQ = [
  { key: "q1", text: "¿Algún médico le ha dicho que tiene una condición cardíaca y que solo debe hacer actividad física recomendada por un médico?" },
  { key: "q2", text: "¿Siente dolor en el pecho cuando hace actividad física?" },
  { key: "q3", text: "¿En el último mes, ha tenido dolor en el pecho cuando no estaba haciendo actividad física?" },
  { key: "q4", text: "¿Pierde el equilibrio debido a mareos o alguna vez pierde el conocimiento?" },
  { key: "q5", text: "¿Tiene algún problema en los huesos o articulaciones que podría empeorar por un cambio en su actividad física?" },
  { key: "q6", text: "¿Actualmente su médico le prescribe medicamentos para la presión arterial o para el corazón?" },
  { key: "q7", text: "¿Conoce alguna otra razón por la que no debería hacer actividad física?" },
] as const;

const LABELS: Record<string, string> = {
  full_name: "Nombre",
  id_number: "Documento",
  phone: "Celular",
  email: "Correo",
  birth_date: "Nacimiento",
  eps: "EPS",
  blood_type: "RH",
  emergency_contact_name: "Contacto de emergencia",
  emergency_contact_phone: "Teléfono de emergencia",
  city: "Ciudad",
  address: "Dirección",
};

const RESULT_ICON: Record<"ok" | "warn" | "danger", Icon> = { ok: CheckCircleIcon, warn: WarningIcon, danger: WarningCircleIcon };

interface GymProfile {
  data: Record<string, string | null>;
  status: { complete: boolean; missing: string[]; labels: Record<string, string> };
  parq_done: boolean;
  consent_data: boolean;
}

function YesNo({ value, onChange, label }: { value: boolean | undefined; onChange: (v: boolean) => void; label: string }) {
  const c = useColors();
  return (
    <View style={{ flexDirection: "row", gap: space.sm }} accessibilityRole="radiogroup" accessibilityLabel={label}>
      {[true, false].map((v) => {
        const on = value === v;
        return (
          <Press
            key={String(v)}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}
            accessibilityLabel={v ? "Sí" : "No"}
            onPress={() => onChange(v)}
            style={{ minWidth: 76, minHeight: 40, paddingHorizontal: 18, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, backgroundColor: on ? c.brandMuted : c.muted }}>
            <Text style={{ fontFamily: on ? fonts.bodySemi : fonts.bodyMedium, fontSize: 14, color: on ? c.brandInk : c.inkMuted }}>{v ? "Sí" : "No"}</Text>
          </Press>
        );
      })}
    </View>
  );
}

export default function GymProfileScreen() {
  const { gym } = useSession();
  const c = useColors();
  const [profile, setProfile] = useState<GymProfile | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [parq, setParq] = useState<Record<string, boolean>>({});
  const [accept, setAccept] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ tone: "ok" | "warn" | "danger"; text: string } | null>(null);

  const load = async () => {
    if (!gym) return;
    try {
      setProfile(await api<GymProfile>(`/api/v1/me/gyms/${gym.link_id}/profile`));
    } catch (e) {
      setResult({ tone: "danger", text: (e as Error).message });
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gym?.link_id]);

  if (!profile) return <Screen edges={["bottom"]}>{result ? <Notice tone={result.tone} icon={RESULT_ICON[result.tone]}>{result.text}</Notice> : <Loading />}</Screen>;

  const missing = new Set(profile.status.missing);
  const needsEmergency = missing.has("emergency_contact");
  const fields = [
    ...(missing.has("phone") ? [["phone", "Celular", "phone-pad"]] : []),
    ...(missing.has("birth_date") ? [["birth_date", "Fecha de nacimiento (AAAA-MM-DD)", "numbers-and-punctuation"]] : []),
    ...(needsEmergency ? [["emergency_contact_name", "Contacto de emergencia", "default"], ["emergency_contact_phone", "Teléfono de emergencia", "phone-pad"]] : []),
    ...(!profile.data.eps ? [["eps", "EPS", "default"]] : []),
    ...(!profile.data.blood_type ? [["blood_type", "RH (por ejemplo O+)", "default"]] : []),
  ] as [string, string, "default" | "phone-pad" | "numbers-and-punctuation"][];
  const parqComplete = PARQ.every((q) => parq[q.key] !== undefined);

  const submit = async () => {
    if (!gym) return;
    setBusy(true);
    setResult(null);
    try {
      const body: Record<string, unknown> = { accept_data: profile.consent_data || accept };
      for (const [k] of fields) if (form[k]?.trim()) body[k] = form[k].trim();
      if (!profile.parq_done && parqComplete) body.parq_answers = parq;
      const r = await api<{ filled: string[]; parq_alert: boolean; complete: boolean }>(`/api/v1/me/gyms/${gym.link_id}/profile`, { method: "POST", json: body });
      setResult(
        r.parq_alert
          ? { tone: "warn", text: "Guardado. Respondiste «sí» en el cuestionario de salud: consulta a un médico antes de aumentar tu actividad y avísale a tu entrenador." }
          : { tone: "ok", text: r.complete ? "Listo, tu ficha está completa." : "Guardado." },
      );
      setForm({});
      await load();
    } catch (e) {
      setResult({ tone: "danger", text: (e as Error).message });
    } finally {
      setBusy(false);
    }
  };

  const canSubmit = (profile.consent_data || accept) && (fields.some(([k]) => form[k]?.trim()) || (!profile.parq_done && parqComplete) || !profile.consent_data);

  const showForm = !profile.status.complete || fields.length > 0;
  const rows = Object.entries(LABELS).filter(([k]) => profile.data[k]);

  return (
    <Screen
      edges={["bottom"]}
      footer={showForm ? <Button label="Guardar" onPress={submit} loading={busy} disabled={!canSubmit} size="lg" style={{ flex: 1 }} /> : undefined}>
      {result ? <Notice tone={result.tone} icon={RESULT_ICON[result.tone]}>{result.text}</Notice> : null}

      <Rise>
        <Card>
          <View style={{ flexDirection: "row", alignItems: "center", gap: space.md, marginBottom: space.sm }}>
            <IconTile icon={IdentificationCardIcon} tone="wash" />
            <View style={{ flex: 1, gap: 4 }}>
              <Txt weight="semi" size={16} numberOfLines={2}>{gym?.gym_name}</Txt>
              {profile.status.complete ? (
                <Chip tone="ok" icon={CheckCircleIcon} label="Ficha completa" />
              ) : (
                <Chip tone="warn" icon={WarningIcon} label="Faltan datos" />
              )}
            </View>
          </View>
          {rows.map(([k, label], i) => (
            <Row key={k} label={label} value={k === "birth_date" ? formatFullDay(profile.data[k]!) : profile.data[k]} last={i === rows.length - 1} />
          ))}
        </Card>
        <Txt muted size={13} style={{ marginTop: space.sm }}>
          Esto es lo que {gym?.gym_name} tiene registrado. Para corregir algo, pídelo en recepción.
        </Txt>
      </Rise>

      {showForm ? (
        <>
          {fields.length ? (
            <Rise delay={50}>
              <Section>Completa lo que falta</Section>
              <Card style={{ paddingBottom: space.xs }}>
                {fields.map(([k, label, kb]) => (
                  <Field key={k} label={label} keyboardType={kb} value={form[k] ?? ""} onChangeText={(v) => setForm((f) => ({ ...f, [k]: v }))} />
                ))}
              </Card>
            </Rise>
          ) : null}

          {!profile.parq_done ? (
            <Rise delay={100}>
              <Section>Cuestionario de salud (PAR-Q)</Section>
              <Card style={{ paddingVertical: space.xs }}>
                {PARQ.map((q, i) => (
                  <View key={q.key} style={{ gap: space.sm, paddingVertical: space.md, borderBottomWidth: i === PARQ.length - 1 ? 0 : 1, borderBottomColor: c.line }}>
                    <Txt size={14}>{q.text}</Txt>
                    <YesNo label={q.text} value={parq[q.key]} onChange={(v) => setParq((p) => ({ ...p, [q.key]: v }))} />
                  </View>
                ))}
              </Card>
            </Rise>
          ) : null}

          {!profile.consent_data ? (
            <Rise delay={150}>
              <Card style={{ marginTop: space.xl, paddingVertical: space.sm }}>
                <Check checked={accept} onChange={setAccept}>
                  Autorizo a {gym?.gym_name} a tratar mis datos, incluidos los de salud, según la{" "}
                  <Text style={{ color: c.brandInk, fontFamily: fonts.bodySemi }} onPress={() => void WebBrowser.openBrowserAsync(LEGAL_URL)}>
                    política de datos
                  </Text>
                  .
                </Check>
              </Card>
            </Rise>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
