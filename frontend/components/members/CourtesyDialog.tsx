"use client";

import { useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient, newIdempotencyKey, postOnce } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { GiftIcon as Gift, SpinnerGapIcon as Loader2 } from "@phosphor-icons/react";

const DAY_PRESETS = [3, 7, 15, 30];

interface PlanOption {
  id: string;
  name: string;
}

/** Membresía regalada por el gym: $0, sin deuda ni ingreso, con motivo auditado. */
export function CourtesyDialog({
  memberId,
  memberName,
  plans,
  onDone,
}: {
  memberId: string;
  memberName: string;
  plans: PlanOption[];
  onDone: () => void;
}) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(7);
  const [reason, setReason] = useState("");
  const [planId, setPlanId] = useState("");
  const [saving, setSaving] = useState(false);
  const keyRef = useRef(newIdempotencyKey());

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.accessToken) return;
    if (reason.trim().length < 3) {
      toast.error("Escribe el motivo de la cortesía");
      return;
    }
    setSaving(true);
    try {
      await postOnce(
        apiClient(session.accessToken as string),
        "/api/v1/member-plans/courtesy",
        { member_id: memberId, days, reason: reason.trim(), plan_id: planId || null },
        keyRef,
      );
      toast.success(`Cortesía de ${days} ${days === 1 ? "día" : "días"} para ${memberName.split(" ")[0]}`);
      setOpen(false);
      setReason("");
      onDone();
    } catch (err) {
      toast.error(parseApiError(err, "No se pudo dar la cortesía"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button type="button" variant="outline" size="sm">
            <Gift className="h-4 w-4 mr-1.5" />
            Dar cortesía
          </Button>
        }
      />
      <DialogContent className="bg-[var(--bg-card)] text-[var(--text-base)] sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="font-display">Dar cortesía</DialogTitle>
          <DialogDescription>
            Acceso sin costo para {memberName}. No suma a ingresos ni crea deuda, y queda en auditoría con el motivo.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>Días</Label>
            <div className="flex flex-wrap items-center gap-2">
              {DAY_PRESETS.map((d) => (
                <Button
                  key={d}
                  type="button"
                  size="sm"
                  variant={days === d ? "secondary" : "outline"}
                  onClick={() => setDays(d)}
                  aria-pressed={days === d}
                >
                  {d}
                </Button>
              ))}
              <Input
                type="number"
                min={1}
                max={365}
                aria-label="Otro número de días"
                value={days}
                onChange={(e) => setDays(Math.min(365, Math.max(1, Number(e.target.value) || 1)))}
                className="w-20"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="courtesy-reason">Motivo</Label>
            <Input
              id="courtesy-reason"
              value={reason}
              maxLength={255}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Semana de prueba, compensación, premio…"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="courtesy-plan">Con los beneficios de (opcional)</Label>
            <select
              id="courtesy-plan"
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
              className="w-full h-10 md:h-9 rounded-[var(--radius-md)] border border-line bg-field px-3 text-sm text-ink"
            >
              <option value="">Gimnasio y clases</option>
              {plans.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button type="submit" disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Dar {days} {days === 1 ? "día" : "días"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
