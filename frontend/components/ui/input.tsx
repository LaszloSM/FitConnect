import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-lg border border-[var(--border-base)] bg-[var(--bg-input)] px-3 py-1.5 text-sm text-[var(--text-base)] transition-colors outline-none",
        "placeholder:text-[var(--text-placeholder)]",
        "focus-visible:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/20",
        "disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-red-500 aria-invalid:ring-2 aria-invalid:ring-red-500/20",
        "file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-[var(--text-base)]",
        className
      )}
      {...props}
    />
  )
}

export { Input }
