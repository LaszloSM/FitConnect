import * as React from "react"
import { Input as InputPrimitive } from "@base-ui/react/input"

import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <InputPrimitive
      type={type}
      data-slot="input"
      className={cn(
        "h-10 w-full min-w-0 rounded-[var(--radius-md)] border border-line bg-field px-3 text-sm text-ink outline-none md:h-9",
        "transition-[border-color,box-shadow] duration-150",
        "placeholder:text-ink-placeholder",
        "focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary/20",
        "disabled:cursor-not-allowed disabled:bg-muted disabled:text-ink-muted",
        "aria-invalid:border-[var(--signal-danger)] aria-invalid:ring-2 aria-invalid:ring-[var(--signal-danger-line)]",
        "file:inline-flex file:h-6 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-ink",
        className
      )}
      {...props}
    />
  )
}

export { Input }
