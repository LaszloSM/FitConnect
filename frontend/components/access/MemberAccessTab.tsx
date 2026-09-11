/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { apiClient } from "@/lib/api";
import { formatTimeAgo } from "@/lib/format";
import { Fingerprint, ScanFace, CreditCard, KeyRound, Loader2, ShieldCheck, ShieldOff, X } from "lucide-react";

type CredKind = "fingerprint" | "face" | "card" | "pin";
interface Consent { id: string; kind: string; text_version: string; signature_method: string; signed_at: string; revoked_at: string | null }
interface Credential { id: string; kind: CredKind; device_user_id: string; label: string | null; device_id: string | null; device_name: string | null; enrolled_at: string; revoked_at: string | null }
interface AccessEvent { id: string; device_name: string | null; credential_kind: string; direction: string; decision: string; reason: string | null; offline: boolean; occurred_at: string }
interface Device { id: string; name: string; kind: string; is_active: boolean }

const KIND_META: Record<CredKind, { label: string; icon: React.ReactNode; biometric: boolean }> = {
  fingerprint: { label: "Huella", icon: <Fingerprint className="h-4 w-4" />, biometric: true },
  face: { label: "Rostro", icon: <ScanFace className="h-4 w-4" />, biometric: true },
  card: { label: "Tarjeta", icon: <CreditCard className="h-4 w-4" />, biometric: false },
  pin: { label: "PIN", icon: <KeyRound className="h-4 w-4" />, biometric: false },
};
const DECISION: Record<string, string> = { allowed: "Permitido", duplicate: "Reingreso", denied: "Denegado", not_found: "No reconocido" };

export function MemberAccessTab({ memberId, idNumber }: { memberId: string; idNumber: string }) {
  const { data: session } = useSession();
  const isOwnerOrAdmin = session?.role === "owner" || session?.role === "admin";
  const [data, setData] = useState<{ consents: Consent[]; credentials: Credential[]; events: AccessEvent[]; consent_text_version: string } | null>(null);
  const [devices, setDevices] = useState<Device[]>([]);
  const [kind, setKind] = useState<CredKind>("fingerprint");
  const [readerId, setReaderId] = useState(idNumber);
  const [label, setLabel] = useState("");
  const [deviceId, setDeviceId] = useState("");
  const [consentChecked, setConsentChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const client = () => apiClient(session?.accessToken as string);

  const load = () => {
    if (!session?.accessToken) return;
    client().get(`/api/v1/members/${memberId}/access`).then((r) => setData(r.data)).catch(() => setData({ consents: [], credentials: [], events: [], consent_text_version: "" }));
    if (isOwnerOrAdmin) client().get("/api/v1/kiosk/devices").then((r) => setDevices(r.data.filter((d: Device) => d.is_active && (d.kind === "turnstile" || d.kind === "reader")))).catch(() => {});
  };
  useEffect(load, [session?.accessToken, memberId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!data) return <div className="skeleton h-32 rounded-xl" />;
  const activeConsent = (k: string) => data.consents.find((c) => c.kind === k && !c.revoked_at);
  const needsConsent = KIND_META[kind].biometric && !activeConsent(kind);

  const enroll = async () => {
    if (!readerId.trim()) return;
    setBusy(true);
    try {
      if (needsConsent) {
        if (!consentChecked) { toast.error("Marca el consentimiento biométrico del socio"); setBusy(false); return; }
        await client().post(`/api/v1/members/${memberId}/biometric-consents`, { kind, signature_method: "checkbox", accepted: true });
      }
      await client().post(`/api/v1/members/${memberId}/credentials`, { kind, device_user_id: readerId.trim(), label: label.trim() || null, device_id: deviceId || null });
      toast.success(`${KIND_META[kind].label} enrolada`);
      setLabel(""); setConsentChecked(false);
      load();
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? "Error enrolando");
    } finally {
      setBusy(false);
    }
  };
  const revokeCred = async (c: Credential) => {
    try { await client().delete(`/api/v1/members/${memberId}/credentials/${c.id}`); load(); } catch (err: any) { toast.error(err.response?.data?.detail ?? "Error"); }
  };
  const revokeConsent = async (c: Consent) => {
    if (!window.confirm(`¿Revocar el consentimiento de ${c.kind === "face" ? "rostro" : "huella"}? Se revocan sus credenciales de ese tipo y hay que borrarlo del lector.`)) return;
    try { await client().delete(`/api/v1/members/${memberId}/biometric-consents/${c.id}`); toast.success("Consentimiento revocado"); load(); } catch (err: any) { toast.error(err.response?.data?.detail ?? "Error"); }
  };

  const activeCreds = data.credentials.filter((c) => !c.revoked_at);
  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border-base)] bg-[var(--bg-base)] p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Credenciales de acceso</p>
        <p className="text-sm text-[var(--text-muted)]">Por defecto el socio entra con su cédula ({idNumber}) o su carné QR en cualquier dispositivo. Aquí se registran huella, rostro, tarjeta o PIN cuando el gym tiene torniquete o lector. La huella nunca se guarda en FitConnect: solo el ID con que la registró el lector.</p>
        {activeCreds.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)]">Sin credenciales adicionales.</p>
        ) : activeCreds.map((c) => (
          <div key={c.id} className="flex items-center gap-3 text-sm">
            <span className="text-[var(--color-primary-ink)]">{KIND_META[c.kind]?.icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-[var(--text-base)] font-medium">{KIND_META[c.kind]?.label ?? c.kind} · ID en el lector <code className="text-xs">{c.device_user_id}</code>{c.label ? ` · ${c.label}` : ""}</p>
              <p className="text-xs text-[var(--text-muted)]">{c.device_name ? `Solo en ${c.device_name}` : "Todos los dispositivos"} · enrolada {formatTimeAgo(c.enrolled_at)}</p>
            </div>
            <button type="button" onClick={() => revokeCred(c)} className="text-xs text-[var(--text-muted)] hover:text-red-500 flex items-center gap-1"><X className="h-3 w-3" /> Revocar</button>
          </div>
        ))}
      </div>

      <div className="rounded-xl border border-[var(--border-base)] bg-[var(--bg-base)] p-4 space-y-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Enrolar credencial</p>
        <div className="flex gap-1.5 flex-wrap">
          {(Object.keys(KIND_META) as CredKind[]).map((k) => (
            <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-lg px-3 py-1.5 text-xs font-medium border flex items-center gap-1.5 ${k === kind ? "bg-[var(--color-primary)] text-[var(--color-primary-contrast)] border-transparent" : "border-[var(--border-base)] text-[var(--text-muted)]"}`}>{KIND_META[k].icon} {KIND_META[k].label}</button>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)] gap-2">
          <label className="text-xs text-[var(--text-muted)] flex flex-col gap-1">ID en el lector (por defecto, la cédula)<Input value={readerId} onChange={(e) => setReaderId(e.target.value)} className="h-9" /></label>
          <label className="text-xs text-[var(--text-muted)] flex flex-col gap-1">Etiqueta (opcional)<Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Índice derecho, tarjeta azul..." className="h-9" /></label>
          <label className="text-xs text-[var(--text-muted)] flex flex-col gap-1">Dispositivo
            <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)} className="h-9 rounded-md border border-[var(--border-base)] bg-[var(--bg-card)] px-3 text-sm text-[var(--text-base)]">
              <option value="">Todos</option>
              {devices.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </label>
        </div>
        {KIND_META[kind].biometric && (
          activeConsent(kind) ? (
            <p className="text-xs text-emerald-600 flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Consentimiento biométrico ({kind === "face" ? "rostro" : "huella"}) firmado {formatTimeAgo(activeConsent(kind)!.signed_at)} · versión {activeConsent(kind)!.text_version}</p>
          ) : (
            <label className="flex items-start gap-2 text-xs text-[var(--text-base)] rounded-lg border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-3">
              <input type="checkbox" checked={consentChecked} onChange={(e) => setConsentChecked(e.target.checked)} className="mt-0.5 accent-[var(--color-primary)]" />
              <span>El socio autoriza de forma libre, expresa e informada el tratamiento de su dato biométrico ({kind === "face" ? "rostro" : "huella"}) únicamente para controlar su ingreso, sabe que es opcional (puede seguir entrando con cédula o carné) y que puede revocarlo cuando quiera. Leyó la <Link href="/tratamiento-datos#biometricos" target="_blank" className="underline">política de tratamiento de datos</Link>. Versión {data.consent_text_version}.</span>
            </label>
          )
        )}
        <Button onClick={enroll} disabled={busy || !readerId.trim()} className="bg-[var(--color-primary)] text-[var(--color-primary-contrast)] font-semibold">{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : `Enrolar ${KIND_META[kind].label.toLowerCase()}`}</Button>
        <p className="text-[11px] text-[var(--text-muted)]">Después de enrolar aquí, registra la huella o tarjeta en el equipo físico con el mismo ID. Si usas la cédula como ID no hay que mapear nada.</p>
      </div>

      {data.consents.length > 0 && (
        <div className="rounded-xl border border-[var(--border-base)] bg-[var(--bg-base)] p-4 space-y-2">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Consentimientos biométricos</p>
          {data.consents.map((c) => (
            <div key={c.id} className="flex items-center gap-3 text-sm">
              {c.revoked_at ? <ShieldOff className="h-4 w-4 text-[var(--text-muted)]" /> : <ShieldCheck className="h-4 w-4 text-emerald-600" />}
              <span className="flex-1 text-[var(--text-base)]">{c.kind === "face" ? "Rostro" : "Huella"} · firmado {formatTimeAgo(c.signed_at)} · v{c.text_version}{c.revoked_at ? ` · revocado ${formatTimeAgo(c.revoked_at)}` : ""}</span>
              {!c.revoked_at && isOwnerOrAdmin && <button type="button" onClick={() => revokeConsent(c)} className="text-xs text-[var(--text-muted)] hover:text-red-500">Revocar</button>}
            </div>
          ))}
        </div>
      )}

      {data.events.length > 0 && (
        <div className="rounded-xl border border-[var(--border-base)] bg-[var(--bg-base)] p-4 space-y-1.5">
          <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">Últimos intentos por dispositivo</p>
          {data.events.map((ev) => (
            <p key={ev.id} className="text-sm text-[var(--text-muted)]"><span className={ev.decision === "denied" ? "text-red-500" : ev.decision === "not_found" ? "text-amber-600" : "text-emerald-600"}>{DECISION[ev.decision] ?? ev.decision}</span> · {ev.device_name ?? "dispositivo"} · {ev.direction === "exit" ? "salida" : "entrada"}{ev.offline ? " · offline" : ""} · {formatTimeAgo(ev.occurred_at)}</p>
          ))}
        </div>
      )}
    </div>
  );
}
