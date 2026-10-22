/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { motion, type Variants } from "framer-motion";
import { toast } from "sonner";
import { apiClient } from "@/lib/api";
import { GlassCard } from "@/components/common/GlassCard";
import { cn } from "@/lib/utils";
import { RollingNumber } from "@/components/motion/RollingNumber";
import { FileXlsIcon as FileSpreadsheet, FileTextIcon as FileText, SpinnerGapIcon as Loader2 } from "@phosphor-icons/react";
import type { Period } from "./PeriodPicker";

export const chartTooltipStyle = {
  contentStyle: { background: "var(--bg-card)", border: "1px solid var(--border-base)", borderRadius: 8 },
  labelStyle: { color: "var(--text-base)", fontSize: 12 },
};

export const containerVariants: Variants = { hidden: {}, visible: { transition: { staggerChildren: 0.06 } } };
export const cardVariants: Variants = { hidden: { opacity: 0, y: 12 }, visible: { opacity: 1, y: 0 } };

export const compact = (v: number) => new Intl.NumberFormat("es-CO", { notation: "compact", compactDisplay: "short" }).format(v);

/** Carga varias rutas del API con el período; re-ejecuta al cambiar el período. */
export function usePeriodData<T extends Record<string, any>>(
  urls: Record<keyof T, string>,
  period: Period | null,
): { data: Partial<T>; loading: boolean; error: string; failed: Set<string> } {
  const { data: session } = useSession();
  const [data, setData] = useState<Partial<T>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Qué fuentes no respondieron: una tarjeta sin dato debe decir "no se pudo
  // cargar", nunca pintar un cero que afirma que no hay plata.
  const [failed, setFailed] = useState<Set<string>>(new Set());
  const key = JSON.stringify(urls) + (period ? `${period.from}|${period.to}` : "");

  useEffect(() => {
    if (!session?.accessToken) return;
    let cancelled = false;
    setLoading(true);
    const client = apiClient(session.accessToken as string);
    const params = period ? { from: period.from, to: period.to } : {};
    const entries = Object.entries(urls) as [keyof T, string][];
    // allSettled, no all: una fuente caída no puede borrar el reporte entero.
    // Con `all`, un 403 en una sola petición dejaba la pestaña en "Error
    // cargando reportes" aunque las otras seis hubieran respondido.
    Promise.allSettled(entries.map(([, url]) => client.get(url, { params })))
      .then((results) => {
        if (cancelled) return;
        const next: Partial<T> = {};
        const caidas: string[] = [];
        entries.forEach(([k, url], i) => {
          const r = results[i];
          if (r.status === "fulfilled") next[k] = r.value.data;
          else caidas.push(url);
        });
        setData(next);
        setFailed(new Set(caidas));
        setError(caidas.length === entries.length ? "No se pudo cargar el reporte" : "");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.accessToken, key]);

  return { data, loading, error, failed };
}

/** Descarga un blob sin que el navegador revoque la URL antes de iniciar. */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 1000);
}

export function ExportButtons({ tab, period, label }: { tab: string; period: Period | null; label?: string }) {
  const { data: session } = useSession();
  const [busy, setBusy] = useState<null | "xlsx" | "pdf">(null);

  const download = async (fmt: "xlsx" | "pdf") => {
    if (!session?.accessToken) return;
    setBusy(fmt);
    try {
      const client = apiClient(session.accessToken as string);
      const { data } = await client.get(`/api/v1/reports/${tab}/export.${fmt}`, {
        params: period ? { from: period.from, to: period.to } : {},
        responseType: "blob",
      });
      downloadBlob(data as Blob, `${label ?? tab}-${period ? `${period.from}_${period.to}` : "reporte"}.${fmt}`);
    } catch {
      toast.error("No se pudo generar el archivo");
    } finally {
      setBusy(null);
    }
  };

  const btn = "flex h-9 items-center gap-1.5 rounded-full border border-line bg-panel px-3.5 text-[13px] font-medium text-ink transition-[background-color,transform] duration-150 hover:bg-raised active:scale-[0.97] disabled:opacity-50";
  return (
    <div className="flex items-center gap-1.5">
      <button type="button" onClick={() => void download("xlsx")} disabled={busy !== null} className={btn}>
        {busy === "xlsx" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileSpreadsheet className="h-3.5 w-3.5 text-ink-muted" />} Excel
      </button>
      <button type="button" onClick={() => void download("pdf")} disabled={busy !== null} className={btn}>
        {busy === "pdf" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5 text-ink-muted" />} PDF
      </button>
    </div>
  );
}

/**
 * Cifra de un informe. Va en tinta: el color en cada número lo vuelve ruido.
 * `tone` solo apaga lo que no aplica. Al cambiar de período, los dígitos ruedan.
 */
export function Tile({ label, value, tone = "base", hint }: { label: string; value: string; tone?: "base" | "positive" | "negative" | "warning" | "muted"; hint?: string }) {
  return (
    <GlassCard className="p-5">
      <p className="text-[13px] font-medium text-ink-muted">{label}</p>
      <RollingNumber value={value} className={cn("num mt-2 text-[26px] leading-none tracking-[-0.015em]", tone === "muted" ? "text-ink-muted" : "text-ink")} />
      {hint && <p className="mt-1.5 text-xs text-ink-muted">{hint}</p>}
    </GlassCard>
  );
}

export function Card({ title, icon, children, className, right }: { title: string; icon?: React.ReactNode; children: React.ReactNode; className?: string; right?: React.ReactNode }) {
  return (
    <motion.div variants={cardVariants} className={className}>
      <GlassCard className="p-5 h-full">
        <div className="flex items-center justify-between gap-2 mb-4">
          <h3 className="text-base font-semibold text-ink">{title}</h3>
          {right}
        </div>
        {children}
      </GlassCard>
    </motion.div>
  );
}

export function Empty({ text }: { text: string }) {
  return <p className="py-8 text-center text-sm text-ink-muted">{text}</p>;
}

export function TabSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className={`skeleton rounded-xl ${i === 0 ? "h-40 lg:col-span-2" : "h-56"}`} />
      ))}
    </div>
  );
}
