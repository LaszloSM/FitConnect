"use client"

import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

const DAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"]

interface WeekdayPickerProps {
  value: number[]
  onChange: (days: number[]) => void
}

function WeekdayPicker({ value, onChange }: WeekdayPickerProps) {
  function toggle(day: number) {
    if (value.includes(day)) {
      onChange(value.filter((d) => d !== day))
    } else {
      onChange([...value, day].sort((a, b) => a - b))
    }
  }

  return (
    <div className="flex gap-1.5 flex-wrap">
      {DAYS.map((label, i) => {
        const selected = value.includes(i)
        return (
          <motion.button
            key={i}
            type="button"
            onClick={() => toggle(i)}
            whileTap={{ scale: 0.9 }}
            animate={{
              backgroundColor: selected ? "var(--color-primary)" : "var(--bg-muted)",
              color: selected ? "#ffffff" : "var(--text-muted)",
            }}
            transition={{ duration: 0.15 }}
            className={cn(
              "h-8 min-w-[2.75rem] px-2.5 rounded-full text-xs font-semibold border transition-colors outline-none",
              "focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/40",
              selected
                ? "border-[var(--color-primary)]"
                : "border-[var(--border-base)]"
            )}
          >
            {label}
          </motion.button>
        )
      })}
    </div>
  )
}

export { WeekdayPicker }
