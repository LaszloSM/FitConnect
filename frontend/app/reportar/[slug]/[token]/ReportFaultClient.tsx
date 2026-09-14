"use client";

import { useEffect, useState } from "react";
import { CheckCircleIcon as CheckCircle2, SpinnerGapIcon as Loader2, WarningIcon as TriangleAlert, WrenchIcon as Wrench } from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/errors";

interface MachineInfo {
  gym_name: string;
  machine_name: string;
  area: string | null;
  already_reported: boolean;
}

/**
 * Lo abre quien escanea el QR pegado en la máquina: un socio con el celular en
 * una mano y la toalla en la otra. Sin cuenta, sin menú, una sola pregunta.
 */
export default function ReportFaultClient({ slug, token }: { slug: string; token: string }) {
  const [info, setInfo] = useState<MachineInfo | null>(null);
  const [loadError, setLoadError] = useState("");
  const [description, setDescription] = useState("");
  const [name, setName] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [sendError, setSendError] = useState("");

  const base = `/api/v1/public/machines/${encodeURIComponent(slug)}/${encodeURIComponent(token)}`;

  useEffect(() => {
    apiClient()
      .get<MachineInfo>(base)
      .then((r) => setInfo(r.data))
      .catch((err) => setLoadError(parseApiError(err, "No pudimos abrir este código.")));
  }, [base]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (description.trim().length < 3) {
      setSendError("Cuéntanos en pocas palabras qué le pasa.");
      return;
    }
    setSending(true);
    setSendError("");
    try {
      await apiClient().post(`${base}/fault`, {
        description: description.trim(),
        reporter_name: name.trim() || null,
      });
      setSent(true);
    } catch (err) {
      setSendError(parseApiError(err, "No se pudo enviar. Avísale a recepción."));
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="min-h-screen bg-[var(--bg-base)] flex items-start sm:items-center justify-center p-5">
      <div className="w-full max-w-sm rounded-2xl border border-[var(--border-base)] bg-[var(--bg-card)] p-6 space-y-5">
        {!info && !loadError && (
          <div className="flex items-center gap-2 text-[var(--text-muted)] text-sm py-6 justify-center">
            <Loader2 className="h-4 w-4 animate-spin" /> Cargando…
          </div>
        )}

        {loadError && (
          <div className="space-y-2 text-center py-4">
            <TriangleAlert className="h-8 w-8 mx-auto" style={{ color: "var(--signal-warn)" }} />
            <p className="text-base font-semibold text-[var(--text-base)]">{loadError}</p>
          </div>
        )}

        {info && sent && (
          <div className="space-y-2 text-center py-4">
            <CheckCircle2 className="h-10 w-10 mx-auto" style={{ color: "var(--signal-ok)" }} />
            <p className="text-lg font-semibold text-[var(--text-base)]">Gracias, ya les avisamos</p>
            <p className="text-sm text-[var(--text-muted)]">
              {info.machine_name} queda fuera de servicio hasta que la revisen.
            </p>
          </div>
        )}

        {info && !sent && (
          <>
            <div className="space-y-1">
              <p className="text-sm font-medium text-[var(--text-muted)]">{info.gym_name}</p>
              <h1 className="text-xl font-bold text-[var(--text-base)] flex items-center gap-2">
                <Wrench className="h-5 w-5 text-[var(--text-muted)]" aria-hidden />
                {info.machine_name}
              </h1>
              {info.area && <p className="text-sm text-[var(--text-muted)]">{info.area}</p>}
            </div>

            {info.already_reported && (
              <p
                className="text-sm rounded-lg px-3 py-2 border"
                style={{ color: "var(--signal-warn)", background: "var(--signal-warn-bg)", borderColor: "var(--signal-warn-line)" }}
              >
                Ya está reportada como dañada. Si ves algo nuevo, cuéntalo igual.
              </p>
            )}

            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="fault">¿Qué le pasa?</Label>
                <textarea
                  id="fault"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  maxLength={1000}
                  placeholder="La banda patina y se frena sola"
                  className="w-full rounded-md border border-[var(--border-base)] bg-[var(--bg-input)] px-3 py-2 text-base text-[var(--text-base)] placeholder:text-[var(--text-placeholder)] resize-none"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reporter">Tu nombre (opcional)</Label>
                <Input id="reporter" value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
              </div>
              {sendError && (
                <p className="text-sm" style={{ color: "var(--signal-danger)" }} role="alert">{sendError}</p>
              )}
              <Button type="submit" className="w-full h-11 text-base" disabled={sending}>
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Reportar avería"}
              </Button>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
