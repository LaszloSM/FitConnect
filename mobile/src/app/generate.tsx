import * as Crypto from "expo-crypto";
import { router, useLocalSearchParams } from "expo-router";
import { CheckCircleIcon, LightningIcon, SparkleIcon } from "phosphor-react-native";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Platform, Pressable, Text, View } from "react-native";

import { Check, Choices, Segmented, Skeleton } from "@/components/controls";
import { Button, Card, Notice, Screen, Section, Txt } from "@/components/ui";
import { api, ApiError, OfflineError } from "@/lib/api";
import { fonts, radius, space, useColors } from "@/lib/theme";
import type { PlanJob, PlanOptions, Restriction } from "@/lib/types";
import { useCached } from "@/lib/useCached";

type Kind = "meals" | "training";
type Engine = "auto" | "ai";
type Level = "beginner" | "intermediate" | "advanced";
type Place = "gym" | "home";
type Focus = "general" | "strength" | "hypertrophy" | "fat_loss";

const LEVELS: { value: Level; label: string }[] = [
  { value: "beginner", label: "Empezando" },
  { value: "intermediate", label: "Intermedio" },
  { value: "advanced", label: "Avanzado" },
];
const FOCUS: { value: Focus; label: string }[] = [
  { value: "general", label: "Estar en forma" },
  { value: "hypertrophy", label: "Ganar músculo" },
  { value: "strength", label: "Más fuerza" },
  { value: "fat_loss", label: "Bajar grasa" },
];

/**
 * «Generar plan»: preguntas cortas, el motor (automático gratis o con IA por
 * un crédito) y la espera en fila. La IA solo devuelve datos: el servidor los
 * valida y recalcula, y si algo falla entrega el automático y devuelve el crédito.
 */
export default function Generate() {
  const params = useLocalSearchParams<{ kind?: Kind }>();
  const c = useColors();
  const opts = useCached<PlanOptions>("/api/v1/me/plans/options");
  const [kind, setKind] = useState<Kind>(params.kind === "training" ? "training" : "meals");
  const [engine, setEngine] = useState<Engine>("auto");
  const [mealsPerDay, setMealsPerDay] = useState("4");
  const [restrictions, setRestrictions] = useState<Restriction[]>([]);
  const [days, setDays] = useState("3");
  const [level, setLevel] = useState<Level>("beginner");
  const [place, setPlace] = useState<Place>("gym");
  const [minutes, setMinutes] = useState("45");
  const [focus, setFocus] = useState<Focus>("general");
  const [eating, setEating] = useState(false);
  const [medical, setMedical] = useState(false);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [job, setJob] = useState<PlanJob | null>(null);
  const requestId = useRef<string>(Crypto.randomUUID());

  const o = opts.data;
  const blocked = o ? (kind === "meals" ? o.meals_blocked : o.training_blocked) : null;
  const aiReady = Boolean(o?.ai_available) && (o?.credits.balance ?? 0) > 0;
  const needsConsent = engine === "ai" && o && !o.ai_consent;

  useEffect(() => {
    if (o && engine === "ai" && !aiReady) setEngine("auto");
  }, [o, engine, aiReady]);

  // Espera en fila: consulta cada 2 s hasta que el plan esté o falle.
  useEffect(() => {
    if (!job || job.status === "done" || job.status === "failed") return;
    const t = setTimeout(() => {
      api<PlanJob>(`/api/v1/me/plans/jobs/${job.id}`)
        .then(setJob)
        .catch(() => setJob({ ...job }));
    }, 2000);
    return () => clearTimeout(t);
  }, [job]);

  useEffect(() => {
    if (job?.status === "done" && job.plan) router.replace({ pathname: "/plan/[id]", params: { id: job.plan.id, note: job.engine === "auto" && job.message ? `${job.message}. Te armamos el automático y te devolvimos el crédito.` : "" } });
  }, [job]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      if (needsConsent) {
        if (!consent) {
          setError("Marca la autorización para usar la IA, o elige el plan automático.");
          return;
        }
        await api("/api/v1/me/consents", { method: "POST", json: { kind: "ai_plans", granted: true } });
      }
      const r = await api<PlanJob>("/api/v1/me/plans/generate", {
        method: "POST",
        json: {
          id: requestId.current,
          kind,
          engine,
          meals: kind === "meals" ? { meals_per_day: Number(mealsPerDay), restrictions } : undefined,
          training: kind === "training" ? { days_per_week: Number(days), level, place, minutes: Number(minutes), focus } : undefined,
          screening: { eating_disorder: kind === "meals" && eating, medical },
        },
      });
      setJob(r);
    } catch (e) {
      requestId.current = Crypto.randomUUID();
      if (e instanceof OfflineError) setError("Generar un plan necesita internet.");
      else if (e instanceof ApiError && e.status === 422 && (eating || medical)) setError(e.message);
      else setError((e as Error).message);
      if (e instanceof ApiError && (e.status === 402 || e.status === 503)) {
        setEngine("auto");
        void opts.reload();
      }
    } finally {
      setBusy(false);
    }
  };

  if (job && job.status !== "done") return <Waiting job={job} onBack={() => { setJob(null); requestId.current = Crypto.randomUUID(); }} />;

  return (
    <Screen edges={["bottom"]}>
      <Segmented
        options={[
          { value: "meals", label: "Comidas" },
          { value: "training", label: "Entreno" },
        ]}
        value={kind}
        onChange={(k) => {
          setKind(k);
          setError(null);
        }}
        style={{ marginBottom: space.lg }}
      />

      {!o && !opts.error ? (
        <View style={{ gap: space.md }}>
          <Skeleton height={20} width="60%" />
          <Skeleton height={48} />
          <Skeleton height={48} />
          <Skeleton height={120} />
        </View>
      ) : null}
      {opts.error && !o ? <Notice tone="danger">{opts.error}</Notice> : null}

      {o && blocked ? (
        <Card style={{ gap: space.md }}>
          <Txt weight="semi" size={16}>Falta un paso</Txt>
          <Txt muted>{blocked}</Txt>
          <Button label="Ir a Mis medidas" variant="secondary" onPress={() => router.push("/body")} />
        </Card>
      ) : null}

      {o && !blocked ? (
        <>
          {kind === "meals" ? (
            <>
              {o.targets ? (
                <Txt muted style={{ marginBottom: space.md }}>
                  Se arma con tu meta de {Math.round(o.targets.kcal).toLocaleString("es-CO")} kcal y {Math.round(o.targets.protein_g)} g de proteína, con alimentos de aquí.
                </Txt>
              ) : null}
              <Question label="¿Cuántas comidas al día?">
                <Choices options={["3", "4", "5"].map((v) => ({ value: v, label: v }))} value={mealsPerDay} onChange={setMealsPerDay} />
              </Question>
              <Question label="¿Algo que no comas?" hint="Opcional. Puedes marcar varias.">
                <Choices
                  multiple
                  options={(Object.keys(o.restriction_labels) as Restriction[]).map((k) => ({ value: k, label: o.restriction_labels[k] }))}
                  value={restrictions}
                  onChange={(v) => setRestrictions(restrictions.includes(v) ? restrictions.filter((x) => x !== v) : [...restrictions, v])}
                />
              </Question>
            </>
          ) : (
            <>
              {o.parq_flag ? <Notice tone="warn">Tu cuestionario de salud tiene alertas: el plan sale con cargas suaves. Consulta a tu médico antes de subir la intensidad.</Notice> : null}
              <Question label="¿Cuántos días a la semana?">
                <Choices options={["2", "3", "4", "5", "6"].map((v) => ({ value: v, label: v }))} value={days} onChange={setDays} />
              </Question>
              <Question label="¿Cuánto tiempo por sesión?">
                <Choices options={["30", "45", "60", "90"].map((v) => ({ value: v, label: `${v} min` }))} value={minutes} onChange={setMinutes} />
              </Question>
              <Question label="¿Dónde entrenas?">
                <Segmented options={[{ value: "gym", label: "En el gimnasio" }, { value: "home", label: "En casa" }]} value={place} onChange={setPlace} />
              </Question>
              <Question label="Tu experiencia">
                <Choices options={LEVELS} value={level} onChange={setLevel} />
              </Question>
              <Question label="¿Qué buscas?">
                <Choices options={FOCUS} value={focus} onChange={setFocus} />
              </Question>
            </>
          )}

          <Section>Antes de armarlo</Section>
          <Card style={{ gap: 2 }}>
            {kind === "meals" ? (
              <Check checked={eating} onChange={setEating}>Tengo o he tenido un trastorno de la conducta alimentaria (anorexia, bulimia, atracones).</Check>
            ) : null}
            <Check checked={medical} onChange={setMedical}>Estoy en embarazo o lactancia, o tengo una enfermedad crónica o una lesión.</Check>
          </Card>
          {eating || medical ? (
            <Txt muted size={13} style={{ marginTop: space.sm }}>Con esto no armamos un plan automático: te diremos a quién acudir.</Txt>
          ) : null}

          <Section>¿Cómo lo armamos?</Section>
          <View style={{ gap: space.sm }}>
            <EngineCard
              selected={engine === "auto"}
              onPress={() => setEngine("auto")}
              icon={<LightningIcon size={22} color={engine === "auto" ? c.brandInk : c.inkMuted} weight="bold" />}
              title="Automático"
              tag="Gratis"
              body="Al instante. Reglas de nutrición y entrenamiento con base científica sobre tus metas."
            />
            <EngineCard
              selected={engine === "ai"}
              disabled={!aiReady}
              onPress={() => setEngine("ai")}
              icon={<SparkleIcon size={22} color={engine === "ai" ? c.brandInk : c.inkMuted} weight="bold" />}
              title="Con IA"
              tag={o.ai_available ? `1 crédito · tienes ${o.credits.balance}` : "No disponible"}
              body={
                !o.ai_available
                  ? "La IA no está activa por ahora. El automático funciona igual de bien para empezar."
                  : o.credits.balance <= 0
                    ? `Se te acabaron los créditos de esta semana. El lunes recibes ${o.credits.weekly_free} gratis.`
                    : "Más variado y adaptado a lo que respondiste. Si hay mucha gente puede tardar unos minutos."
              }
            />
          </View>
          {needsConsent ? (
            <Card style={{ marginTop: space.sm }}>
              <Check checked={consent} onChange={setConsent}>
                Autorizo enviar a un servicio de IA de Google mis datos anónimos: edad en rango, sexo, peso y talla aproximados, objetivo y metas. Nunca mi nombre, correo ni gimnasio.
              </Check>
            </Card>
          ) : null}

          {error ? <View style={{ marginTop: space.lg }}><Notice tone={eating || medical ? "info" : "danger"}>{error}</Notice></View> : null}
          <Button label={engine === "ai" ? "Generar con IA" : "Generar plan"} onPress={submit} loading={busy} style={{ marginTop: space.xl }} />
          <Txt muted size={12} style={{ marginTop: space.md }}>
            Es orientación general, no reemplaza a un profesional de la salud. Ajusta el plan si sientes dolor o malestar.
          </Txt>
        </>
      ) : null}
    </Screen>
  );
}

function Question({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: space.sm, marginBottom: space.lg }}>
      <View style={{ gap: 2 }}>
        <Txt weight="semi">{label}</Txt>
        {hint ? <Txt muted size={13}>{hint}</Txt> : null}
      </View>
      {children}
    </View>
  );
}

function EngineCard({ selected, disabled, onPress, icon, title, tag, body }: { selected: boolean; disabled?: boolean; onPress: () => void; icon: React.ReactNode; title: string; tag: string; body: string }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        { flexDirection: "row", gap: space.md, padding: space.lg, borderRadius: radius.lg, borderWidth: selected ? 2 : 1, borderColor: selected ? c.brand : c.line, backgroundColor: c.card, opacity: disabled ? 0.6 : 1 },
        pressed && { transform: [{ scale: 0.98 }] },
      ]}>
      <View style={{ width: 40, height: 40, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: selected ? c.brandMuted : c.muted }}>{icon}</View>
      <View style={{ flex: 1, gap: 4 }}>
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: space.sm }}>
          <Text style={{ fontFamily: fonts.bodySemi, fontSize: 16, color: c.ink }}>{title}</Text>
          <Text style={{ fontFamily: fonts.bodyMedium, fontSize: 13, color: c.inkMuted }}>{tag}</Text>
        </View>
        <Txt muted size={14}>{body}</Txt>
      </View>
      {selected ? <CheckCircleIcon size={22} color={c.brandInk} weight="fill" /> : <View style={{ width: 22 }} />}
    </Pressable>
  );
}

/** Espera en fila: la posición y una barra que avanza sin prometer un tiempo. */
function Waiting({ job, onBack }: { job: PlanJob; onBack: () => void }) {
  const c = useColors();
  const x = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.timing(x, { toValue: 1, duration: 1400, easing: Easing.inOut(Easing.quad), useNativeDriver: Platform.OS !== "web" }));
    loop.start();
    return () => loop.stop();
  }, [x]);

  const failed = job.status === "failed";
  const title = failed ? "No se pudo armar el plan" : job.status === "running" ? "Armando tu plan…" : job.position && job.position > 1 ? `Hay ${job.position - 1} ${job.position - 1 === 1 ? "persona" : "personas"} antes que tú` : "Eres el siguiente";
  const body = failed
    ? job.message ?? "Algo falló de nuestro lado. El crédito te lo devolvimos."
    : job.status === "running"
      ? "La IA propone y nosotros revisamos cada alimento y cada cifra antes de guardarlo."
      : "A esta hora hay mucha gente pidiendo planes. Puedes salir: el plan queda en Mis planes cuando esté.";

  return (
    <Screen edges={["bottom"]}>
      <Card style={{ gap: space.md, marginTop: space.xl }}>
        <Text accessibilityRole="header" accessibilityLiveRegion="polite" style={{ fontFamily: fonts.display, fontSize: 24, lineHeight: 29, color: c.ink }}>
          {title}
        </Text>
        <Txt muted>{body}</Txt>
        {!failed ? (
          <View accessibilityElementsHidden style={{ height: 6, borderRadius: 3, backgroundColor: c.muted, overflow: "hidden" }}>
            <Animated.View
              style={{
                width: "40%",
                height: 6,
                borderRadius: 3,
                backgroundColor: c.brand,
                transform: [{ translateX: x.interpolate({ inputRange: [0, 1], outputRange: [-140, 360] }) }],
              }}
            />
          </View>
        ) : null}
      </Card>
      {failed ? (
        <Button label="Volver a intentar" onPress={onBack} style={{ marginTop: space.xl }} />
      ) : (
        <Button label="Ir a Mis planes" variant="secondary" onPress={() => router.replace("/plans")} style={{ marginTop: space.xl }} />
      )}
    </Screen>
  );
}
