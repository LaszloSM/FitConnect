"use client"

import * as React from "react"
import { Info, CheckCircle, AlertTriangle, XCircle, X } from "lucide-react"
import { cn } from "@/lib/utils"

type AlertVariant = "info" | "success" | "warning" | "error"

const variantConfig: Record<AlertVariant, {
  icon: React.ElementType
  containerClass: string
  iconClass: string
  titleClass: string
  textClass: string
}> = {
  info: {
    icon: Info,
    containerClass: "bg-blue-50 border-blue-200 dark:bg-blue-950/30 dark:border-blue-800/50",
    iconClass: "text-blue-500",
    titleClass: "text-blue-800 dark:text-blue-300",
    textClass: "text-blue-700 dark:text-blue-400",
  },
  success: {
    icon: CheckCircle,
    containerClass: "bg-green-50 border-green-200 dark:bg-green-950/30 dark:border-green-800/50",
    iconClass: "text-green-500",
    titleClass: "text-green-800 dark:text-green-300",
    textClass: "text-green-700 dark:text-green-400",
  },
  warning: {
    icon: AlertTriangle,
    containerClass: "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800/50",
    iconClass: "text-amber-500",
    titleClass: "text-amber-800 dark:text-amber-300",
    textClass: "text-amber-700 dark:text-amber-400",
  },
  error: {
    icon: XCircle,
    containerClass: "bg-red-50 border-red-200 dark:bg-red-950/30 dark:border-red-800/50",
    iconClass: "text-red-500",
    titleClass: "text-red-800 dark:text-red-300",
    textClass: "text-red-700 dark:text-red-400",
  },
}

interface AlertProps {
  variant: AlertVariant
  title?: string
  children: React.ReactNode
  onDismiss?: () => void
  className?: string
}

function Alert({ variant, title, children, onDismiss, className }: AlertProps) {
  const config = variantConfig[variant]
  const Icon = config.icon

  return (
    <div
      role="alert"
      className={cn(
        "flex gap-3 rounded-lg border p-4",
        config.containerClass,
        className
      )}
    >
      <Icon className={cn("size-4 mt-0.5 shrink-0", config.iconClass)} aria-hidden="true" />
      <div className="flex-1 min-w-0">
        {title && (
          <p className={cn("text-sm font-semibold mb-1", config.titleClass)}>{title}</p>
        )}
        <div className={cn("text-sm", config.textClass)}>{children}</div>
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Cerrar alerta"
          className={cn("shrink-0 -mt-0.5 -mr-1 flex size-5 items-center justify-center rounded transition-opacity opacity-60 hover:opacity-100", config.iconClass)}
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}

export { Alert }
