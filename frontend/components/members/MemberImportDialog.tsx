"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { StatusBadge, type StatusTone } from "@/components/ui/status-badge";
import { ImportFollowUp } from "@/components/members/ImportFollowUp";
import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { formatDate, formatDateTime } from "@/lib/format";
import {
  FileXlsIcon as FileSpreadsheet,
  DownloadSimpleIcon as Download,
  UploadSimpleIcon as Upload,
  SpinnerGapIcon as Loader2,
  ArrowCounterClockwiseIcon as Undo,
  WarningIcon as Warning,
} from "@phosphor-icons/react";

type Action = "create" | "update" | "unchanged" | "error";

interface Column {
  index: number;
  header: string;
  field: string | null;
  samples: string[];
}

interface PreviewRow {
  rows: number[];
  name: string | null;
  id_number: string | null;
  action: Action;
  fill: string[];
  conflicts: { field: string; label: string; current: string; incoming: string }[];
  membership: { plan_name: string; start: string; end: string; entries: number | null } | null;
  warnings: string[];
  errors: { field: string; message: string }[];
}

interface Summary {
  create: number;
  update: number;
  unchanged: number;
  error: number;
  memberships: number;
  conflicts: number;
  warnings: number;
  rows: number;
}

interface Preview {
  file_name: string | null;
  columns: Column[];
  fields: { key: string; label: string }[];
  summary: Summary;
  rows: PreviewRow[];
  truncated: boolean;
  unmatched_plans: { name: string; count: number }[];
  unmatched_trainers: { name: string; count: number }[];
  plans: { id: string; name: string; duration_days: number }[];
  trainers: { id: string; name: string }[];
}

interface Batch {
  id: string;
  file_name: string | null;
  status: "applied" | "undone";
  created_at: string;
  created_by: string | null;
  counts: Partial<Summary>;
}

interface ApplyResult {
  batch_id: string;
  summary: Summary;
  errors: { row: number; field: string; message: string }[];
}

const ACTION_BADGE: Record<Action, { label: string; tone: StatusTone }> = {
  create: { label: "Nuevo", tone: "success" },
  update: { label: "Se completa", tone: "info" },
  unchanged: { label: "Sin cambios", tone: "neutral" },
  error: { label: "Con error", tone: "danger" },
};

const SELECT_CLASS =
  "h-9 w-full rounded-[var(--radius-md)] border border-[var(--border-base)] bg-[var(--bg-input)] px-2.5 text-sm text-[var(--text-base)] focus:outline-none focus:ring-2 focus:ring-[var(--brand)]";

const KEEP_AS_IMPORTED = "";

type Step = "file" | "review" | "done";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

interface Overrides {
  mapping?: Record<string, string | null>;
  on_conflict?: "keep" | "file";
  plan_map?: Record<string, string | null>;
  trainer_map?: Record<string, string | null>;
}

export function MemberImportDialog({ onImported }: { onImported: () => void }) {
  const { data: session } = useSession();
  const token = session?.accessToken as string | undefined;
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<Step>("file");
  const [file, setFile] = useState<File | null>(null);
  const [working, setWorking] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [planMap, setPlanMap] = useState<Record<string, string | null>>({});
  const [trainerMap, setTrainerMap] = useState<Record<string, string | null>>({});
  const [onConflict, setOnConflict] = useState<"keep" | "file">("keep");
  const [onlyAttention, setOnlyAttention] = useState(false);
  const [showColumns, setShowColumns] = useState<boolean | null>(null);
  const [result, setResult] = useState<ApplyResult | null>(null);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [undoing, setUndoing] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep("file");
    setFile(null);
    setPreview(null);
    setMapping({});
    setPlanMap({});
    setTrainerMap({});
    setOnConflict("keep");
    setOnlyAttention(false);
    setShowColumns(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const loadBatches = useCallback(async () => {
    if (!token) return;
    try {
      const res = await apiClient(token).get<Batch[]>("/api/v1/members/import/batches");
      setBatches(res.data);
    } catch {
      setBatches([]);
    }
  }, [token]);

  useEffect(() => {
    if (open) loadBatches();
  }, [open, loadBatches]);

  const options = useCallback(
    (overrides?: Overrides) => ({
      mapping: overrides?.mapping ?? mapping,
      on_conflict: overrides?.on_conflict ?? onConflict,
      plan_map: overrides?.plan_map ?? planMap,
      trainer_map: overrides?.trainer_map ?? trainerMap,
    }),
    [mapping, onConflict, planMap, trainerMap],
  );

  const send = async (path: "preview" | "commit", opts: object) => {
    if (!token || !file) throw new Error("sin archivo");
    const form = new FormData();
    form.append("file", file);
    form.append("options", JSON.stringify(opts));
    return apiClient(token).post(`/api/v1/members/import/${path}`, form, {
      headers: { "Content-Type": undefined },
      timeout: 120_000,
    });
  };

  const runPreview = async (overrides?: Overrides) => {
    setWorking(true);
    try {
      const res = await send("preview", options(overrides));
      const data = res.data as Preview;
      setPreview(data);
      setMapping(Object.fromEntries(data.columns.map((c) => [String(c.index), c.field])));
      setStep("review");
    } catch (err) {
      toast.error(parseApiError(err, "No se pudo leer el archivo"));
    } finally {
      setWorking(false);
    }
  };

  const commit = async () => {
    setWorking(true);
    try {
      const res = await send("commit", options());
      setResult(res.data as ApplyResult);
      setStep("done");
      onImported();
      loadBatches();
      const s = (res.data as ApplyResult).summary;
      toast.success(`${s.create} socio(s) nuevo(s) y ${s.update} completado(s)`);
    } catch (err) {
      toast.error(parseApiError(err, "No se pudo importar"));
    } finally {
      setWorking(false);
    }
  };

  const undo = async (batchId: string) => {
    if (!token) return;
    if (!window.confirm("¿Deshacer esta importación? Se borran los socios que creó y se restauran los datos que completó.")) return;
    setUndoing(batchId);
    try {
      const res = await apiClient(token).post(`/api/v1/members/import/batches/${batchId}/undo`);
      const r = res.data as { members_removed: number; members_kept: number; fields_restored: number };
      toast.success(
        `Importación deshecha: ${r.members_removed} ficha(s) borrada(s), ${r.fields_restored} dato(s) restaurado(s)` +
          (r.members_kept ? `. ${r.members_kept} se conservaron porque ya tienen cobros.` : ""),
      );
      onImported();
      loadBatches();
      if (result?.batch_id === batchId) reset();
    } catch (err) {
      toast.error(parseApiError(err, "No se pudo deshacer"));
    } finally {
      setUndoing(null);
    }
  };

  const downloadTemplate = async () => {
    if (!token) return;
    try {
      const res = await apiClient(token).get("/api/v1/members/import/template.xlsx", { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "plantilla_socios.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("No se pudo descargar la plantilla");
    }
  };

  const visibleRows = useMemo(() => {
    if (!preview) return [];
    const rows = onlyAttention
      ? preview.rows.filter((r) => r.action === "error" || r.conflicts.length || r.warnings.length)
      : preview.rows;
    return rows.slice(0, 300);
  }, [preview, onlyAttention]);

  const toImport = preview ? preview.summary.create + preview.summary.update : 0;
  const recognized = preview ? preview.columns.filter((c) => c.field).length : 0;
  // Si todo se reconoció, el mapeo queda plegado: lo importante es qué pasa con cada persona.
  const columnsOpen = showColumns ?? (preview ? recognized < preview.columns.filter((c) => c.header).length : false);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <DialogTrigger
        render={
          <Button variant="outline" className="border-[var(--border-base)]">
            <FileSpreadsheet className="h-4 w-4 mr-2" />
            Importar
          </Button>
        }
      />
      <DialogContent className="bg-[var(--bg-card)] border border-[var(--border-base)] text-[var(--text-base)] sm:max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-[var(--text-base)] font-display">Importar socios</DialogTitle>
          <DialogDescription>
            {step === "file" &&
              "Sube la exportación de tu programa anterior tal como sale (Excel o CSV) o la plantilla de LSMFit. Antes de guardar verás qué pasará con cada persona."}
            {step === "review" &&
              "Revisa cómo se leyó el archivo. Nada se guarda hasta que confirmes. Si la cédula ya existe, solo se llenan los datos que falten."}
            {step === "done" && "Listo. Si algo no quedó bien, puedes deshacer esta importación completa."}
          </DialogDescription>
        </DialogHeader>

        {step === "file" && (
          <div className="space-y-5 py-1">
            <div className="space-y-1.5">
              <label htmlFor="import-file" className="text-sm font-medium">
                Archivo (.xlsx, .xls o .csv, hasta 5 MB)
              </label>
              <input
                id="import-file"
                ref={inputRef}
                type="file"
                accept=".xlsx,.xls,.csv,text/csv,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-[var(--text-muted)] file:mr-3 file:rounded-[var(--radius-md)] file:border-0 file:bg-[var(--bg-muted)] file:px-3 file:py-2 file:text-sm file:font-medium file:text-[var(--text-base)]"
              />
              <p className="text-[13px] text-[var(--text-muted)]">
                Se reconocen encabezados como Cédula, Nombre, Sexo, Fecha Nac, RH, EPS, Expectativa, Ingreso por
                DNI, Entrenador, Plan y Fecha vencimiento. Con el plan y el vencimiento el socio entra al
                torniquete desde el primer día.
              </p>
            </div>
            <Button type="button" variant="ghost" onClick={downloadTemplate} className="px-0 text-[var(--brand-ink)]">
              <Download className="h-4 w-4 mr-2" />
              Descargar plantilla de LSMFit
            </Button>

            {batches.length > 0 && (
              <div className="space-y-2">
                <p className="text-sm font-semibold">Importaciones recientes</p>
                <ul className="divide-y divide-[var(--border-base)] rounded-[var(--radius-md)] border border-[var(--border-base)]">
                  {batches.slice(0, 5).map((b) => (
                    <li key={b.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{b.file_name || "Archivo sin nombre"}</p>
                        <p className="text-[12.5px] text-[var(--text-muted)]">
                          {formatDateTime(b.created_at)}
                          {b.created_by ? ` · ${b.created_by}` : ""} · {b.counts.create ?? 0} nuevos,{" "}
                          {b.counts.update ?? 0} completados
                        </p>
                      </div>
                      {b.status === "undone" ? (
                        <StatusBadge status="import" label="Deshecha" tone="neutral" />
                      ) : (
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={undoing === b.id}
                          onClick={() => undo(b.id)}
                          className="text-[var(--signal-danger)]"
                        >
                          {undoing === b.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Undo className="h-4 w-4 mr-1" />}
                          Deshacer
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}

        {step === "review" && preview && (
          <div className="space-y-6 py-1">
            <div className="flex flex-wrap gap-2" aria-live="polite">
              <StatusBadge status="import" label={plural(preview.summary.create, "nuevo", "nuevos")} tone="success" />
              <StatusBadge status="import" label={`${preview.summary.update} se completan`} tone="info" />
              <StatusBadge status="import" label={`${preview.summary.unchanged} sin cambios`} tone="neutral" />
              {preview.summary.error > 0 && <StatusBadge status="import" label={`${preview.summary.error} con error`} tone="danger" />}
              <StatusBadge status="import" label={plural(preview.summary.memberships, "membresía", "membresías")} tone="neutral" />
            </div>

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold">
                  Columnas del archivo{" "}
                  <span className="font-normal text-[var(--text-muted)]">
                    · {recognized} de {preview.columns.length} reconocidas
                  </span>
                </h3>
                <Button type="button" variant="ghost" size="sm" onClick={() => setShowColumns(!columnsOpen)} aria-expanded={columnsOpen}>
                  {columnsOpen ? "Ocultar" : "Ajustar columnas"}
                </Button>
              </div>
              {columnsOpen && (
              <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2">
                {preview.columns.map((c) => (
                  <label key={c.index} className="space-y-1">
                    <span className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate font-medium">{c.header || `Columna ${c.index + 1}`}</span>
                      <span className="truncate text-[12.5px] text-[var(--text-muted)]">{c.samples.join(" · ")}</span>
                    </span>
                    <select
                      className={SELECT_CLASS}
                      value={mapping[String(c.index)] ?? ""}
                      onChange={(e) => {
                        const next = { ...mapping, [String(c.index)]: e.target.value || null };
                        setMapping(next);
                        runPreview({ mapping: next });
                      }}
                    >
                      <option value="">No importar</option>
                      {preview.fields.map((f) => (
                        <option key={f.key} value={f.key}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </div>
              )}
            </section>

            {preview.unmatched_plans.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-base font-semibold">Planes que no existen en LSMFit</h3>
                <p className="text-[13px] text-[var(--text-muted)]">
                  Elige a qué plan equivale cada uno. Si lo dejas como está, la membresía se guarda con ese nombre y
                  su fecha de vencimiento.
                </p>
                {preview.unmatched_plans.map((p) => (
                  <label key={p.name} className="grid items-center gap-2 sm:grid-cols-[1fr_1.2fr]">
                    <span className="text-sm">
                      {p.name} <span className="text-[var(--text-muted)]">({p.count})</span>
                    </span>
                    <select
                      className={SELECT_CLASS}
                      value={planMap[p.name] ?? KEEP_AS_IMPORTED}
                      onChange={(e) => {
                        const next = { ...planMap, [p.name]: e.target.value || null };
                        setPlanMap(next);
                        runPreview({ plan_map: next });
                      }}
                    >
                      <option value={KEEP_AS_IMPORTED}>Guardar como «{p.name}»</option>
                      {preview.plans.map((pl) => (
                        <option key={pl.id} value={pl.id}>
                          {pl.name} ({pl.duration_days} días)
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </section>
            )}

            {preview.unmatched_trainers.length > 0 && (
              <section className="space-y-2">
                <h3 className="text-base font-semibold">Entrenadores que no existen en LSMFit</h3>
                {preview.unmatched_trainers.map((t) => (
                  <label key={t.name} className="grid items-center gap-2 sm:grid-cols-[1fr_1.2fr]">
                    <span className="text-sm">
                      {t.name} <span className="text-[var(--text-muted)]">({t.count})</span>
                    </span>
                    <select
                      className={SELECT_CLASS}
                      value={trainerMap[t.name] ?? ""}
                      onChange={(e) => {
                        const next = { ...trainerMap, [t.name]: e.target.value || null };
                        setTrainerMap(next);
                        runPreview({ trainer_map: next });
                      }}
                    >
                      <option value="">Sin entrenador</option>
                      {preview.trainers.map((tr) => (
                        <option key={tr.id} value={tr.id}>
                          {tr.name}
                        </option>
                      ))}
                    </select>
                  </label>
                ))}
              </section>
            )}

            {preview.summary.conflicts > 0 && (
              <section className="space-y-2">
                <h3 className="text-base font-semibold">Datos distintos a los de LSMFit</h3>
                <p className="text-[13px] text-[var(--text-muted)]">
                  {preview.summary.conflicts} dato(s) del archivo no coinciden con lo que ya está guardado.
                </p>
                <div className="space-y-1.5 text-sm">
                  <label className="flex items-center gap-2">
                    <input type="radio" name="conflict" checked={onConflict === "keep"} onChange={() => { setOnConflict("keep"); runPreview({ on_conflict: "keep" }); }} />
                    Conservar lo que ya está en LSMFit (recomendado)
                  </label>
                  <label className="flex items-center gap-2">
                    <input type="radio" name="conflict" checked={onConflict === "file"} onChange={() => { setOnConflict("file"); runPreview({ on_conflict: "file" }); }} />
                    Reemplazar con lo del archivo
                  </label>
                </div>
              </section>
            )}

            <section className="space-y-2">
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-base font-semibold">Personas ({preview.summary.rows} filas)</h3>
                <label className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                  <input type="checkbox" checked={onlyAttention} onChange={(e) => setOnlyAttention(e.target.checked)} />
                  Solo lo que requiere atención
                </label>
              </div>
              <ul className="max-h-[360px] divide-y divide-[var(--border-base)] overflow-y-auto rounded-[var(--radius-md)] border border-[var(--border-base)]">
                {visibleRows.map((r) => (
                  <li key={r.rows.join("-")} className="space-y-1 px-3 py-2.5 text-sm">
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span className="num text-[12.5px] text-[var(--text-muted)]">Fila {r.rows.join(", ")}</span>
                      <span className="font-medium">{r.name || "Sin nombre"}</span>
                      {r.id_number && <span className="num text-[var(--text-muted)]">{r.id_number}</span>}
                      <StatusBadge status="import" label={ACTION_BADGE[r.action].label} tone={ACTION_BADGE[r.action].tone} className="ml-auto" />
                    </div>
                    {r.fill.length > 0 && r.action === "update" && (
                      <p className="text-[13px] text-[var(--text-muted)]">Se llena: {r.fill.join(", ")}</p>
                    )}
                    {r.membership && (
                      <p className="text-[13px] text-[var(--text-muted)]">
                        Membresía {r.membership.plan_name} hasta {formatDate(r.membership.end)}
                        {r.membership.entries != null ? ` · ${r.membership.entries} entradas` : ""}
                      </p>
                    )}
                    {r.conflicts.map((c) => (
                      <p key={c.field} className="text-[13px] text-[var(--text-muted)]">
                        {c.label}: LSMFit tiene «{c.current}», el archivo dice «{c.incoming}»
                      </p>
                    ))}
                    {r.errors.map((e, i) => (
                      <p key={`e${i}`} className="flex items-center gap-1.5 text-[13px] text-[var(--signal-danger)]">
                        <Warning className="h-3.5 w-3.5 shrink-0" aria-hidden /> {e.message}
                      </p>
                    ))}
                    {r.warnings.map((w, i) => (
                      <p key={`w${i}`} className="text-[13px] text-[var(--signal-warn)]">
                        {w}
                      </p>
                    ))}
                  </li>
                ))}
                {visibleRows.length === 0 && (
                  <li className="px-3 py-6 text-center text-sm text-[var(--text-muted)]">Nada requiere atención.</li>
                )}
              </ul>
              {(preview.truncated || preview.rows.length > visibleRows.length) && (
                <p className="text-[12.5px] text-[var(--text-muted)]">
                  Se muestran las primeras {visibleRows.length}; la importación incluye todas.
                </p>
              )}
            </section>
          </div>
        )}

        {step === "done" && result && (
          <div className="space-y-3 py-1">
            <div className="flex flex-wrap gap-2">
              <StatusBadge status="import" label={plural(result.summary.create, "nuevo", "nuevos")} tone="success" />
              <StatusBadge status="import" label={plural(result.summary.update, "completado", "completados")} tone="info" />
              <StatusBadge status="import" label={plural(result.summary.memberships, "membresía", "membresías")} tone="neutral" />
              {result.errors.length > 0 && <StatusBadge status="import" label={`${result.errors.length} filas no importadas`} tone="danger" />}
            </div>
            {result.errors.length > 0 && (
              <ul className="max-h-48 space-y-1 overflow-y-auto text-[13px] text-[var(--text-muted)]">
                {result.errors.map((e, i) => (
                  <li key={i}>
                    <span className="font-medium text-[var(--signal-danger)]">Fila {e.row}</span> · {e.message}
                  </li>
                ))}
              </ul>
            )}
            <ImportFollowUp token={token} batchId={result.batch_id} />
            <p className="text-[13px] text-[var(--text-muted)]">
              Lo que falte (foto, huella) se completa después desde la ficha de cada socio.
            </p>
          </div>
        )}

        <DialogFooter>
          {step === "file" && (
            <Button type="button" onClick={() => runPreview()} disabled={!file || working}>
              {working ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
              Revisar archivo
            </Button>
          )}
          {step === "review" && (
            <>
              <Button type="button" variant="outline" onClick={() => setStep("file")} disabled={working}>
                Cambiar archivo
              </Button>
              <Button type="button" onClick={commit} disabled={working || toImport === 0}>
                {working && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {toImport === 0 ? "Nada que importar" : `Importar ${plural(toImport, "persona", "personas")}`}
              </Button>
            </>
          )}
          {step === "done" && result && (
            <>
              <Button type="button" variant="outline" onClick={() => undo(result.batch_id)} disabled={undoing !== null}>
                <Undo className="h-4 w-4 mr-2" />
                Deshacer
              </Button>
              <Button type="button" onClick={() => setOpen(false)}>
                Listo
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
