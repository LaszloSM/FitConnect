"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

interface SwitchProps {
  checked: boolean
  onCheckedChange: (value: boolean) => void
  disabled?: boolean
  label?: string
  id?: string
}

function Switch({ checked, onCheckedChange, disabled = false, label, id }: SwitchProps) {
  const switchId = id ?? `switch-${Math.random().toString(36).slice(2)}`

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
          "relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 outline-none",
          "focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/40 focus-visible:ring-offset-1",
          checked ? "bg-[var(--color-primary)]" : "bg-[var(--border-base)]",
          disabled && "cursor-not-allowed opacity-50"
        )}
      >
        <motion.span
          layout
          transition={{ type: "spring", stiffness: 700, damping: 30 }}
          className="pointer-events-none inline-block size-4 rounded-full bg-white shadow-md"
          animate={{ x: checked ? 16 : 0 }}
          initial={false}
        />
      </button>
      {label && (
        <label htmlFor={switchId} className={cn("text-sm text-[var(--text-base)] cursor-pointer select-none", disabled && "opacity-50 cursor-not-allowed")}>
          {label}
        </label>
      )}
    </div>
  )
}

export { Switch }
