import type { Tone } from "@/components/ui";

import type { MembershipStatus } from "./types";

export const STATUS_TONE: Record<MembershipStatus, Tone> = {
  ok: "ok",
  in_grace: "warn",
  scheduled: "info",
  expired: "danger",
  frozen: "info",
  no_entries: "danger",
  no_membership: "neutral",
};
