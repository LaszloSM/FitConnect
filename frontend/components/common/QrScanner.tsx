"use client";

import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, CameraOff } from "lucide-react";

interface QrScannerProps {
  /** Called with the decoded QR text. The parent decides what to do with it. */
  onDecode: (text: string) => void;
  /** Pause scanning (e.g. while a check-in request is in flight). */
  paused?: boolean;
}

const REGION_ID = "qr-scanner-region";

export function QrScanner({ onDecode, paused = false }: QrScannerProps) {
  const [active, setActive] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const lastDecodedRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });
  const pausedRef = useRef(paused);

  useEffect(() => { pausedRef.current = paused; }, [paused]);

  useEffect(() => {
    if (!active) return;

    const scanner = new Html5Qrcode(REGION_ID, { verbose: false });
    scannerRef.current = scanner;
    let stopped = false;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decodedText) => {
          if (pausedRef.current) return;
          // Debounce: ignore the same code re-read within 3s
          const now = Date.now();
          if (
            decodedText === lastDecodedRef.current.text &&
            now - lastDecodedRef.current.at < 3000
          ) {
            return;
          }
          lastDecodedRef.current = { text: decodedText, at: now };
          onDecode(decodedText);
        },
        () => {} // per-frame decode failure — ignore noise
      )
      .catch((err) => {
        const name = (err as { name?: string })?.name;
        if (name === "NotAllowedError") {
          setErrorMsg("Permiso de cámara denegado. Habilítalo en el navegador.");
        } else if (name === "NotFoundError") {
          setErrorMsg("No se encontró ninguna cámara en este dispositivo.");
        } else {
          setErrorMsg("No se pudo iniciar la cámara.");
        }
        setActive(false);
      });

    return () => {
      stopped = true;
      const s = scannerRef.current;
      if (s) {
        // Solo detener si está escaneando; stop() sobre un scanner no iniciado lanza.
        try {
          const state = s.getState?.();
          // 2 = SCANNING, 3 = PAUSED (Html5QrcodeScannerState)
          if (state === 2 || state === 3) {
            s.stop().then(() => s.clear()).catch(() => {});
          } else {
            s.clear();
          }
        } catch {
          // ignorar — cámara nunca arrancó
        }
      }
      scannerRef.current = null;
      void stopped;
    };
  }, [active, onDecode]);

  if (!active) {
    return (
      <div className="flex flex-col items-center gap-3 w-full">
        <button
          type="button"
          onClick={() => { setErrorMsg(null); setActive(true); }}
          className="flex items-center gap-2 h-11 px-5 rounded-lg bg-[var(--color-primary)] text-[var(--color-primary-contrast)] font-semibold hover:opacity-90 transition-opacity"
        >
          <Camera className="h-4 w-4" />
          Escanear con cámara
        </button>
        {errorMsg && (
          <p className="text-xs text-red-600 dark:text-red-400 text-center max-w-xs">{errorMsg}</p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-3 w-full">
      <div
        id={REGION_ID}
        className="w-full max-w-[260px] aspect-square overflow-hidden rounded-xl border border-[var(--border-base)] bg-black"
      />
      <button
        type="button"
        onClick={() => setActive(false)}
        className="flex items-center gap-2 h-9 px-4 rounded-lg border border-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-base)] text-sm transition-colors"
      >
        <CameraOff className="h-4 w-4" />
        Detener cámara
      </button>
    </div>
  );
}
