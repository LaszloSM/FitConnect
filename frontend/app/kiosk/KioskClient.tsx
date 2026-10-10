/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { NumericKeypad } from "@/components/kiosk/NumericKeypad";
import { BrandMark } from "@/components/common/BrandMark";
import { CalendarDotsIcon as CalendarClock, CheckCircleIcon as CheckCircle2, SpinnerGapIcon as Loader2, XCircleIcon as XCircle, WarningIcon as AlertTriangle } from "@phosphor-icons/react";

const TOKEN_KEY = "fitconnect_kiosk_token";
const RESET_MS = 6000;

interface KioskResult {
  decision: "allowed" | "denied" | "duplicate" | "not_found";
  membership_status?: string;
  member_name?: string;
  photo_url?: string | null;
  upcoming_class?: { class_name: string; start_time: string } | null;
  message: string;
}


function resultTone(r: KioskResult): "ok" | "warn" | "danger" {
  if (r.decision === "allowed") return r.membership_status === "in_grace" ? "warn" : "ok";
  if (r.decision === "duplicate") return "warn";
  return "danger";
}

/** Marca del kiosko: superficie oscura fija, así que el isotipo va en blanco. */
function KioskMark() {
  return <BrandMark size={36} className="text-white" />;
}

export default function KioskClient() {
  const searchParams = useSearchParams();
  const [token, setToken] = useState<string | null>(null);
  const [cedula, setCedula] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<KioskResult | null>(null);
  const [deviceName, setDeviceName] = useState<string | null>(null);
  const [invalidDevice, setInvalidDevice] = useState(false);
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Token: ?device=<jwt> la primera vez → localStorage para siempre
  useEffect(() => {
    const fromUrl = searchParams.get("device");
    if (fromUrl) {
      localStorage.setItem(TOKEN_KEY, fromUrl);
      setToken(fromUrl);
      // Limpiar el token de la URL sin recargar
      window.history.replaceState({}, "", "/kiosk");
      return;
    }
    setToken(localStorage.getItem(TOKEN_KEY));
  }, [searchParams]);

  // Heartbeat + validación del dispositivo
  useEffect(() => {
    if (!token) return;
    const client = axios.create({
      baseURL: process.env.NEXT_PUBLIC_API_URL,
      headers: { Authorization: `Bearer ${token}` },
    });
    const ping = () =>
      client
        .get("/api/v1/kiosk/ping")
        .then((res) => {
          setDeviceName(res.data.device_name);
          setInvalidDevice(false);
          // Renovación deslizante del token (el backend lo emite cerca de expirar)
          if (res.data.renewed_token) {
            localStorage.setItem(TOKEN_KEY, res.data.renewed_token);
            setToken(res.data.renewed_token);
          }
        })
        .catch((err) => {
          if (err.response?.status === 401) setInvalidDevice(true);
        });
    void ping();
    const id = setInterval(ping, 60_000);
    return () => clearInterval(id);
  }, [token]);

  const scheduleReset = useCallback(() => {
    if (resetTimer.current) clearTimeout(resetTimer.current);
    resetTimer.current = setTimeout(() => setResult(null), RESET_MS);
  }, []);

  const submit = useCallback(
    async (payload: { id_number: string }) => {
      if (!token || submitting) return;
      setSubmitting(true);
      try {
        const client = axios.create({
          baseURL: process.env.NEXT_PUBLIC_API_URL,
          headers: { Authorization: `Bearer ${token}` },
        });
        const { data } = await client.post("/api/v1/kiosk/checkin", payload);
        setResult(data);
        setCedula("");
        scheduleReset();
      } catch (err: any) {
        if (err.response?.status === 401) {
          setInvalidDevice(true);
        } else {
          setResult({
            decision: "not_found",
            message: "No pudimos validar tu entrada. Acércate a recepción.",
          });
          scheduleReset();
        }
      } finally {
        setSubmitting(false);
      }
    },
    [token, submitting, scheduleReset]
  );

  // Teclado físico USB: dígitos + Enter en cualquier parte de la página
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (result) return;
      if (/^\d$/.test(e.key)) setCedula((c) => (c.length < 15 ? c + e.key : c));
      else if (e.key === "Backspace") setCedula((c) => c.slice(0, -1));
      else if (e.key === "Enter" && cedula.length >= 3) void submit({ id_number: cedula });
      else if (e.key === "Escape") setCedula("");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [cedula, result, submit]);

  if (!token || invalidDevice) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-[var(--kiosk-bg)] p-8 text-center">
        <KioskMark />
        <h1 className="text-2xl font-semibold text-white">
          {invalidDevice ? "Este kiosko fue desactivado" : "Kiosko sin configurar"}
        </h1>
        <p className="max-w-sm text-white/70">
          {invalidDevice
            ? "Genera un enlace nuevo en Configuración → Dispositivos y ábrelo en esta tablet."
            : "Abre en esta tablet el enlace que genera el panel en Configuración → Dispositivos."}
        </p>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-dvh select-none flex-col overflow-hidden bg-[var(--kiosk-bg)] p-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <KioskMark />
          <span className="text-lg font-semibold text-white">LSMFit</span>
        </div>
        {deviceName && <span className="text-sm text-white/60">{deviceName}</span>}
      </header>

      <main className="relative flex flex-1 flex-col items-center justify-center gap-6">
        <AnimatePresence mode="wait">
          {result ? (
            <ResultScreen key="result" result={result} onDismiss={() => setResult(null)} />
          ) : (
            <motion.div
              key="input"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="flex w-full max-w-md flex-col items-center gap-6"
            >
              <div className="space-y-1 text-center">
                <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
                  Digita tu cédula
                </h1>
                <p className="text-lg text-white/70">
                  y presiona Entrar
                </p>
              </div>

              <>
                  <div
                    className="flex h-16 w-full max-w-sm items-center justify-center rounded-[var(--radius-xl)] border border-white/20 bg-white/5"
                    aria-live="polite"
                    aria-label={cedula ? `Cédula digitada: ${cedula.split("").join(" ")}` : "Sin cédula digitada"}
                  >
                    <span className="font-mono text-3xl tracking-[0.25em] text-white tabular-nums">
                      {cedula || <span className="text-xl tracking-normal text-white/40">Sin digitar</span>}
                    </span>
                  </div>
                  <NumericKeypad
                    onDigit={(d) => setCedula((c) => (c.length < 15 ? c + d : c))}
                    onClear={() => setCedula("")}
                    onBackspace={() => setCedula((c) => c.slice(0, -1))}
                    disabled={submitting}
                  />
                  <button
                    type="button"
                    disabled={cedula.length < 3 || submitting}
                    onClick={() => void submit({ id_number: cedula })}
                    className="flex h-16 w-full max-w-sm items-center justify-center gap-2 rounded-[var(--radius-xl)] bg-[var(--brand-on-dark)] text-2xl font-semibold text-[var(--kiosk-bg)] transition-transform duration-150 active:scale-[0.97] disabled:opacity-40"
                  >
                    {submitting ? <Loader2 className="size-7 animate-spin" /> : "Entrar"}
                  </button>
              </>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

function ResultScreen({ result, onDismiss }: { result: KioskResult; onDismiss: () => void }) {
  const tone = resultTone(result);
  const palette = {
    ok: { icon: CheckCircle2, label: "Siga" },
    warn: { icon: AlertTriangle, label: "Siga, y recuerde pagar" },
    danger: { icon: XCircle, label: "Diríjase a recepción" },
  }[tone];
  const Icon = palette.icon;

  return (
    <motion.button
      type="button"
      onClick={onDismiss}
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
      role="status"
      aria-live="assertive"
      className="flex w-full max-w-lg flex-col items-center gap-4 rounded-[28px] p-10 text-center text-white"
      style={{ background: `var(--kiosk-${tone})` }}
    >
      {result.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={result.photo_url} alt="" className="size-24 rounded-full border-4 border-white/40 object-cover" />
      ) : (
        <Icon className="size-20" aria-hidden="true" />
      )}
      <p className="text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">{palette.label}</p>
      <p className="text-xl font-medium opacity-95">{result.message}</p>
      {result.upcoming_class && (
        <p className="flex items-center gap-2 rounded-full bg-black/20 px-4 py-1.5 text-base">
          <CalendarClock className="size-4" aria-hidden="true" />
          {result.upcoming_class.class_name} · {result.upcoming_class.start_time}
        </p>
      )}
    </motion.button>
  );
}
