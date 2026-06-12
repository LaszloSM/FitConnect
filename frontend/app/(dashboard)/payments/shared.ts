import { toast } from "sonner";
import type { AxiosInstance } from "axios";

export const METHOD_LABELS: Record<string, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  card: "Tarjeta",
  wompi: "Wompi",
};

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
  amount: number;
  method: string | null;
  status: string;
  concept: string;
  external_ref?: string | null;
  created_at: string;
  items?: PaymentItemRow[];
}

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
      <div class="foot">${new Date(data.issued_at).toLocaleString("es-CO")}</div>
      <script>window.onload = () => window.print();</script>
      </body></html>`;
    const w = window.open("", "_blank", "width=380,height=600");
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  } catch (err) {
    const e = err as { response?: { data?: { detail?: string } } };
    toast.error(e.response?.data?.detail ?? "No se pudo abrir el recibo");
  }
}
