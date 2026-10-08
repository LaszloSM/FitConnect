import { router } from "expo-router";
import { CalendarCheckIcon, PaperPlaneRightIcon } from "phosphor-react-native";
import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Button, Loading, Notice, Txt } from "@/components/ui";
import { api, OfflineError } from "@/lib/api";
import { fonts, radius, space, useColors } from "@/lib/theme";
import type { AssistantState, ChatMessage, SavedPlan } from "@/lib/types";

const SUGGESTIONS = [
  "Arma un plan de 3 días para ganar músculo",
  "¿Cuánta proteína debería comer?",
  "Hazme un día de comidas con alimentos colombianos",
];

export default function Assistant() {
  const c = useColors();
  const [state, setState] = useState<AssistantState | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);

  useEffect(() => {
    api<AssistantState>("/api/v1/me/assistant")
      .then(setState)
      .catch((e) => setError(e instanceof OfflineError ? "El asistente necesita internet." : (e as Error).message));
  }, []);

  const send = async (value?: string) => {
    const msg = (value ?? text).trim();
    if (!msg || !state) return;
    setText("");
    setError(null);
    setSending(true);
    const mine: ChatMessage = { id: `tmp-${Date.now()}`, role: "user", text: msg, plan_ids: [], created_at: new Date().toISOString() };
    setState({ ...state, messages: [...state.messages, mine] });
    try {
      const r = await api<{ text: string; plans: SavedPlan[] }>("/api/v1/me/assistant/messages", { method: "POST", json: { text: msg } });
      setState((s) =>
        s && {
          ...s,
          used_today: s.used_today + 1,
          messages: [...s.messages, { id: `a-${Date.now()}`, role: "assistant", text: r.text, plan_ids: r.plans.map((p) => p.id), created_at: new Date().toISOString() }],
        },
      );
    } catch (e) {
      setError(e instanceof OfflineError ? "Sin conexión. Tu mensaje no se envió." : (e as Error).message);
      setState((s) => s && { ...s, messages: s.messages.filter((m) => m.id !== mine.id) });
      setText(msg);
    } finally {
      setSending(false);
      setTimeout(() => scroll.current?.scrollToEnd({ animated: true }), 100);
    }
  };

  if (!state) {
    return (
      <SafeAreaView edges={["bottom"]} style={{ flex: 1, backgroundColor: c.bg, padding: space.lg }}>
        {error ? <Notice tone="warn">{error}</Notice> : <Loading />}
      </SafeAreaView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
      <SafeAreaView edges={["bottom"]} style={{ flex: 1 }}>
        <ScrollView ref={scroll} contentContainerStyle={{ padding: space.lg, gap: space.md, maxWidth: 640, width: "100%", alignSelf: "center" }} onContentSizeChange={() => scroll.current?.scrollToEnd({ animated: false })}>
          <Notice tone="info">Orientación general basada en evidencia. No reemplaza a un médico ni a un nutricionista.</Notice>
          {!state.available ? <Notice tone="warn">{state.message}</Notice> : null}

          {state.available && !state.messages.length ? (
            <View style={{ gap: space.sm }}>
              <Txt weight="semi" size={16}>¿En qué te ayudo?</Txt>
              {SUGGESTIONS.map((s) => (
                <Pressable key={s} accessibilityRole="button" onPress={() => void send(s)} style={{ padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: c.line, backgroundColor: c.card }}>
                  <Txt size={14}>{s}</Txt>
                </Pressable>
              ))}
            </View>
          ) : null}

          {state.messages.map((m) => (
            <View
              key={m.id}
              style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                maxWidth: "88%",
                backgroundColor: m.role === "user" ? c.brandMuted : c.card,
                borderRadius: radius.lg,
                padding: space.md,
                gap: space.sm,
              }}>
              <Txt size={15}>{m.text}</Txt>
              {m.plan_ids.map((id) => (
                <Button key={id} label="Ver el plan" variant="secondary" icon={CalendarCheckIcon} onPress={() => router.push({ pathname: "/plan/[id]", params: { id } })} />
              ))}
            </View>
          ))}
          {sending ? <Txt muted size={14}>Pensando…</Txt> : null}
          {error ? <Notice tone="danger">{error}</Notice> : null}
        </ScrollView>

        {state.available ? (
          <View style={{ flexDirection: "row", alignItems: "flex-end", gap: space.sm, padding: space.md, borderTopWidth: 1, borderTopColor: c.line, backgroundColor: c.card }}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder="Escribe tu pregunta"
              placeholderTextColor={c.inkMuted}
              multiline
              maxLength={2000}
              accessibilityLabel="Mensaje para el asistente"
              style={{ flex: 1, minHeight: 44, maxHeight: 120, borderRadius: radius.md, backgroundColor: c.field, borderWidth: 1, borderColor: c.line, paddingHorizontal: 12, paddingVertical: 10, fontFamily: fonts.body, fontSize: 16, color: c.ink }}
            />
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Enviar"
              disabled={sending || !text.trim()}
              onPress={() => void send()}
              style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: c.brand, alignItems: "center", justifyContent: "center", opacity: sending || !text.trim() ? 0.5 : 1 }}>
              <PaperPlaneRightIcon size={20} color={c.brandContrast} weight="fill" />
            </Pressable>
          </View>
        ) : null}
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}
