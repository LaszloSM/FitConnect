import { toast } from "sonner";
import { formatDateTime } from "@/lib/format";
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

/** Recibo térmico 80mm (impresora de tirilla). */
export async function openReceipt(client: AxiosInstance, paymentId: string) {
  try {
    const { data } = await client.get(`/api/v1/payments/${paymentId}/receipt`);
    const items: { description: string; quantity: number; unit_price: string; subtotal: string }[] =
      data.items ?? [];
    const itemRows = items
      .map(
        (i) =>
          `<div class="row"><span>${i.quantity} × ${i.description}</span><span>$${Number(i.subtotal).toLocaleString("es-CO")}</span></div>`
      )
      .join("");
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>Recibo ${data.number}</title>
      <style>
        @page { size: 80mm auto; margin: 4mm; }
        body { font-family: -apple-system, system-ui, sans-serif; width: 72mm; margin: 0 auto; color: #111; }
        h1 { font-size: 14px; text-align: center; margin: 0 0 2px; }
        .num { text-align: center; font-size: 12px; color: #555; margin-bottom: 8px; }
        .row { display: flex; justify-content: space-between; font-size: 12px; padding: 2px 0; }
        .items { border-top: 1px dashed #ccc; margin-top: 4px; padding-top: 4px; }
        .total { border-top: 1px dashed #999; margin-top: 6px; padding-top: 6px; font-weight: 700; font-size: 14px; }
        .foot { text-align: center; font-size: 10px; color: #888; margin-top: 10px; }
      </style></head><body>
      <h1>Recibo de pago</h1>
      <div class="num">${data.number}</div>
      ${data.member_name ? `<div class="row"><span>Miembro</span><span>${data.member_name}</span></div>` : ""}
      ${data.member_document ? `<div class="row"><span>Documento</span><span>${data.member_document}</span></div>` : ""}
      <div class="row"><span>Concepto</span><span>${data.concept}</span></div>
      <div class="row"><span>Método</span><span>${METHOD_LABELS[data.method] ?? data.method ?? "-"}</span></div>
      ${itemRows ? `<div class="items">${itemRows}</div>` : ""}
      <div class="row total"><span>Total</span><span>$${Number(data.amount).toLocaleString("es-CO")}</span></div>
      <div class="foot">${formatDateTime(data.issued_at)}</div>
      <script>window.onload = () => window.print();</script>
      </body></html>`;
    const w = window.open("", "_blank", "width=380,height=600");
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  } catch (err) {
    toast.error(parseApiError(err, "No se pudo abrir el recibo"));
  }
}
