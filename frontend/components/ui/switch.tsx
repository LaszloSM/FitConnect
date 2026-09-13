"use client"

import { useId } from "react"
import { cn } from "@/lib/utils"

interface SwitchProps {
  checked: boolean
  onCheckedChange: (value: boolean) => void
  disabled?: boolean
  label?: string
  id?: string
}

function Switch({ checked, onCheckedChange, disabled = false, label, id }: SwitchProps) {
  // `Math.random()` en el render daba un id distinto en servidor y cliente:
  // rompía la hidratación y desenganchaba el <label>.
  const autoId = useId()
  const switchId = id ?? autoId

  return (
    <div className="flex items-center gap-2.5">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        id={switchId}
        disabled={disabled}
        onClick={() => !disabled && onCheckedChange(!checked)}
        className={cn(
          // El área táctil llega a 44 px con el pseudo-elemento, sin agrandar el control.
          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent outline-none transition-colors duration-150",
          "before:absolute before:-inset-3 before:content-['']",
          "focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-1",
          checked ? "bg-primary" : "bg-line",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none inline-block size-4 rounded-full bg-field shadow-[var(--shadow-sm)] transition-transform duration-150 ease-[var(--ease-out)]",
            checked ? "translate-x-4" : "translate-x-0"
          )}
        />
      </button>
      {label && (
        <label
          htmlFor={switchId}
          className={cn("cursor-pointer select-none text-sm text-ink", disabled && "cursor-not-allowed opacity-50")}
        >
          {label}
        </label>
      )}
    </div>
  )
}

export { Switch }
