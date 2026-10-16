import { toast } from "sonner";
import { formatCOP } from "@/lib/format";
import { escapeHtml, openThermal, thermalRow } from "@/lib/thermal";
import { parseApiError } from "@/lib/errors";
import type { AxiosInstance } from "axios";

export const METHOD_LABELS: Record<string, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  card: "Tarjeta",
  wompi: "Wompi",
};

export const KIND_LABELS: Record<string, string> = {
  membership: "Membresía",
  day_pass: "Pase del día",
  product: "Productos",
  other: "Otro",
};

/**
 * Catálogo de caja. Espejo de `backend/app/services/cash_catalog.py`;
 * `test_cash_catalog_contract.py` falla si las dos listas divergen.
 */
export const EXPENSE_LABELS: Record<string, string> = {
  servicios: "Servicios",
  nomina: "Nómina",
  insumos: "Insumos",
  devolucion: "Devoluciones",
  otros: "Otros",
};

// La devolución no se escoge a mano: la registra el flujo de devolución del pago.
export const MANUAL_EXPENSE_CATEGORIES = ["servicios", "nomina", "insumos", "otros"] as const;

export const DENOMINATIONS = [100_000, 50_000, 20_000, 10_000, 5_000, 2_000, 1_000, 500, 200, 100, 50] as const;

export const KIND_TONES: Record<string, "success" | "info" | "violet" | "neutral"> = {
  membership: "success",
  day_pass: "info",
  product: "info",
  other: "neutral",
};

export interface DestinationAccount {
  id: string;
  type: "nequi" | "daviplata" | "bancolombia" | "bank";
  label: string;
  account_number: string;
  holder_name: string;
  breb_key: string | null;
  qr_url: string | null;
}

export interface PaymentItemRow {
  id: string;
  product_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
}

export interface PaymentRow {
  id: string;
  member_id: string | null;
  member_name?: string | null;
  member_phone?: string | null;
  amount: number;
  method: string | null;
  status: string;
  concept: string;
  kind?: string;
  external_ref?: string | null;
  transfer_reference?: string | null;
  destination_account_id?: string | null;
  destination_account?: DestinationAccount | null;
  proof_url?: string | null;
  proof_uploaded_at?: string | null;
  card_approval_code?: string | null;
  card_terminal?: string | null;
  discount_amount?: number;
  void_reason?: string | null;
  refund_reason?: string | null;
  /** Proyección del libro de movimientos: cuánto se devolvió o corrigió. */
  refunded_amount?: number | string;
  refunded_at?: string | null;
  created_at: string;
  items?: PaymentItemRow[];
}

export interface PendingTransferRow extends PaymentRow {
  elapsed_minutes: number;
}

/** Texto para WhatsApp con los datos de la transferencia (cuenta, llave, referencia). */
export function transferWhatsappText(
  firstName: string,
  amount: string,
  reference: string | null | undefined,
  account: DestinationAccount | null | undefined,
  concept?: string,
): string {
  const lines = [`Hola ${firstName} 👋`, `Para ${concept ? concept.toLowerCase() : "tu pago"} son ${amount}.`];
  if (account) {
    lines.push(`Transfiere a ${account.label}: ${account.account_number} (${account.holder_name}).`);
    if (account.breb_key) lines.push(`Llave Bre-B: ${account.breb_key}`);
  }
  if (reference) lines.push(`Escribe la referencia ${reference} en la descripción del giro y envíanos el pantallazo.`);
  return lines.join("\n");
}

/** Dígitos para wa.me: un celular colombiano de 10 dígitos recibe el +57. */
export function waDigits(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("3")) return `57${digits}`;
  return digits;
}

export function formatElapsed(minutes: number): string {
  if (minutes < 1) return "hace un momento";
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  return `hace ${days} d`;
}

/** Abre el comprobante PDF (con logo y datos fiscales) en una pestaña nueva. */
export async function openReceiptPdf(client: AxiosInstance, paymentId: string) {
  try {
    const { data } = await client.get(`/api/v1/payments/${paymentId}/receipt.pdf`, { responseType: "blob" });
    const url = URL.createObjectURL(data);
    window.open(url, "_blank");
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
  } catch (err) {
    toast.error(parseApiError(err, "No se pudo generar el PDF"));
  }
}

/** Enlace público firmado al PDF; lo abre en WhatsApp del socio (o copia el enlace). */
export async function shareReceiptWhatsapp(
  client: AxiosInstance,
  paymentId: string,
  phone: string | null | undefined,
  firstName: string,
) {
  try {
    const { data } = await client.get(`/api/v1/payments/${paymentId}/receipt-link`);
    const url: string = data.url;
    await navigator.clipboard.writeText(url).catch(() => {});
    const text = encodeURIComponent(`Hola ${firstName} 👋 aquí está tu comprobante ${data.receipt_number}: ${url}`);
    const digits = waDigits(phone);
    window.open(digits ? `https://wa.me/${digits}?text=${text}` : `https://wa.me/?text=${text}`, "_blank");
    toast.success("Enlace del comprobante copiado (válido 30 días)");
  } catch (err) {
    toast.error(parseApiError(err, "No se pudo crear el enlace"));
  }
}

interface ReceiptData {
  number: string;
  issued_label: string;
  status: string;
  member_name: string | null;
  member_document: string | null;
  concept: string | null;
  method: string | null;
  amount: string;
  subtotal: string;
  discount_amount: string;
  discount_note: string | null;
  transfer_reference: string | null;
  card_approval_code: string | null;
  cashier_name: string | null;
  amount_in_words: string;
  items: { description: string; quantity: number; unit_price: string; subtotal: string }[];
  gym: { name: string; legal_name: string | null; nit: string | null; tax_regime: string | null; address: string | null; phone: string | null; logo_url: string | null };
}

const STAMPS: Record<string, string> = { refunded: "DEVUELTO", voided: "ANULADO", failed: "RECHAZADO" };

export function receiptTicketHtml(d: ReceiptData): string {
  const e = escapeHtml;
  const g = d.gym;
  const fiscal = [
    g.legal_name,
    [g.nit ? `NIT ${g.nit}` : null, g.tax_regime].filter(Boolean).join(" · "),
    g.address,
    g.phone ? `Tel. ${g.phone}` : null,
  ].filter(Boolean);
  const items = d.items?.length
    ? d.items
    : [{ description: d.concept ?? "Pago", quantity: 1, unit_price: d.subtotal, subtotal: d.subtotal }];
  const discount = Number(d.discount_amount) || 0;
  const stamp = STAMPS[d.status];
  const idDoc = (d.member_document ?? "").replace("IdType.", "");
  return `
    <div class="center">
      ${g.logo_url ? `<img class="logo" src="${e(g.logo_url)}" alt="" onerror="this.remove()">` : ""}
      <div class="gym">${e(g.name)}</div>
      ${fiscal.map((x) => `<div class="fiscal">${e(x)}</div>`).join("")}
    </div>
    <hr class="cut">
    <div class="center">
      <div class="eyebrow">Comprobante de pago</div>
      <div class="num">${e(d.number)}</div>
      <div>${e(d.issued_label)}</div>
    </div>
    ${stamp ? `<div class="stamp">${stamp}</div>` : ""}
    <hr class="cut">
    ${thermalRow('<span class="k">Cliente</span>', e(d.member_name ?? "Venta de mostrador"))}
    ${idDoc ? thermalRow('<span class="k">Documento</span>', e(idDoc)) : ""}
    <hr class="cut">
    ${items
      .map(
        (i) => `<div class="item"><div class="desc">${e(i.description)}</div>${thermalRow(
          `${i.quantity} × ${formatCOP(i.unit_price)}`,
          formatCOP(i.subtotal),
        )}</div>`,
      )
      .join("")}
    ${discount > 0 ? `<hr class="cut">${thermalRow("Subtotal", formatCOP(d.subtotal))}${thermalRow(e(d.discount_note ? `Descuento · ${d.discount_note}` : "Descuento"), "-" + formatCOP(discount))}` : ""}
    ${thermalRow("TOTAL", formatCOP(d.amount), "total")}
    <div class="words">Son: ${e(d.amount_in_words)}.</div>
    <hr class="cut">
    ${thermalRow('<span class="k">Pago</span>', e(METHOD_LABELS[d.method ?? ""] ?? d.method ?? "—"))}
    ${d.transfer_reference ? thermalRow("Referencia", e(d.transfer_reference)) : ""}
    ${d.card_approval_code ? thermalRow("Aprobación", e(d.card_approval_code)) : ""}
    ${d.cashier_name ? thermalRow("Atendió", e(d.cashier_name)) : ""}
    <hr class="cut">
    <div class="center">
      <div class="thanks">¡Gracias por entrenar con nosotros!</div>
      <div class="small">Conserva este comprobante como soporte de tu pago.</div>
      <div class="small">No es factura electrónica de venta.</div>
      <div class="small" style="margin-top:2mm">LSMFit</div>
    </div>`;
}

/** Recibo en tirilla térmica (58 u 80 mm). */
export async function openReceipt(client: AxiosInstance, paymentId: string) {
  try {
    const { data } = await client.get<ReceiptData>(`/api/v1/payments/${paymentId}/receipt`);
    if (!openThermal(`Recibo ${data.number}`, receiptTicketHtml(data))) {
      toast.error("El navegador bloqueó la ventana del recibo. Permite ventanas emergentes para este sitio.");
    }
  } catch (err) {
    toast.error(parseApiError(err, "No se pudo abrir el recibo"));
  }
}
