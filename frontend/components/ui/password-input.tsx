"use client"

import * as React from "react"
import { EyeIcon as Eye, EyeSlashIcon as EyeOff } from "@phosphor-icons/react";
import { cn } from "@/lib/utils"

function getStrength(password: string): 0 | 1 | 2 | 3 {
  if (password.length === 0) return 0
  let score = 0
  if (password.length >= 8) score++
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++
  if (/[0-9]/.test(password)) score++
  if (/[^A-Za-z0-9]/.test(password)) score++
  if (score <= 1) return 1
  if (score === 2) return 2
  if (score === 3) return 2
  return 3
}

const strengthConfig = {
  1: { label: "Débil", color: "bg-[var(--signal-danger)]", segments: 1 },
  2: { label: "Aceptable", color: "bg-[var(--signal-warn)]", segments: 2 },
  3: { label: "Fuerte", color: "bg-[var(--signal-ok)]/60", segments: 3 },
  4: { label: "Muy fuerte", color: "bg-[var(--signal-ok)]", segments: 4 },
} as const

interface PasswordInputProps extends React.ComponentProps<"input"> {
  showStrength?: boolean
}

function PasswordInput({ className, showStrength = false, value, onChange, ...props }: PasswordInputProps) {
  const [visible, setVisible] = React.useState(false)
  const [internalValue, setInternalValue] = React.useState("")

  const currentValue = value !== undefined ? String(value) : internalValue
  const strength = showStrength && currentValue.length > 0
    ? (Math.min(getStrength(currentValue) + (currentValue.length >= 12 ? 1 : 0), 4) as 1 | 2 | 3 | 4)
    : null

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setInternalValue(e.target.value)
    onChange?.(e)
  }

  return (
    <div className="w-full space-y-2">
      <div className="relative">
        <input
          type={visible ? "text" : "password"}
          value={currentValue}
          onChange={handleChange}
          className={cn(
            "h-10 md:h-9 w-full min-w-0 rounded-lg border px-3 py-1.5 pr-10 text-sm transition-colors outline-none",
            "border-[var(--border-base)] bg-[var(--bg-input)] text-[var(--text-base)] placeholder:text-[var(--text-placeholder)]",
            "focus-visible:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/20",
            "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
            className
          )}
          {...props}
        />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--text-muted)] hover:text-[var(--text-base)] transition-colors outline-none focus-visible:text-[var(--text-base)]"
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>

      {showStrength && currentValue.length > 0 && strength !== null && (
        <div className="space-y-1">
          <div className="flex gap-1">
            {[1, 2, 3, 4].map((seg) => (
              <div
                key={seg}
                className={cn(
                  "h-1 flex-1 rounded-full transition-colors duration-300",
                  seg <= strengthConfig[strength as 1 | 2 | 3 | 4].segments
                    ? strengthConfig[strength as 1 | 2 | 3 | 4].color
                    : "bg-[var(--border-base)]"
                )}
              />
            ))}
          </div>
          <p className="text-xs text-[var(--text-muted)]">
            {strengthConfig[strength as 1 | 2 | 3 | 4].label}
          </p>
        </div>
      )}
    </div>
  )
}

export { PasswordInput }
