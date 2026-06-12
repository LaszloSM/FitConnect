/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { toast } from "sonner";
import { GlassCard } from "@/components/common/GlassCard";
import MemberSelect from "@/components/common/MemberSelect";
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CurrencyInput } from "@/components/ui/currency-input";
import { apiClient } from "@/lib/api";
import { formatCOP, formatDate } from "@/lib/format";
import { useApiResource } from "@/hooks/useApiResource";
import { cn } from "@/lib/utils";
import { openReceipt } from "./shared";
import {
  Banknote,
  CreditCard,
  Landmark,
  Loader2,
  Minus,
  Package,
  Plus,
  Printer,
  Search,
  ShoppingCart,
  Trash2,
  UserRound,
  Zap,
} from "lucide-react";

interface BillingSummary {
  member_id: string;
  member_name: string;
  phone: string | null;
  membership: {
    id: string;
    plan_name: string;
    end_date: string;
    effective_status: string;
    days_overdue: number;
    balance_due: number;
  } | null;
  renewal: {
    plan_id: string | null;
    plan_name: string;
    price: number;
    duration_days: number;
  } | null;
}

interface Product {
  id: string;
  name: string;
  photo_url: string | null;
  price: number;
  stock: number;
  low_stock_threshold: number;
}

type Method = "cash" | "transfer" | "card";

const METHODS: { key: Method; label: string; icon: typeof Banknote }[] = [
  { key: "cash", label: "Efectivo", icon: Banknote },
  { key: "transfer", label: "Transferencia", icon: Landmark },
  { key: "card", label: "Tarjeta", icon: CreditCard },
];

function MethodPicker({ value, onChange }: { value: Method; onChange: (m: Method) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {METHODS.map(({ key, label, icon: Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={cn(
            "flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 text-xs font-medium transition-ui",
            value === key
              ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 text-[var(--text-base)]"
              : "border-[var(--border-base)] text-[var(--text-muted)] hover:border-[var(--color-primary)]/50"
          )}
        >
          <Icon className="h-4 w-4" />
          {label}
        </button>
      ))}
    </div>
  );
}

export function PosTab({
  preselectedMember,
  onCharged,
}: {
  preselectedMember?: string;
  onCharged?: () => void;
}) {
  const { data: session } = useSession();
  const [memberId, setMemberId] = useState(preselectedMember ?? "");
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [method, setMethod] = useState<Method>("cash");
  const [charging, setCharging] = useState(false);
  const [partialAmount, setPartialAmount] = useState(0);
  const [payingPartial, setPayingPartial] = useState(false);

  const products = useApiResource<Product[]>("/api/v1/products", []);
  const [productQuery, setProductQuery] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [selling, setSelling] = useState(false);

  useEffect(() => {
    if (preselectedMember) setMemberId(preselectedMember);
  }, [preselectedMember]);

  useEffect(() => {
    if (!session?.accessToken || !memberId) {
      setSummary(null);
      return;
    }
    let cancelled = false;
    setLoadingSummary(true);
    const client = apiClient(session.accessToken as string);
    client
      .get(`/api/v1/members/${memberId}/billing-summary`)
      .then((res) => { if (!cancelled) setSummary(res.data); })
      .catch(() => { if (!cancelled) setSummary(null); })
      .finally(() => { if (!cancelled) setLoadingSummary(false); });
    return () => { cancelled = true; };
  }, [session, memberId]);

  const refreshSummary = async () => {
    if (!session?.accessToken || !memberId) return;
    const client = apiClient(session.accessToken as string);
    const res = await client.get(`/api/v1/members/${memberId}/billing-summary`);
    setSummary(res.data);
  };

  const chargeRenewal = async () => {
    if (!session?.accessToken || !summary?.renewal?.plan_id) return;
    setCharging(true);
    const client = apiClient(session.accessToken as string);
    try {
      const { data } = await client.post("/api/v1/member-plans/charge", {
        member_id: summary.member_id,
        plan_id: summary.renewal.plan_id,
        method,
      });
      toast.success(`Cobrado ${formatCOP(data.amount)} — recibo ${data.receipt_number}`, {
        action: { label: "Imprimir", onClick: () => openReceipt(client, data.payment_id) },
        duration: 8000,
      });
      await refreshSummary();
      onCharged?.();
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? "Error cobrando la renovación");
    } finally {
      setCharging(false);
    }
  };

  const payBalance = async () => {
    if (!session?.accessToken || !summary?.membership || partialAmount <= 0) return;
    setPayingPartial(true);
    const client = apiClient(session.accessToken as string);
    try {
      const { data } = await client.post("/api/v1/payments", {
        member_id: summary.member_id,
        membership_id: summary.membership.id,
        amount: partialAmount,
        method,
        status: "paid",
        concept: `Abono ${summary.membership.plan_name}`,
      });
      toast.success(`Abono de ${formatCOP(partialAmount)} registrado`, {
        action: { label: "Imprimir", onClick: () => openReceipt(client, data.id) },
        duration: 8000,
      });
      setPartialAmount(0);
      await refreshSummary();
      onCharged?.();
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? "Error registrando el abono");
    } finally {
      setPayingPartial(false);
    }
  };

  const cartItems = useMemo(
    () =>
      Object.entries(cart)
        .map(([id, qty]) => {
          const product = products.data.find((p) => p.id === id);
          return product ? { product, qty } : null;
        })
        .filter(Boolean) as { product: Product; qty: number }[],
    [cart, products.data]
  );
  const cartTotal = cartItems.reduce((acc, { product, qty }) => acc + Number(product.price) * qty, 0);

  const addToCart = (product: Product) => {
    const current = cart[product.id] ?? 0;
    if (current >= product.stock) {
      toast.warning(`Solo quedan ${product.stock} de ${product.name}`);
      return;
    }
    setCart({ ...cart, [product.id]: current + 1 });
  };

  const setQty = (id: string, qty: number) => {
    const next = { ...cart };
    if (qty <= 0) delete next[id];
    else next[id] = qty;
    setCart(next);
  };

  const sellCart = async () => {
    if (!session?.accessToken || cartItems.length === 0) return;
    setSelling(true);
    const client = apiClient(session.accessToken as string);
    try {
      const { data } = await client.post("/api/v1/payments", {
        member_id: memberId || null,
        amount: cartTotal,
        method,
        status: "paid",
        concept: "Venta de productos",
        items: cartItems.map(({ product, qty }) => ({ product_id: product.id, quantity: qty })),
      });
      toast.success(`Venta de ${formatCOP(data.amount)} registrada`, {
        action: { label: "Imprimir", onClick: () => openReceipt(client, data.id) },
        duration: 8000,
      });
      setCart({});
      await products.refetch();
      onCharged?.();
    } catch (err: any) {
      toast.error(err.response?.data?.detail ?? "Error registrando la venta");
    } finally {
      setSelling(false);
    }
  };

  const filteredProducts = products.data.filter(
    (p) => !productQuery || p.name.toLowerCase().includes(productQuery.toLowerCase())
  );

  const ms = summary?.membership;

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      {/* Cobro rápido */}
      <GlassCard className="p-4 lg:col-span-2 space-y-4 self-start">
        <div className="flex items-center gap-2">
          <Zap className="h-4 w-4 text-[var(--color-primary)]" />
          <h2 className="text-sm font-semibold text-[var(--text-base)]">Cobro rápido</h2>
        </div>

        <MemberSelect value={memberId} onChange={setMemberId} />

        {loadingSummary && <div className="skeleton h-28 rounded-xl" />}

        <AnimatePresence mode="wait">
          {summary && !loadingSummary && (
            <motion.div
              key={summary.member_id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
              className="space-y-3"
            >
              <div className="rounded-xl border border-[var(--border-base)] bg-[var(--bg-base)] p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <span className="h-8 w-8 rounded-full bg-[var(--color-primary)] text-[var(--color-primary-contrast)] text-xs font-bold flex items-center justify-center shrink-0">
                    {summary.member_name[0]?.toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[var(--text-base)] truncate">{summary.member_name}</p>
                    {summary.phone && <p className="text-xs text-[var(--text-muted)]">{summary.phone}</p>}
                  </div>
                </div>
                {ms ? (
                  <div className="space-y-1 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[var(--text-muted)]">{ms.plan_name}</span>
                      <StatusBadge
                        status={ms.effective_status}
                        label={
                          ms.effective_status === "in_grace"
                            ? `En gracia · ${ms.days_overdue}d`
                            : ms.effective_status === "expired"
                            ? `Vencida hace ${ms.days_overdue}d`
                            : undefined
                        }
                      />
                    </div>
                    <p className="text-xs text-[var(--text-muted)]">
                      {ms.effective_status === "expired" || ms.effective_status === "in_grace"
                        ? `Venció el ${formatDate(ms.end_date)}`
                        : `Vence el ${formatDate(ms.end_date)}`}
                    </p>
                    {Number(ms.balance_due) > 0 && (
                      <p className="text-xs font-semibold text-amber-600 dark:text-amber-400">
                        Saldo pendiente: {formatCOP(ms.balance_due)}
                      </p>
                    )}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--text-muted)]">Sin membresías registradas — asígnale un plan desde su perfil.</p>
                )}
              </div>

              <MethodPicker value={method} onChange={setMethod} />

              {summary.renewal && (
                <Button
                  onClick={chargeRenewal}
                  disabled={charging || !summary.renewal.plan_id}
                  className="w-full h-12 text-base bg-[var(--color-primary)] text-[var(--color-primary-contrast)] font-bold hover:bg-[var(--color-primary-hover)]"
                >
                  {charging ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      Cobrar {summary.renewal.plan_name} · {formatCOP(summary.renewal.price)}
                    </>
                  )}
                </Button>
              )}

              {ms && Number(ms.balance_due) > 0 && (
                <div className="flex items-center gap-2">
                  <CurrencyInput value={partialAmount} onChange={setPartialAmount} />
                  <Button
                    variant="outline"
                    onClick={payBalance}
                    disabled={payingPartial || partialAmount <= 0}
                    className="shrink-0"
                  >
                    {payingPartial ? <Loader2 className="h-4 w-4 animate-spin" /> : "Abonar"}
                  </Button>
                </div>
              )}

              {method === "cash" && (
                <p className="text-xs text-[var(--text-muted)]">
                  El efectivo entra al turno de caja abierto.{" "}
                  <Link href="/payments/cash" className="underline hover:text-[var(--text-base)]">Ver caja</Link>
                </p>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {!summary && !loadingSummary && (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <UserRound className="h-8 w-8 text-[var(--text-muted)] opacity-40" />
            <p className="text-sm text-[var(--text-muted)]">
              Busca un miembro para ver su renovación sugerida y saldo.
            </p>
          </div>
        )}
      </GlassCard>

      {/* Productos + carrito */}
      <GlassCard className="p-4 lg:col-span-3 space-y-4 self-start">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-[var(--color-primary)]" />
            <h2 className="text-sm font-semibold text-[var(--text-base)]">Venta de productos</h2>
          </div>
          <div className="relative w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[var(--text-muted)]" />
            <Input
              value={productQuery}
              onChange={(e) => setProductQuery(e.target.value)}
              placeholder="Buscar producto..."
              className="pl-8 h-8 text-sm"
            />
          </div>
        </div>

        {products.loading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="skeleton h-20 rounded-xl" />
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <p className="text-sm text-[var(--text-muted)] py-6 text-center">
            {products.data.length === 0
              ? "Sin productos en el catálogo — créalos en la pestaña Productos."
              : "Ningún producto coincide con la búsqueda."}
          </p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-72 overflow-y-auto pr-1">
            {filteredProducts.map((p) => {
              const out = p.stock <= 0;
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => !out && addToCart(p)}
                  disabled={out}
                  className={cn(
                    "rounded-xl border border-[var(--border-base)] bg-[var(--bg-base)] p-3 text-left transition-ui",
                    out
                      ? "opacity-50 cursor-not-allowed"
                      : "hover:border-[var(--color-primary)]/60 active:scale-[0.98]"
                  )}
                >
                  <p className="text-sm font-medium text-[var(--text-base)] truncate">{p.name}</p>
                  <p className="text-sm font-bold text-[var(--text-base)] font-mono">{formatCOP(p.price)}</p>
                  <p
                    className={cn(
                      "text-[11px]",
                      out
                        ? "text-red-500 font-semibold"
                        : p.stock <= p.low_stock_threshold
                        ? "text-amber-600 dark:text-amber-400 font-semibold"
                        : "text-[var(--text-muted)]"
                    )}
                  >
                    {out ? "Agotado" : `Stock: ${p.stock}`}
                  </p>
                </button>
              );
            })}
          </div>
        )}

        {/* Carrito */}
        <div className="rounded-xl border border-[var(--border-base)] bg-[var(--bg-base)] p-3 space-y-2">
          <div className="flex items-center gap-2">
            <ShoppingCart className="h-4 w-4 text-[var(--text-muted)]" />
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Carrito {memberId && summary ? `· ${summary.member_name}` : "· venta de mostrador"}
            </p>
          </div>
          {cartItems.length === 0 ? (
            <p className="text-sm text-[var(--text-muted)]">Toca un producto para agregarlo.</p>
          ) : (
            <>
              <AnimatePresence initial={false}>
                {cartItems.map(({ product, qty }) => (
                  <motion.div
                    key={product.id}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.18 }}
                    className="flex items-center gap-2"
                  >
                    <span className="flex-1 text-sm text-[var(--text-base)] truncate">{product.name}</span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => setQty(product.id, qty - 1)}
                        className="h-6 w-6 rounded-md border border-[var(--border-base)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-base)]"
                      >
                        <Minus className="h-3 w-3" />
                      </button>
                      <span className="w-6 text-center text-sm font-semibold text-[var(--text-base)] tabular-nums">{qty}</span>
                      <button
                        type="button"
                        onClick={() => qty < product.stock && setQty(product.id, qty + 1)}
                        className="h-6 w-6 rounded-md border border-[var(--border-base)] flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-base)]"
                      >
                        <Plus className="h-3 w-3" />
                      </button>
                    </div>
                    <span className="w-24 text-right text-sm font-mono text-[var(--text-base)]">
                      {formatCOP(Number(product.price) * qty)}
                    </span>
                    <button
                      type="button"
                      onClick={() => setQty(product.id, 0)}
                      className="h-6 w-6 rounded-md flex items-center justify-center text-[var(--text-muted)] hover:text-red-500"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
              <div className="flex items-center justify-between border-t border-[var(--border-base)] pt-2">
                <MethodPicker value={method} onChange={setMethod} />
              </div>
              <Button
                onClick={sellCart}
                disabled={selling}
                className="w-full h-11 bg-[var(--color-primary)] text-[var(--color-primary-contrast)] font-bold hover:bg-[var(--color-primary-hover)]"
              >
                {selling ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Printer className="h-4 w-4 mr-2" />
                    Cobrar {formatCOP(cartTotal)}
                  </>
                )}
              </Button>
            </>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
