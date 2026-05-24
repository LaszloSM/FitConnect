"use client"

import * as React from "react"
import { cn } from "@/lib/utils"

interface TextareaProps extends React.ComponentProps<"textarea"> {
  maxLength?: number
  showCount?: boolean
}

function Textarea({ className, maxLength, showCount = false, value, onChange, ...props }: TextareaProps) {
  const [internalValue, setInternalValue] = React.useState("")
  const ref = React.useRef<HTMLTextAreaElement>(null)

  const currentValue = value !== undefined ? String(value) : internalValue
  const count = currentValue.length

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    if (!value) setInternalValue(e.target.value)
    onChange?.(e)
    autoResize()
  }

  function autoResize() {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }

  React.useEffect(() => {
    autoResize()
  }, [currentValue])

  return (
    <div className="relative w-full">
      <textarea
        ref={ref}
        value={currentValue}
        onChange={handleChange}
        maxLength={maxLength}
        rows={3}
        className={cn(
          "w-full min-w-0 resize-none overflow-hidden rounded-lg border border-[var(--border-base)] bg-[var(--bg-input)] px-3 py-2 text-sm text-[var(--text-base)] transition-colors outline-none leading-relaxed",
          "placeholder:text-[var(--text-placeholder)]",
          "focus-visible:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/20",
          "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
          showCount && maxLength && "pb-7",
          className
        )}
        {...props}
      />
      {showCount && maxLength && (
        <span className={cn(
          "absolute bottom-2 right-3 text-xs pointer-events-none select-none",
          count >= maxLength ? "text-red-500" : "text-[var(--text-placeholder)]"
        )}>
          {count}/{maxLength}
        </span>
      )}
    </div>
  )
}

export { Textarea }
