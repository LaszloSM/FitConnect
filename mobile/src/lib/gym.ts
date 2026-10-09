import type { Tone } from "@/components/ui";

import { secure } from "./storage";
import type { GymSummary, MembershipStatus, QrInfo } from "./types";

export const STATUS_TONE: Record<MembershipStatus, Tone> = {
  ok: "ok",
  in_grace: "warn",
  scheduled: "info",
  expired: "danger",
  frozen: "info",
  no_entries: "danger",
  no_membership: "neutral",
};

const qrKey = (linkId: string) => `fc.qr.${linkId}`;

/** La llave del QR va al almacenamiento seguro; la copia de pantalla sale sin ella. */
export function stripQr(summary: GymSummary): GymSummary {
  void secure.set(qrKey(summary.gym.link_id), JSON.stringify(summary.qr));
  return { ...summary, qr: { ...summary.qr, secret: "" } };
}

export async function savedQr(linkId: string): Promise<QrInfo | null> {
  const raw = await secure.get(qrKey(linkId));
  return raw ? (JSON.parse(raw) as QrInfo) : null;
}
