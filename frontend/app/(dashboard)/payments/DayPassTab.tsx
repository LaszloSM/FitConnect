/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { toast } from "sonner";
import { GlassCard } from "@/components/common/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { StatusBadge } from "@/components/ui/status-badge";
import { DataTable, type DataTableColumn } from "@/components/ui/data-table";
import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { formatCOP, formatTimeAgo } from "@/lib/format";
import { useApiResource } from "@/hooks/useApiResource";
import { cn } from "@/lib/utils";
import { MethodPicker, EMPTY_DETAILS, type Method, type MethodDetails } from "./MethodPicker";
import { TransferPendingDialog, type TransferContext } from "./TransferPendingDialog";
import { openReceipt, METHOD_LABELS, type DestinationAccount } from "./shared";
import { Dumbbell, Loader2, Printer, Search, Ticket, UserCheck, UserPlus } from "lucide-react";

interface PassType {
  id: string;
  name: string;
  price: number;
  includes_trainer: boolean;
  is_active: boolean;
}

interface DayPassRow {
  id: string;
  member_id: string;
  member_name: string | null;
  member_id_number: string | null;
  pass_name: string;
  includes_trainer: boolean;
  price: number;
  status: "pending" | "active" | "void";
  payment_id: string | null;
  payment_method: string | null;
  created_at: string;
}

interface Lookup {
  id: string;
  full_name: string;
  phone: string | null;
  member_type: string;
}

const PASS_STATUS_LABEL: Record<string, string> = { active: "Activo", pending: "Por confirmar", void: "Anulado" };
const PASS_STATUS_TONE: Record<string, "success" | "warning" | "neutral"> = {
  active: "success",
  pending: "warning",
  void: "neutral",
};

export function DayPassTab({ onSold }: { onSold?: () => void }) {
  const { data: session } = useSession();
  const types = useApiResource<PassType[]>("/api/v1/day-passes/types", []);
  const today = useApiResource<DayPassRow[]>("/api/v1/day-passes", []);

  const [idNumber, setIdNumber] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [lookup, setLookup] = useState<Lookup | null>(null);
  const [looking, setLooking] = useState(false);
  const [typeId, setTypeId] = useState("");
  const [method, setMethod] = useState<Method>("cash");
  const [details, setDetails] = useState<MethodDetails>(EMPTY_DETAILS);
  const [accounts, setAccounts] = useState<DestinationAccount[]>([]);
  const [selling, setSelling] = useState(false);
  const [transferCtx, setTransferCtx] = useState<TransferContext | null>(null);

  const client = () => apiClient(session?.accessToken as string);

  useEffect(() => {
    if (!session?.accessToken) return;
    client()
      .get("/api/v1/settings/billing")
      .then((res) => setAccounts(res.data.transfer_accounts ?? []))
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.accessToken]);

  useEffect(() => {
    if (!typeId && types.data.length > 0) setTypeId(types.data[0].id);
  }, [types.data, typeId]);

  // Lookup por cédula: si ya existe (socio o visitante) se autocompleta
  useEffect(() => {
    const clean = idNumber.trim();
    if (!session?.accessToken || clean.length < 5) {
      setLookup(null);
      return;
    }
    let cancelled = false;
    setLooking(true);
    const t = setTimeout(() => {
      client()
        .get("/api/v1/members", { params: { id_number: clean, limit: 1 } })
        .then((res) => {
          if (cancelled) return;
          const found = (res.data as Lookup[])[0] ?? null;
          setLookup(found);
          if (found) {
            setFullName(found.full_name);
            if (found.phone && !phone) setPhone(found.phone);
          }
        })
        .catch(() => { if (!cancelled) setLookup(null); })
        .finally(() => { if (!cancelled) setLooking(false); });
    }, 350);
    return () => { cancelled = true; clearTimeout(t); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idNumber, session]);

  const selectedType = useMemo(() => types.data.find((t) => t.id === typeId) ?? null, [types.data, typeId]);

  const sell = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.accessToken || !selectedType) return;
    if (idNumber.trim().length < 3 || fullName.trim().length < 2) {
      toast.error("Cédula y nombre son obligatorios");
      return;
    }
    setSelling(true);
    try {
      const { data } = await client().post("/api/v1/day-passes/sell", {
        id_number: idNumber.trim(),
        full_name: fullName.trim(),
        phone: phone.trim() || null,
        pass_type_id: selectedType.id,
        method,
        transfer_account_id: method === "transfer" ? details.transfer_account_id : null,
        card_approval_code: method === "card" ? details.card_approval_code || null : null,
        card_terminal: method === "card" ? details.card_terminal || null : null,
      });
      if (data.payment_status === "pending") {
        setTransferCtx({
          paymentId: data.payment_id,
          amount: Number(selectedType.price),
          reference: data.transfer_reference,
          account: data.destination_account,
          memberName: fullName,
          phone,
          concept: `Pase del día · ${selectedType.name}`,
        });
      } else {
        toast.success(`Pase vendido · recibo ${data.receipt_number}`, {
          description: `${fullName.split(" ")[0]} puede entrar todo el día con su cédula.`,
          action: { label: "Imprimir", onClick: () => openReceipt(client(), data.payment_id) },
          duration: 8000,
        });
      }
      setIdNumber("");
      setFullName("");
      setPhone("");
      setLookup(null);
      setDetails(EMPTY_DETAILS);
      await today.refetch();
      onSold?.();
    } catch (err: any) {
      toast.error(parseApiError(err, "No se pudo vender el pase"));
    } finally {
      setSelling(false);
    }
  };

  const columns: DataTableColumn<DayPassRow>[] = [
    {
      key: "member",
      header: "Visitante",
      cell: (p) => (
        <div>
          <p className="font-medium text-[var(--text-base)]">{p.member_name}</p>
          <p className="text-xs text-[var(--text-muted)] font-mono">{p.member_id_number}</p>
        </div>
      ),
    },
    {
      key: "pass",
      header: "Pase",
      cell: (p) => (
        <span className="text-[var(--text-muted)] flex items-center gap-1.5">
          {p.includes_trainer && <Dumbbell className="h-3.5 w-3.5 text-[var(--color-primary-ink)]" />}
          {p.pass_name}
        </span>
      ),
    },
    {
      key: "amount",
      header: "Valor",
      cell: (p) => <span className="font-mono font-semibold text-[var(--text-base)]">{formatCOP(p.price)}</span>,
    },
    {
      key: "method",
      header: "Método",
      hideOnMobile: true,
      cell: (p) => <span className="text-[var(--text-muted)]">{METHOD_LABELS[p.payment_method ?? ""] ?? "-"}</span>,
    },
    {
      key: "status",
      header: "Estado",
      cell: (p) => <StatusBadge status={p.status} label={PASS_STATUS_LABEL[p.status]} tone={PASS_STATUS_TONE[p.status]} />,
    },
    {
      key: "time",
      header: "Hora",
      hideOnMobile: true,
      cell: (p) => <span className="text-[var(--text-muted)] text-sm">{formatTimeAgo(p.created_at)}</span>,
    },
    {
      key: "actions",
      header: "",
      cell: (p) => (
        <div className="flex justify-end">
          {p.status === "active" && p.payment_id && (
            <button
              type="button"
              title="Imprimir recibo"
              onClick={() => openReceipt(client(), p.payment_id!)}
              className="h-7 w-7 rounded-lg flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--color-primary-ink)] hover:bg-[var(--bg-base)] transition-colors"
            >
              <Printer className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      ),
    },
  ];

  const activeCount = today.data.filter((p) => p.status === "active").length;
  const activeAmount = today.data.filter((p) => p.status === "active").reduce((a, p) => a + Number(p.price), 0);

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <TransferPendingDialog
        ctx={transferCtx}
        onClose={() => setTransferCtx(null)}
        onConfirmed={() => { void today.refetch(); onSold?.(); }}
      />

      <GlassCard className="p-4 lg:col-span-2 space-y-4 self-start">
        <div className="flex items-center gap-2">
          <Ticket className="h-4 w-4 text-[var(--color-primary-ink)]" />
          <h2 className="text-sm font-semibold text-[var(--text-base)]">Vender pase del día</h2>
        </div>

        {types.data.length === 0 && !types.loading ? (
          <div className="rounded-xl border border-dashed border-[var(--border-base)] p-4 text-center space-y-2">
            <p className="text-sm text-[var(--text-muted)]">Aún no tienes tipos de pase.</p>
            <Link
              href="/settings?tab=daypass"
              className="text-sm font-semibold text-[var(--color-primary-ink)] hover:underline"
            >
              Crear tipos de pase en Ajustes › Pases
            </Link>
          </div>
        ) : (
          <form onSubmit={sell} className="space-y-3">
            <div className="space-y-1">
              <Label className="text-[var(--text-muted)] text-xs">Cédula</Label>
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
                <Input
                  value={idNumber}
                  onChange={(e) => setIdNumber(e.target.value.replace(/[^\dA-Za-z-]/g, ""))}
                  placeholder="Número de documento"
                  inputMode="numeric"
                  autoFocus
                  className="pl-8 font-mono"
                />
                {looking && <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-[var(--text-muted)]" />}
              </div>
              <AnimatePresence>
                {lookup && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-xs flex items-center gap-1.5 text-emerald-600 dark:text-emerald-400"
                  >
                    <UserCheck className="h-3.5 w-3.5" />
                    {lookup.member_type === "visitor" ? "Visitante conocido" : "Ya es socio del gym"} · {lookup.full_name}
                  </motion.p>
                )}
              </AnimatePresence>
            </div>
            <div className="space-y-1">
              <Label className="text-[var(--text-muted)] text-xs">Nombre</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Nombre completo" />
            </div>
            <div className="space-y-1">
              <Label className="text-[var(--text-muted)] text-xs">Celular (opcional)</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="300 123 4567" inputMode="tel" />
            </div>

            <div className="space-y-1">
              <Label className="text-[var(--text-muted)] text-xs">Tipo de pase</Label>
              <div className="grid grid-cols-1 gap-1.5">
                {types.data.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTypeId(t.id)}
                    className={cn(
                      "flex items-center justify-between rounded-xl border px-3 py-2 text-sm transition-ui",
                      typeId === t.id
                        ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--text-base)]"
                        : "border-[var(--border-base)] text-[var(--text-muted)] hover:border-[var(--color-primary)]/50"
                    )}
                  >
                    <span className="flex items-center gap-2">
                      {t.includes_trainer && <Dumbbell className="h-3.5 w-3.5 text-[var(--color-primary-ink)]" />}
                      {t.name}
                    </span>
                    <span className="font-mono font-semibold">{formatCOP(t.price)}</span>
                  </button>
                ))}
              </div>
            </div>

            <MethodPicker value={method} onChange={setMethod} accounts={accounts} details={details} onDetailsChange={setDetails} />

            <Button
              type="submit"
              disabled={selling || !selectedType}
              className="w-full h-12 text-base bg-[var(--color-primary)] text-[var(--color-primary-contrast)] font-bold hover:bg-[var(--color-primary-hover)]"
            >
              {selling ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <>
                  <UserPlus className="h-4 w-4 mr-2" />
                  Vender pase{selectedType ? ` · ${formatCOP(selectedType.price)}` : ""}
                </>
              )}
            </Button>
            <p className="text-[11px] text-[var(--text-muted)]">
              Entra todo el día de hoy con su cédula en el kiosko o recepción. Si vuelve, podrás convertirlo en socio desde su ficha.
            </p>
          </form>
        )}
      </GlassCard>

      <GlassCard className="p-4 lg:col-span-3 space-y-4 self-start">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-[var(--text-base)]">Pases de hoy</h2>
            <p className="text-xs text-[var(--text-muted)]">
              {activeCount} activo{activeCount === 1 ? "" : "s"} · {formatCOP(activeAmount)}
            </p>
          </div>
        </div>
        <DataTable
          columns={columns}
          rows={today.data}
          rowKey={(p) => p.id}
          loading={today.loading}
          emptyTitle="Sin pases hoy"
          emptyDescription="Los pases vendidos hoy aparecen aquí con su estado"
          emptyIcon={<Ticket className="h-8 w-8 text-[var(--text-muted)] opacity-40" />}
        />
      </GlassCard>
    </div>
  );
}
