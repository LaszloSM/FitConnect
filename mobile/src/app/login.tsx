import * as Device from "expo-device";
import * as WebBrowser from "expo-web-browser";
import { EnvelopeSimpleIcon, PasswordIcon, UserPlusIcon, WarningCircleIcon } from "phosphor-react-native";
import { useRef, useState } from "react";
import { KeyboardAvoidingView, Platform, Text, TextInput, View } from "react-native";

import { Check } from "@/components/controls";
import { Button, Field, IconTile, Notice, Rise, Screen, Txt } from "@/components/ui";
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

  const stepIcon = step === "email" ? EnvelopeSimpleIcon : step === "code" ? PasswordIcon : UserPlusIcon;

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <Screen edges={["top", "bottom"]}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: space.sm }} accessible accessibilityLabel="FitConnect">
          <View style={{ width: 32, height: 32, borderRadius: 9, backgroundColor: c.brand, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontFamily: fonts.displayHeavy, fontSize: 18, color: c.brandContrast, marginTop: -1 }}>F</Text>
          </View>
          <Text style={{ fontFamily: fonts.display, fontSize: 20, letterSpacing: -0.3, color: c.ink }}>FitConnect</Text>
        </View>

        <Rise key={step} style={{ marginTop: space.xxl + space.lg, marginBottom: space.xl, gap: space.md }}>
          <IconTile icon={stepIcon} tone="wash" size={48} />
          <Text accessibilityRole="header" style={{ fontFamily: fonts.display, fontSize: 32, lineHeight: 37, letterSpacing: -0.7, color: c.ink }}>
            {step === "email" ? "Entra con tu correo" : step === "code" ? "Revisa tu correo" : "Crea tu cuenta"}
          </Text>
          <Txt muted size={15.5}>
            {step === "email"
              ? "Te enviamos un código de 6 números. Sin contraseñas que olvidar."
              : step === "code"
                ? `Escribe el código que enviamos a ${email.trim()}. Vence en 10 minutos.`
                : "Es tu primera vez aquí. Solo falta esto."}
          </Txt>
        </Rise>

        {error ? <Notice tone="danger" icon={WarningCircleIcon}>{error}</Notice> : null}

        {step === "email" ? (
          <Rise delay={50}>
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
            <Button label="Enviarme el código" size="lg" onPress={sendCode} loading={busy} disabled={!email.includes("@")} style={{ marginTop: space.xs }} />
          </Rise>
        ) : null}

        {step === "code" ? (
          <Rise delay={50}>
            <Field
              ref={codeRef}
              label="Código"
              value={code}
              onChangeText={(v) => setCode(v.replace(/\D/g, "").slice(0, 6))}
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              placeholder="000000"
              style={{ fontFamily: fonts.display, fontSize: 26, letterSpacing: 8, minHeight: 58, textAlign: "center", fontVariant: ["tabular-nums"] }}
              onSubmitEditing={() => verify(false)}
            />
            <Button label="Entrar" size="lg" onPress={() => verify(false)} loading={busy} disabled={code.length !== 6} style={{ marginTop: space.xs }} />
            <Button label="Usar otro correo" variant="ghost" onPress={() => { setStep("email"); setCode(""); }} style={{ marginTop: space.sm }} />
          </Rise>
        ) : null}

        {step === "terms" ? (
          <Rise delay={50}>
            <Field label="Tu nombre" value={name} onChangeText={setName} autoComplete="name" textContentType="name" placeholder="Como quieres que te llamemos" />
            <View style={{ backgroundColor: c.muted, borderRadius: radius.row, paddingHorizontal: space.md, paddingVertical: space.xs, marginBottom: space.lg }}>
              <Check checked={accepted} onChange={setAccepted}>
                Tengo 14 años o más y acepto los{" "}
                <Text style={{ color: c.brandInk, fontFamily: fonts.bodySemi }} onPress={() => void WebBrowser.openBrowserAsync(LEGAL_URL)}>
                  términos y la política de datos
                </Text>{" "}
                de la app.
              </Check>
            </View>
            <Button label="Crear mi cuenta" size="lg" onPress={() => verify(true)} loading={busy} disabled={!accepted} />
          </Rise>
        ) : null}
      </Screen>
    </KeyboardAvoidingView>
  );
}
