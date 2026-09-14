"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { GlassCard } from "@/components/common/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { Switch } from "@/components/ui/switch";
import { BankIcon as Landmark, LockIcon as Lock, PlusIcon as Plus, DeviceMobileIcon as Smartphone, TrashIcon as Trash2, SpinnerGapIcon as Loader2, FileTextIcon as FileText, KeyIcon as KeyRound, QrCodeIcon as QrCode, ImageIcon as ImagePlus, ClockIcon as Clock } from "@phosphor-icons/react";

const inputCls =
  "bg-[var(--bg-base)] border-[var(--border-base)] text-[var(--text-base)] placeholder:text-[var(--text-muted)]";

export interface TransferAccount {
  id?: string;
  type: "nequi" | "daviplata" | "bancolombia" | "bank";
  label: string;
  account_number: string;
  holder_name: string;
  breb_key?: string | null;
  qr_url?: string | null;
  is_active?: boolean;
}

export const ACCOUNT_TYPES: { key: TransferAccount["type"]; label: string }[] = [
  { key: "nequi", label: "Nequi" },
  { key: "daviplata", label: "Daviplata" },
  { key: "bancolombia", label: "Bancolombia" },
  { key: "bank", label: "Otro banco" },
];

const EMPTY_ACCOUNT: TransferAccount = { type: "nequi", label: "", account_number: "", holder_name: "", breb_key: "", is_active: true };

export default function BillingSection() {
  const { data: session } = useSession();
  const [accounts, setAccounts] = useState<TransferAccount[]>([]);
  const [legalName, setLegalName] = useState("");
  const [nit, setNit] = useState("");
  const [taxRegime, setTaxRegime] = useState("");
  const [newAccount, setNewAccount] = useState<TransferAccount>(EMPTY_ACCOUNT);
  const [showNew, setShowNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [autoVoidHours, setAutoVoidHours] = useState(24);
  const [uploadingQr, setUploadingQr] = useState<string | null>(null);

  const isOwner = (session as any)?.role === "owner" || (session?.user as any)?.role === "owner";

  useEffect(() => {
    if (!session?.accessToken) return;
    const client = apiClient(session.accessToken as string);
    client
      .get("/api/v1/settings/billing")
      .then((res) => {
        setAccounts(res.data.transfer_accounts ?? []);
        setLegalName(res.data.legal_name ?? "");
        setNit(res.data.nit ?? "");
        setTaxRegime(res.data.tax_regime ?? "");
        setAutoVoidHours(res.data.transfer_auto_void_hours ?? 24);
      })
      .catch(() => toast.error("Error cargando configuración de recaudo"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.accessToken]);

  const persist = async (nextAccounts: TransferAccount[], okMessage: string) => {
    if (!session?.accessToken) return;
    setSaving(true);
    try {
      const client = apiClient(session.accessToken as string);
      const res = await client.patch("/api/v1/settings/billing", { transfer_accounts: nextAccounts });
      setAccounts(res.data.transfer_accounts ?? []);
      toast.success(okMessage);
    } catch (err: any) {
      toast.error(parseApiError(err, "Error guardando cuentas"));
    } finally {
      setSaving(false);
    }
  };

  const handleAddAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    await persist([...accounts, newAccount], "Cuenta de recaudo agregada");
    setNewAccount(EMPTY_ACCOUNT);
    setShowNew(false);
  };

  const [armedIdx, setArmedIdx] = useState<number | null>(null);
  const handleRemoveAccount = async (idx: number) => {
    setArmedIdx(null);
    await persist(accounts.filter((_, i) => i !== idx), "Cuenta eliminada");
  };

  const uploadQr = async (acc: TransferAccount, file: File) => {
    if (!session?.accessToken || !acc.id) return;
    setUploadingQr(acc.id);
    try {
      const client = apiClient(session.accessToken as string);
      const fd = new FormData();
      fd.append("file", file);
      const res = await client.post(`/api/v1/settings/billing/transfer-accounts/${acc.id}/qr`, fd, {
        headers: { "Content-Type": undefined },
      });
      setAccounts(res.data.transfer_accounts ?? []);
      toast.success("QR guardado");
    } catch (err: any) {
      toast.error(parseApiError(err, "No se pudo subir el QR"));
    } finally {
      setUploadingQr(null);
    }
  };

  const toggleActive = async (idx: number, active: boolean) => {
    const next = accounts.map((a, i) => (i === idx ? { ...a, is_active: active } : a));
    await persist(next, active ? "Cuenta activada" : "Cuenta desactivada");
  };

  const saveAutoVoid = async () => {
    if (!session?.accessToken) return;
    setSaving(true);
    try {
      const client = apiClient(session.accessToken as string);
      await client.patch("/api/v1/settings/billing", { transfer_auto_void_hours: autoVoidHours });
      toast.success("Regla de anulación guardada");
    } catch (err: any) {
      toast.error(parseApiError(err, "Error guardando"));
    } finally {
      setSaving(false);
    }
  };

  const handleSaveFiscal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.accessToken) return;
    setSaving(true);
    try {
      const client = apiClient(session.accessToken as string);
      await client.patch("/api/v1/settings/billing", {
        legal_name: legalName || null,
        nit: nit || null,
        tax_regime: taxRegime || null,
      });
      toast.success("Datos fiscales guardados");
    } catch (err: any) {
      toast.error(parseApiError(err, "Error guardando datos fiscales"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <GlassCard className="p-6 space-y-8">
      {!isOwner && (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-[var(--signal-warn-bg)] border border-[var(--signal-warn-line)] rounded-lg">
          <Lock className="h-4 w-4 text-[var(--signal-warn)] shrink-0" aria-hidden="true" />
          <p className="text-sm text-[var(--text-base)]">
            Solo el propietario puede editar las cuentas de recaudo.
          </p>
        </div>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-base)]">Cuentas para transferencias</h3>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Recepción las muestra al cliente cuando cobra por transferencia (Nequi, Daviplata, banco)
            </p>
          </div>
          {isOwner && (
            <Button
              type="button"
              onClick={() => setShowNew(!showNew)}
              className="h-8 text-xs"
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Agregar cuenta
            </Button>
          )}
        </div>

        {showNew && (
          <form
            onSubmit={handleAddAccount}
            className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-[var(--radius-md)] bg-muted/60"
          >
            <div className="space-y-1">
              <Label className="text-[var(--text-muted)] text-xs">Tipo</Label>
              <div className="flex gap-1.5 flex-wrap">
                {ACCOUNT_TYPES.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setNewAccount({ ...newAccount, type: t.key })}
                    className={
                      newAccount.type === t.key
                        ? "px-2.5 py-1.5 rounded-lg text-xs font-semibold bg-[var(--color-primary)] text-[var(--color-primary-contrast)]"
                        : "px-2.5 py-1.5 rounded-lg text-xs border border-[var(--border-base)] text-[var(--text-muted)] hover:text-[var(--text-base)]"
                    }
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-[var(--text-muted)] text-xs">Nombre visible</Label>
              <Input
                value={newAccount.label}
                onChange={(e) => setNewAccount({ ...newAccount, label: e.target.value })}
                placeholder="Nequi del gym"
                required
                className={inputCls}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[var(--text-muted)] text-xs">Número de cuenta / celular</Label>
              <Input
                value={newAccount.account_number}
                onChange={(e) => setNewAccount({ ...newAccount, account_number: e.target.value })}
                placeholder="3001234567"
                required
                className={inputCls}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[var(--text-muted)] text-xs">Titular</Label>
              <Input
                value={newAccount.holder_name}
                onChange={(e) => setNewAccount({ ...newAccount, holder_name: e.target.value })}
                placeholder="Nombre del titular"
                required
                className={inputCls}
              />
            </div>
            <div className="space-y-1 sm:col-span-2">
              <Label className="text-[var(--text-muted)] text-xs">Llave Bre-B (opcional)</Label>
              <Input
                value={newAccount.breb_key ?? ""}
                onChange={(e) => setNewAccount({ ...newAccount, breb_key: e.target.value })}
                placeholder="@migym · 3001234567 · correo"
                className={inputCls}
              />
              <p className="text-[11px] text-[var(--text-muted)]">Con la llave el socio paga desde cualquier banco sin escribir el número de cuenta.</p>
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setShowNew(false)} className="text-[var(--text-muted)]">
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={saving}
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Guardar cuenta"}
              </Button>
            </div>
          </form>
        )}

        {accounts.length === 0 ? (
          <p className="text-[var(--text-muted)] text-sm py-3 text-center">
            Sin cuentas registradas: agrégalas para cobrar por transferencia en el POS.
          </p>
        ) : (
          <div className="space-y-2">
            {accounts.map((acc, idx) => (
              <div
                key={`${acc.type}-${acc.account_number}`}
                className="flex items-center gap-3 p-3 rounded-[var(--radius-md)] bg-muted/60"
              >
                {acc.type === "nequi" || acc.type === "daviplata" ? (
                  <Smartphone className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                ) : (
                  <Landmark className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-base)] truncate">
                    {acc.label}{" "}
                    <span className="text-xs text-[var(--text-muted)]">
                      · {ACCOUNT_TYPES.find((t) => t.key === acc.type)?.label ?? acc.type}
                    </span>
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)] truncate font-mono">
                    {acc.account_number} · {acc.holder_name}
                  </p>
                  {acc.breb_key && (
                    <p className="text-[11px] text-[var(--text-muted)] truncate flex items-center gap-1">
                      <KeyRound className="h-3 w-3" /> Bre-B <span className="font-mono">{acc.breb_key}</span>
                    </p>
                  )}
                </div>
                {acc.qr_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={acc.qr_url} alt="QR" className="h-12 w-12 rounded-md bg-white object-contain border border-[var(--border-base)]" />
                ) : (
                  <span className="h-12 w-12 rounded-md border border-dashed border-[var(--border-base)] flex items-center justify-center text-[var(--text-muted)]" title="Sin QR">
                    <QrCode className="h-4 w-4 opacity-50" />
                  </span>
                )}
                {isOwner && (
                  <>
                    <label
                      title="Subir QR del banco"
                      className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-base)] hover:bg-[var(--bg-muted)] transition-colors cursor-pointer"
                    >
                      {uploadingQr === acc.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        className="hidden"
                        onChange={(e) => {
                          const f = e.target.files?.[0];
                          if (f) void uploadQr(acc, f);
                          e.target.value = "";
                        }}
                      />
                    </label>
                    <Switch checked={acc.is_active !== false} onCheckedChange={(v) => toggleActive(idx, v)} />
                    {armedIdx === idx ? (
                      <span className="flex items-center gap-1">
                        <Button type="button" variant="destructive" onClick={() => handleRemoveAccount(idx)} className="h-7 text-xs">Quitar</Button>
                        <Button type="button" variant="ghost" onClick={() => setArmedIdx(null)} className="h-7 text-xs">No</Button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setArmedIdx(idx)}
                        title="Quitar cuenta"
                        aria-label="Quitar cuenta"
                        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--signal-danger)] hover:bg-[var(--signal-danger-bg)] transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="pt-6 border-t border-[var(--border-base)] space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-[var(--color-primary-ink)]" />
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-base)]">Transferencias sin confirmar</h3>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Una transferencia pendiente que nadie confirma se anula sola pasadas estas horas (0 = nunca). El pase o renovación asociada queda sin efecto.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Input
            type="number"
            min={0}
            max={720}
            value={autoVoidHours}
            onChange={(e) => setAutoVoidHours(Number(e.target.value))}
            disabled={!isOwner}
            className={`${inputCls} w-24`}
          />
          <span className="text-sm text-[var(--text-muted)]">horas</span>
          {isOwner && (
            <Button type="button" onClick={saveAutoVoid} disabled={saving} variant="outline" className="h-9 text-xs">
              Guardar
            </Button>
          )}
        </div>
      </div>

      <form onSubmit={handleSaveFiscal} className="pt-6 border-t border-[var(--border-base)] space-y-4">
        <div className="flex items-center gap-2">
          <FileText className="h-4 w-4 text-[var(--color-primary-ink)]" />
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-base)]">Datos fiscales</h3>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Base para facturación electrónica DIAN (próximamente)
            </p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label className="text-[var(--text-muted)] text-sm">Razón social</Label>
            <Input value={legalName} onChange={(e) => setLegalName(e.target.value)} disabled={!isOwner} className={inputCls} />
          </div>
          <div className="space-y-2">
            <Label className="text-[var(--text-muted)] text-sm">NIT</Label>
            <Input value={nit} onChange={(e) => setNit(e.target.value)} placeholder="900123456-7" disabled={!isOwner} className={inputCls} />
          </div>
          <div className="space-y-2">
            <Label className="text-[var(--text-muted)] text-sm">Régimen</Label>
            <Input value={taxRegime} onChange={(e) => setTaxRegime(e.target.value)} placeholder="Simple / Común" disabled={!isOwner} className={inputCls} />
          </div>
        </div>
        {isOwner && (
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={saving}
            >
              {saving ? "Guardando..." : "Guardar datos fiscales"}
            </Button>
          </div>
        )}
      </form>
    </GlassCard>
  );
}
