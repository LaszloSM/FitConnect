"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

function formatPhone(digits: string): string {
  const d = digits.slice(0, 10)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`
}

interface PhoneInputProps extends Omit<React.ComponentProps<"input">, "value" | "onChange"> {
  value?: string
  onChange?: (value: string) => void
}

function PhoneInput({ className, value, onChange, ...props }: PhoneInputProps) {
  const prefix = "+57"
  const digits = value ? value.replace(/^\+57\s?/, "").replace(/\D/g, "") : ""

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value.replace(/\D/g, "").slice(0, 10)
    onChange?.(`${prefix}${raw}`)
  }

  return (
    <div className={cn("flex h-9 w-full rounded-lg border border-[var(--border-base)] bg-[var(--bg-input)] overflow-hidden transition-colors focus-within:border-[var(--color-primary)] focus-within:ring-2 focus-within:ring-[var(--color-primary)]/20", className)}>
      <span className="flex items-center px-3 text-sm font-medium text-[var(--text-muted)] border-r border-[var(--border-base)] bg-[var(--bg-muted)] select-none whitespace-nowrap">
        {prefix}
      </span>
      <input
        type="tel"
        inputMode="numeric"
        value={formatPhone(digits)}
        onChange={handleChange}
        className="flex-1 min-w-0 px-3 py-1.5 text-sm text-[var(--text-base)] bg-transparent outline-none placeholder:text-[var(--text-placeholder)] disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50"
        placeholder="300 000 0000"
        {...props}
      />
    </div>
  )
}

export { PhoneInput }
