import * as Device from "expo-device";
import * as WebBrowser from "expo-web-browser";
import { CheckIcon } from "phosphor-react-native";
import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Pressable, Text, TextInput, View } from "react-native";

import { Button, Field, Notice, Screen, Txt } from "@/components/ui";
import { api, ApiError, OfflineError } from "@/lib/api";
import { LEGAL_URL } from "@/lib/config";
import { useSession } from "@/lib/session";
import { fonts, radius, space, useColors } from "@/lib/theme";

type Step = "email" | "code" | "terms";

interface Tokens {
  access_token: string;
  refresh_token: string;
}

function message(e: unknown) {
  if (e instanceof OfflineError) return "No hay conexión. Revisa tu internet e intenta de nuevo.";
  return e instanceof Error ? e.message : "Algo salió mal. Intenta de nuevo.";
}

export default function Login() {
  const { signIn } = useSession();
  const c = useColors();
  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const codeRef = useRef<TextInput>(null);

  const sendCode = async () => {
    setError(null);
    setBusy(true);
    try {
      await api("/api/v1/app/auth/code", { method: "POST", auth: false, json: { email: email.trim() } });
      setStep("code");
      setTimeout(() => codeRef.current?.focus(), 150);
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  const verify = async (acceptTerms: boolean) => {
    setError(null);
    setBusy(true);
    try {
      const tokens = await api<Tokens>("/api/v1/app/auth/verify", {
        method: "POST",
        auth: false,
        json: {
          email: email.trim(),
          code: code.trim(),
          accept_terms: acceptTerms,
          full_name: name.trim() || undefined,
          device_name: Device.modelName ?? Platform.OS,
        },
      });
      await signIn(tokens);
    } catch (e) {
      if (e instanceof ApiError && e.code === "terms_required") setStep("terms");
      else setError(message(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen edges={["top", "bottom"]}>
        <View style={{ marginTop: space.xxl, marginBottom: space.xl, gap: space.sm }}>
          <Text style={{ fontFamily: fonts.display, fontSize: 22, color: c.brandInk }}>LSMFit</Text>
          <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 34, lineHeight: 38, color: c.ink }}>
            {step === "email" ? "Entra con tu correo" : step === "code" ? "Revisa tu correo" : "Crea tu cuenta"}
          </Text>
          <Txt muted>
            {step === "email"
              ? "Te enviamos un código de 6 números. Sin contraseñas que olvidar."
              : step === "code"
                ? `Escribe el código que enviamos a ${email.trim()}. Vence en 10 minutos.`
                : "Es tu primera vez aquí. Solo falta esto."}
          </Txt>
        </View>

        {error ? <Notice tone="danger">{error}</Notice> : null}

        {step === "email" ? (
          <>
            <Field
              label="Correo"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              textContentType="emailAddress"
              placeholder="tucorreo@ejemplo.com"
              returnKeyType="send"
              onSubmitEditing={sendCode}
            />
            <Button label="Enviarme el código" onPress={sendCode} loading={busy} disabled={!email.includes("@")} />
          </>
        ) : null}

        {step === "code" ? (
          <>
            <Field
              ref={codeRef}
              label="Código"
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              placeholder="000000"
              style={{ fontFamily: fonts.display, fontSize: 26, letterSpacing: 8 }}
              onSubmitEditing={() => verify(false)}
            />
            <Button label="Entrar" onPress={() => verify(false)} loading={busy} disabled={code.length !== 6} />
            <Button label="Usar otro correo" variant="ghost" onPress={() => { setStep("email"); setCode(""); }} style={{ marginTop: space.sm }} />
          </>
        ) : null}

        {step === "terms" ? (
          <>
            <Field label="Tu nombre" value={name} onChangeText={setName} autoComplete="name" textContentType="name" placeholder="Como quieres que te llamemos" />
            <Pressable
              accessibilityRole="checkbox"
              accessibilityState={{ checked: accepted }}
              onPress={() => setAccepted((v) => !v)}
              style={{ flexDirection: "row", gap: 12, alignItems: "flex-start", paddingVertical: space.sm, marginBottom: space.lg }}>
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: radius.sm - 2,
                  borderWidth: 1.5,
                  borderColor: accepted ? c.brand : c.line,
                  backgroundColor: accepted ? c.brand : c.field,
                  alignItems: "center",
                  justifyContent: "center",
                  marginTop: 1,
                }}>
                {accepted ? <CheckIcon size={16} color={c.brandContrast} weight="bold" /> : null}
              </View>
              <Txt size={14} style={{ flex: 1 }}>
                Tengo 14 años o más y acepto los{" "}
                <Text style={{ color: c.brandInk, fontFamily: fonts.bodySemi }} onPress={() => void WebBrowser.openBrowserAsync(LEGAL_URL)}>
                  términos y la política de datos
                </Text>{" "}
                de la app.
              </Txt>
            </Pressable>
            <Button label="Crear mi cuenta" onPress={() => verify(true)} loading={busy} disabled={!accepted} />
          </>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}
