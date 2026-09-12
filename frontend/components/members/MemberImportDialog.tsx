"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useRef, useState } from "react";
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
import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { FileSpreadsheet, Download, Upload, Loader2, CheckCircle2 } from "lucide-react";

interface ImportError {
  row: number;
  field: string;
  message: string;
}

interface ImportResult {
  created: number;
  errors: ImportError[];
}

export function MemberImportDialog({ onImported }: { onImported: () => void }) {
  const { data: session } = useSession();
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [working, setWorking] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setFile(null);
    setResult(null);
    if (inputRef.current) inputRef.current.value = "";
  };

  const downloadTemplate = async () => {
    if (!session?.accessToken) return;
    try {
      const client = apiClient(session.accessToken as string);
      const res = await client.get("/api/v1/members/import/template.xlsx", {
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = "plantilla_miembros.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("No se pudo descargar la plantilla");
    }
  };

  const upload = async () => {
    if (!session?.accessToken || !file) return;
    setWorking(true);
    setResult(null);
    try {
      const client = apiClient(session.accessToken as string);
      const form = new FormData();
      form.append("file", file);
      const res = await client.post("/api/v1/members/import", form, {
        headers: { "Content-Type": undefined },
      });
      setResult(res.data);
      if (res.data.created > 0) {
        toast.success(`${res.data.created} miembro(s) importado(s)`);
        onImported();
      }
      if (res.data.created === 0 && res.data.errors.length === 0) {
        toast.message("No se encontraron filas para importar");
      }
    } catch (err: any) {
      toast.error(parseApiError(err, "Error importando el archivo"));
    } finally {
      setWorking(false);
    }
  };

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
      <DialogContent className="bg-[var(--bg-card)] border border-[var(--border-base)] text-[var(--text-base)] sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-[var(--text-base)] font-display">Importar miembros</DialogTitle>
          <DialogDescription>
            Descarga la plantilla, llénala en Excel y súbela. Cada fila se valida; las correctas
            se crean y las que tengan errores se reportan.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <Button type="button" variant="outline" onClick={downloadTemplate} className="w-full">
            <Download className="h-4 w-4 mr-2" />
            Descargar plantilla (.xlsx)
          </Button>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--text-base)]">Archivo a importar</label>
            <input
              ref={inputRef}
              type="file"
              accept=".xlsx"
              onChange={(e) => {
                setFile(e.target.files?.[0] ?? null);
                setResult(null);
              }}
              className="block w-full text-sm text-[var(--text-muted)] file:mr-3 file:rounded-lg file:border-0 file:bg-[var(--color-primary)] file:px-3 file:py-2 file:text-sm file:font-medium file:text-[var(--color-primary-contrast)] hover:file:bg-[var(--color-primary-hover)]"
            />
          </div>

          {result && (
            <div className="rounded-xl border border-[var(--border-base)] bg-[var(--bg-base)] p-4 space-y-2">
              <p className="text-sm font-semibold text-[var(--text-base)] flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                {result.created} creado(s)
                {result.errors.length > 0 && ` · ${result.errors.length} con error`}
              </p>
              {result.errors.length > 0 && (
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {result.errors.map((e, i) => (
                    <p key={i} className="text-xs text-[var(--text-muted)]">
                      <span className="font-medium text-red-500">Fila {e.row}</span> · {e.field}: {e.message}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            onClick={upload}
            disabled={!file || working}
          >
            {working ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
            Importar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
