"use client"

import * as React from "react"
import { InfoIcon as Info, CheckCircleIcon as CheckCircle, WarningIcon as AlertTriangle, XCircleIcon as XCircle, XIcon as X } from "@phosphor-icons/react";
import { cn } from "@/lib/utils"

type AlertVariant = "info" | "success" | "warning" | "error"

const variantConfig: Record<AlertVariant, { icon: React.ElementType; signal: string }> = {
  info: { icon: Info, signal: "info" },
  success: { icon: CheckCircle, signal: "ok" },
  warning: { icon: AlertTriangle, signal: "warn" },
  error: { icon: XCircle, signal: "danger" },
}

interface AlertProps {
  variant: AlertVariant
  title?: string
  children: React.ReactNode
  onDismiss?: () => void
  className?: string
}

/**
 * Las paletas crudas de Tailwind se cambiaron por las señales del sistema. El
 * ámbar de Tailwind queda a 15 grados del naranja de marca: en pantalla eran el
 * mismo color, y un aviso al lado de un botón de cobro dejaba de leerse como
 * aviso. `npm run check:contrast` verifica cada señal sobre su banner en los
 * dos temas.
 */
function Alert({ variant, title, children, onDismiss, className }: AlertProps) {
  const { icon: Icon, signal } = variantConfig[variant]
  const tinta = `var(--signal-${signal})`

  return (
    <div
      role="alert"
      className={cn("flex gap-3 rounded-lg border p-4", className)}
      style={{
        background: `var(--signal-${signal}-bg)`,
        borderColor: `var(--signal-${signal}-line)`,
      }}
    >
      <Icon className="size-4 mt-0.5 shrink-0" style={{ color: tinta }} aria-hidden="true" />
      <div className="flex-1 min-w-0">
        {title && (
          <p className="text-sm font-semibold mb-1" style={{ color: tinta }}>{title}</p>
        )}
        <div className="text-sm" style={{ color: tinta }}>{children}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Cerrar alerta"
          className="shrink-0 -mt-0.5 -mr-1 flex size-5 items-center justify-center rounded transition-opacity opacity-60 hover:opacity-100"
          style={{ color: tinta }}
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}

export { Alert }
