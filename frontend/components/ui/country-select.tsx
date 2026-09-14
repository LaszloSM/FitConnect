"use client"

import { Select as SelectPrimitive } from "@base-ui/react/select"
import { CaretDownIcon as ChevronDownIcon, CaretUpIcon as ChevronUpIcon, CheckIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils"
import { COUNTRIES } from "@/lib/geo"

interface CountrySelectProps {
  value?: string
  onChange?: (value: string | null) => void
  className?: string
  placeholder?: string
  /** Fuerza superficie blanca sobre cards claras (auth). */
}

function CountrySelect({ value, onChange, className, placeholder = "País" }: CountrySelectProps) {
  const triggerBg = "bg-[var(--bg-input)] text-[var(--text-base)]"
  return (
    <SelectPrimitive.Root value={value} onValueChange={onChange}>
      <SelectPrimitive.Trigger
        className={cn(
          "flex h-10 md:h-9 w-full items-center justify-between gap-1.5 rounded-lg border px-3 text-sm whitespace-nowrap transition-colors outline-none select-none",
          "border-[var(--border-base)]",
          triggerBg,
          "data-placeholder:text-[var(--text-placeholder)]",
          "focus-visible:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/20",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder}>
          {value && (() => {
            const found = COUNTRIES.find((c) => c.code === value)
            if (!found) return placeholder
            return (
              <span className="flex items-center gap-2">
                <span>{found.flag}</span>
                <span>{found.name}</span>
              </span>
            )
          })()}
        </SelectPrimitive.Value>
        <SelectPrimitive.Icon render={<ChevronDownIcon className="size-4 text-[var(--text-muted)] shrink-0" />} />
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner side="bottom" sideOffset={4} className="isolate z-50">
          <SelectPrimitive.Popup className="w-(--anchor-width) min-w-52 max-h-72 origin-(--transform-origin) overflow-y-auto rounded-[var(--radius-xl)] border border-[var(--border-base)] bg-[var(--bg-card)] shadow-[var(--shadow-lg)] data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 duration-100">
            <SelectPrimitive.ScrollUpArrow className="flex w-full items-center justify-center bg-[var(--bg-card)] py-1">
              <ChevronUpIcon className="size-4" />
            </SelectPrimitive.ScrollUpArrow>
            <SelectPrimitive.List className="p-1">
              {COUNTRIES.map((c) => (
                <SelectPrimitive.Item
                  key={c.code}
                  value={c.code}
                  className="relative flex w-full cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-sm text-[var(--text-base)] outline-hidden select-none transition-colors focus:bg-[var(--color-primary-muted)] data-disabled:opacity-50"
                >
                  <span>{c.flag}</span>
                  <SelectPrimitive.ItemText>{c.name}</SelectPrimitive.ItemText>
                  <SelectPrimitive.ItemIndicator
                    render={<span className="absolute right-2 flex size-4 items-center justify-center" />}
                  >
                    <CheckIcon className="size-3.5" />
                  </SelectPrimitive.ItemIndicator>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.List>
            <SelectPrimitive.ScrollDownArrow className="flex w-full items-center justify-center bg-[var(--bg-card)] py-1">
              <ChevronDownIcon className="size-4" />
            </SelectPrimitive.ScrollDownArrow>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  )
}

export { CountrySelect }
