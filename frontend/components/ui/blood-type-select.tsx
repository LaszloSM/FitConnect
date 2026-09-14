"use client"

import { Select as SelectPrimitive } from "@base-ui/react/select"
import { CaretDownIcon as ChevronDownIcon, CaretUpIcon as ChevronUpIcon, CheckIcon } from "@phosphor-icons/react";
import { cn } from "@/lib/utils"

const BLOOD_TYPES = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"]

interface BloodTypeSelectProps {
  value?: string
  onChange?: (value: string | null) => void
  className?: string
  placeholder?: string
}

function BloodTypeSelect({ value, onChange, className, placeholder = "Grupo sanguíneo" }: BloodTypeSelectProps) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onChange}>
      <SelectPrimitive.Trigger
        className={cn(
          "flex h-10 md:h-9 w-full items-center justify-between gap-1.5 rounded-lg border border-[var(--border-base)] bg-[var(--bg-input)] px-3 text-sm text-[var(--text-base)] whitespace-nowrap transition-colors outline-none select-none",
          "data-placeholder:text-[var(--text-placeholder)]",
          "focus-visible:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/20",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder} />
        <SelectPrimitive.Icon render={<ChevronDownIcon className="size-4 text-[var(--text-muted)] shrink-0" />} />
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner side="bottom" sideOffset={4} className="isolate z-50">
          <SelectPrimitive.Popup className="w-(--anchor-width) min-w-36 origin-(--transform-origin) overflow-hidden rounded-[var(--radius-xl)] border border-[var(--border-base)] bg-[var(--bg-card)] shadow-[var(--shadow-lg)] data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 duration-100">
            <SelectPrimitive.ScrollUpArrow className="flex w-full items-center justify-center bg-[var(--bg-card)] py-1">
              <ChevronUpIcon className="size-4" />
            </SelectPrimitive.ScrollUpArrow>
            <SelectPrimitive.List className="p-1">
              {BLOOD_TYPES.map((bt) => (
                <SelectPrimitive.Item
                  key={bt}
                  value={bt}
                  className="relative flex w-full cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-sm text-[var(--text-base)] outline-hidden select-none transition-colors focus:bg-[var(--color-primary-muted)] data-disabled:opacity-50"
                >
                  <SelectPrimitive.ItemText>{bt}</SelectPrimitive.ItemText>
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

export { BloodTypeSelect }
