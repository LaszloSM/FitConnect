"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { EmptyState } from "@/components/common/EmptyState";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export interface DataTableColumn<T> {
  key: string;
  header: React.ReactNode;
  cell: (row: T) => React.ReactNode;
  /** Oculta la columna en la vista de cards móvil. */
  hideOnMobile?: boolean;
  className?: string;
  headerClassName?: string;
}

interface DataTableProps<T> {
  columns: DataTableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyIcon?: React.ReactNode;
  emptyAction?: React.ReactNode;
  onRowClick?: (row: T) => void;
  /** Render alternativo de cada fila como card en móvil; si falta, se generan
   * pares etiqueta→valor a partir de las columnas visibles. */
  mobileCard?: (row: T) => React.ReactNode;
  skeletonRows?: number;
  className?: string;
}

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  loading = false,
  error = "",
  onRetry,
  emptyTitle = "Sin resultados",
  emptyDescription,
  emptyIcon,
  emptyAction,
  onRowClick,
  mobileCard,
  skeletonRows = 5,
  className,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className={cn("space-y-2", className)} aria-busy="true">
        {Array.from({ length: skeletonRows }).map((_, i) => (
          <div key={i} className="skeleton h-12 rounded-lg" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <EmptyState
        icon={<AlertCircle className="h-10 w-10 text-red-500" />}
        title="Error cargando datos"
        description={error}
        action={
          onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="focus-ring rounded-lg border border-[var(--border-base)] px-4 py-2 text-sm font-medium text-[var(--text-base)] transition-ui hover:bg-[var(--bg-muted)]"
            >
              Reintentar
            </button>
          )
        }
        className={className}
      />
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={emptyIcon}
        title={emptyTitle}
        description={emptyDescription}
        action={emptyAction}
        className={className}
      />
    );
  }

  const mobileColumns = columns.filter((c) => !c.hideOnMobile);

  return (
    <div className={className}>
      {/* Desktop: tabla clásica */}
      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              {columns.map((col) => (
                <TableHead key={col.key} className={col.headerClassName}>
                  {col.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row, i) => (
              <motion.tr
                key={rowKey(row)}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, delay: Math.min(i * 0.03, 0.3) }}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  "border-b border-[var(--border-base)] transition-colors hover:bg-[var(--bg-muted)]",
                  onRowClick && "cursor-pointer"
                )}
              >
                {columns.map((col) => (
                  <TableCell key={col.key} className={col.className}>
                    {col.cell(row)}
                  </TableCell>
                ))}
              </motion.tr>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Móvil: cards apiladas */}
      <div className="space-y-2 md:hidden">
        {rows.map((row, i) => (
          <motion.div
            key={rowKey(row)}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: Math.min(i * 0.03, 0.3) }}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={cn(
              "surface-1 rounded-xl border border-[var(--border-base)] p-3",
              onRowClick && "cursor-pointer active:scale-[0.99] transition-ui"
            )}
          >
            {mobileCard ? (
              mobileCard(row)
            ) : (
              <dl className="space-y-1.5">
                {mobileColumns.map((col) => (
                  <div key={col.key} className="flex items-center justify-between gap-3">
                    <dt className="text-xs text-[var(--text-muted)]">{col.header}</dt>
                    <dd className="text-sm text-[var(--text-base)] text-right min-w-0">
                      {col.cell(row)}
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}
