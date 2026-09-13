"use client";

import * as React from "react";
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

interface FormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  /** Botón/elemento que abre el dialog (Base UI render prop). */
  trigger?: React.ReactElement;
  children: React.ReactNode;
  onSubmit: () => void | Promise<void>;
  submitLabel?: string;
  cancelLabel?: string;
  submitting?: boolean;
  submitDisabled?: boolean;
  /** Variante destructiva para confirmaciones de borrado. */
  destructive?: boolean;
  contentClassName?: string;
}

/** Dialog + form estándar: reemplaza el modal crear/editar copiado en cada módulo. */
export function FormDialog({
  open,
  onOpenChange,
  title,
  description,
  trigger,
  children,
  onSubmit,
  submitLabel = "Guardar",
  cancelLabel = "Cancelar",
  submitting = false,
  submitDisabled = false,
  destructive = false,
  contentClassName,
}: FormDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      {trigger && <DialogTrigger render={trigger} />}
      <DialogContent className={contentClassName}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void onSubmit();
          }}
          className="contents"
        >
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>

          <div className="grid gap-4 py-1 max-h-[65vh] overflow-y-auto px-0.5">
            {children}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={submitting}
            >
              {cancelLabel}
            </Button>
            <Button
              type="submit"
              variant={destructive ? "destructive" : "default"}
              disabled={submitting || submitDisabled}
            >
              {submitting ? "Guardando..." : submitLabel}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Campo etiqueta+control consistente para usar dentro de FormDialog. */
export function FormField({
  label,
  required,
  hint,
  error,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1.5">
      <label className="text-sm font-medium text-[var(--text-base)]">
        {label}
        {required && <span className="ml-0.5 text-[var(--signal-danger)]">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-[var(--text-muted)]">{hint}</p>}
      {error && <p className="text-xs text-[var(--signal-danger)]">{error}</p>}
    </div>
  );
}
