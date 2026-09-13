import { Button as ButtonPrimitive } from "@base-ui/react/button"
import { cva, type VariantProps } from "class-variance-authority"
import { Loader2 } from "lucide-react"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  // Solo se animan color y transform: `transition-all` también animaba el
  // layout y el anillo de foco. La presión se siente con scale 0.97.
  "group/button inline-flex shrink-0 items-center justify-center rounded-[var(--radius-md)] border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap outline-none select-none transition-[color,background-color,border-color,transform] duration-150 ease-[var(--ease-out)] focus-visible:ring-2 focus-visible:ring-primary/40 focus-visible:ring-offset-2 focus-visible:ring-offset-panel active:not-aria-[haspopup]:scale-[0.97] disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-[var(--signal-danger)] aria-invalid:ring-2 aria-invalid:ring-[var(--signal-danger-line)] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-contrast hover:bg-primary-hover",
        outline: "border-line bg-panel text-ink hover:bg-muted aria-expanded:bg-muted",
        secondary: "bg-muted text-ink hover:bg-line aria-expanded:bg-line",
        ghost: "text-ink-muted hover:bg-muted hover:text-ink aria-expanded:bg-muted aria-expanded:text-ink",
        destructive:
          "border-[var(--signal-danger-line)] bg-panel text-[var(--signal-danger)] hover:bg-[var(--signal-danger-bg)] focus-visible:ring-[var(--signal-danger-line)]",
        link: "text-primary-ink underline-offset-4 hover:underline",
      },
      size: {
        default:
          "h-9 gap-1.5 px-3.5 has-data-[icon=inline-end]:pr-3 has-data-[icon=inline-start]:pl-3",
        xs: "h-7 gap-1 rounded-[var(--radius-sm)] px-2 text-xs [&_svg:not([class*='size-'])]:size-3.5",
        sm: "h-8 gap-1 px-3 text-[13px] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-10 gap-2 px-4",
        icon: "size-9",
        "icon-xs": "size-7 rounded-[var(--radius-sm)] [&_svg:not([class*='size-'])]:size-3.5",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

interface ButtonProps extends ButtonPrimitive.Props, VariantProps<typeof buttonVariants> {
  isLoading?: boolean;
}

function Button({
  className,
  variant = "default",
  size = "default",
  isLoading = false,
  disabled,
  children,
  ...props
}: ButtonProps) {
  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(
        buttonVariants({ variant, size, className }),
        isLoading && "cursor-wait pointer-events-none !opacity-70"
      )}
      disabled={disabled || isLoading}
      aria-busy={isLoading || undefined}
      {...props}
    >
      {isLoading ? (
        <>
          <Loader2 className="animate-spin" aria-hidden="true" />
          <span className="sr-only">Cargando…</span>
        </>
      ) : (
        children
      )}
    </ButtonPrimitive>
  )
}

export { Button, buttonVariants }
