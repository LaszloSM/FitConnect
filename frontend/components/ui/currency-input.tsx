"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

function formatCOP(value: number): string {
  if (isNaN(value) || value === 0) return ""
  return value.toLocaleString("es-CO", { maximumFractionDigits: 0 })
}

function parseCOP(str: string): number {
  const digits = str.replace(/\D/g, "")
  return digits ? parseInt(digits, 10) : 0
}

interface CurrencyInputProps extends Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> {
  value: number
  onChange: (value: number) => void
  placeholder?: string
}

function CurrencyInput({ className, value, onChange, placeholder = "0", ...props }: CurrencyInputProps) {
  const [displayValue, setDisplayValue] = React.useState(formatCOP(value))

  React.useEffect(() => {
    const formatted = formatCOP(value)
    setDisplayValue(formatted)
  }, [value])

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value
    const numeric = parseCOP(raw)
    onChange(numeric)
    setDisplayValue(formatCOP(numeric))
  }

  function handleBlur() {
    setDisplayValue(formatCOP(value))
  }

  return (
    <div className={cn("flex h-9 w-full rounded-lg border border-[var(--border-base)] bg-[var(--bg-input)] overflow-hidden transition-colors focus-within:border-[var(--color-primary)] focus-within:ring-2 focus-within:ring-[var(--color-primary)]/20", className)}>
      <span className="flex items-center px-3 text-sm font-medium text-[var(--text-muted)] border-r border-[var(--border-base)] bg-[var(--bg-muted)] select-none">
        $
      </span>
      <input
        type="text"
        inputMode="numeric"
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
        placeholder={placeholder}
        className="flex-1 min-w-0 px-3 py-1.5 text-sm text-[var(--text-base)] bg-transparent outline-none placeholder:text-[var(--text-placeholder)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
        {...props}
      />
      <span className="flex items-center px-3 text-xs font-medium text-[var(--text-muted)] border-l border-[var(--border-base)] bg-[var(--bg-muted)] select-none">
        COP
      </span>
    </div>
  )
}

export { CurrencyInput }
