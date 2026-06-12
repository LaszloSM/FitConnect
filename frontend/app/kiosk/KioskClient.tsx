/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import axios from "axios";
import { NumericKeypad } from "@/components/kiosk/NumericKeypad";
import { QrScanner } from "@/components/common/QrScanner";
import { BrandMark } from "@/components/common/BrandMark";
import { cn } from "@/lib/utils";
import { CalendarClock, CheckCircle2, Loader2, QrCode, XCircle, AlertTriangle, Keyboard } from "lucide-react";

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

type Mode = "keypad" | "qr";

function resultTone(r: KioskResult): "green" | "amber" | "red" {
  if (r.decision === "allowed")
    return r.membership_status === "in_grace" ? "amber" : "green";
  if (r.decision === "duplicate") return "amber";
  return "red";
}

export default function KioskClient() {
  const searchParams = useSearchParams();
  const [token, setToken] = useState<string | null>(null);
  const [cedula, setCedula] = useState("");
  const [mode, setMode] = useState<Mode>("keypad");
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
    async (payload: { id_number?: string; qr_code?: string }) => {
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
      if (mode !== "keypad" || result) return;
      if (/^\d$/.test(e.key)) setCedula((c) => (c.length < 15 ? c + e.key : c));
      else if (e.key === "Backspace") setCedula((c) => c.slice(0, -1));
      else if (e.key === "Enter" && cedula.length >= 3) void submit({ id_number: cedula });
      else if (e.key === "Escape") setCedula("");
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mode, cedula, result, submit]);

  if (!token || invalidDevice) {
    return (
      <div className="min-h-screen bg-[#0a0f0a] flex flex-col items-center justify-center gap-4 p-8 text-center">
        <BrandMark className="h-12 w-12" />
        <h1 className="text-white text-2xl font-bold">
          {invalidDevice ? "Dispositivo revocado" : "Kiosko sin configurar"}
        </h1>
        <p className="text-white/60 max-w-sm">
          {invalidDevice
            ? "Este dispositivo fue desactivado. Genera un nuevo enlace en Configuración → Kiosko."
            : "Abre en esta tablet el enlace que genera el panel en Configuración → Dispositivos kiosko."}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0f0a] flex flex-col p-6 select-none overflow-hidden relative">
      {/* Glow Volt de fondo */}
      <div
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 h-96 w-[40rem] rounded-full opacity-20 blur-3xl"
        style={{ background: "var(--color-primary)" }}
      />

      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BrandMark className="h-9 w-9" />
          <span className="text-white font-bold text-lg">FitConnect</span>
        </div>
        {deviceName && <span className="text-white/40 text-sm">{deviceName}</span>}
      </header>

      <main className="flex-1 flex flex-col items-center justify-center gap-6 relative">
        <AnimatePresence mode="wait">
          {result ? (
            <ResultScreen key="result" result={result} onDismiss={() => setResult(null)} />
          ) : (
            <motion.div
              key="input"
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.97 }}
              transition={{ duration: 0.25 }}
              className="w-full max-w-md flex flex-col items-center gap-6"
            >
              <div className="text-center space-y-1">
                <h1 className="text-white text-3xl sm:text-4xl font-extrabold">
                  {mode === "keypad" ? "Digita tu cédula" : "Escanea tu carnet"}
                </h1>
                <p className="text-white/50">
                  {mode === "keypad" ? "y presiona Entrar" : "Acerca el código QR a la cámara"}
                </p>
              </div>

              {mode === "keypad" ? (
                <>
                  <div className="h-16 w-full max-w-sm rounded-2xl border border-white/15 bg-white/5 flex items-center justify-center">
                    <span className="text-white text-3xl font-mono tracking-[0.3em]">
                      {cedula || <span className="text-white/25 tracking-normal text-xl">———</span>}
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
                    className="w-full max-w-sm h-16 rounded-2xl bg-[var(--color-primary)] text-[var(--color-primary-contrast)] text-2xl font-extrabold transition-transform active:scale-95 disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {submitting ? <Loader2 className="h-7 w-7 animate-spin" /> : "Entrar"}
                  </button>
                </>
              ) : (
                <div className="w-full max-w-sm rounded-2xl overflow-hidden border border-white/15">
                  <QrScanner onDecode={(code) => void submit({ qr_code: code })} paused={submitting} />
                </div>
              )}

              <button
                type="button"
                onClick={() => setMode(mode === "keypad" ? "qr" : "keypad")}
                className="flex items-center gap-2 text-white/50 hover:text-white text-sm transition-colors"
              >
                {mode === "keypad" ? <QrCode className="h-4 w-4" /> : <Keyboard className="h-4 w-4" />}
                {mode === "keypad" ? "Usar carnet QR" : "Usar cédula"}
              </button>
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
    green: { bg: "bg-emerald-500", icon: CheckCircle2, label: "SIGA" },
    amber: { bg: "bg-amber-500", icon: AlertTriangle, label: "SIGA — RECUERDE PAGAR" },
    red: { bg: "bg-red-600", icon: XCircle, label: "DIRÍJASE A RECEPCIÓN" },
  }[tone];
  const Icon = palette.icon;

  return (
    <motion.button
      type="button"
      onClick={onDismiss}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: "spring", stiffness: 300, damping: 25 }}
      className={cn(
        "w-full max-w-lg rounded-3xl p-10 flex flex-col items-center gap-4 text-white text-center",
        palette.bg
      )}
    >
      {result.photo_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={result.photo_url}
          alt=""
          className="h-24 w-24 rounded-full object-cover border-4 border-white/40"
        />
      ) : (
        <Icon className="h-20 w-20" strokeWidth={1.8} />
      )}
      <p className="text-3xl sm:text-4xl font-extrabold leading-tight">{palette.label}</p>
      <p className="text-lg sm:text-xl font-medium opacity-95">{result.message}</p>
      {result.upcoming_class && (
        <p className="flex items-center gap-2 text-base bg-black/20 rounded-full px-4 py-1.5">
          <CalendarClock className="h-4 w-4" />
          {result.upcoming_class.class_name} · {result.upcoming_class.start_time}
        </p>
      )}
    </motion.button>
  );
}
