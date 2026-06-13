"use client"

import { Select as SelectPrimitive } from "@base-ui/react/select"
import { ChevronDownIcon, ChevronUpIcon, CheckIcon, Flame, Dumbbell, HeartPulse, Wind, Activity } from "lucide-react"
import { cn } from "@/lib/utils"

const GOALS = [
  { value: "weight_loss", label: "Bajar de peso", icon: Flame },
  { value: "muscle_gain", label: "Ganar músculo", icon: Dumbbell },
  { value: "endurance", label: "Resistencia", icon: HeartPulse },
  { value: "flexibility", label: "Flexibilidad", icon: Wind },
  { value: "general_fitness", label: "Estado físico general", icon: Activity },
]

interface TrainingGoalSelectProps {
  value?: string
  onChange?: (value: string | null) => void
  className?: string
  placeholder?: string
}

function TrainingGoalSelect({ value, onChange, className, placeholder = "Objetivo de entrenamiento" }: TrainingGoalSelectProps) {
  return (
    <SelectPrimitive.Root value={value} onValueChange={onChange}>
      <SelectPrimitive.Trigger
        className={cn(
          "flex h-9 w-full items-center justify-between gap-1.5 rounded-lg border border-[var(--border-base)] bg-[var(--bg-input)] px-3 text-sm text-[var(--text-base)] whitespace-nowrap transition-colors outline-none select-none",
          "data-placeholder:text-[var(--text-placeholder)]",
          "focus-visible:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/20",
          "disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
      >
        <SelectPrimitive.Value placeholder={placeholder}>
          {value && (() => {
            const found = GOALS.find((g) => g.value === value)
            if (!found) return placeholder
            const Icon = found.icon
            return (
              <span className="flex items-center gap-2">
                <Icon className="size-4 text-[var(--text-muted)]" />
                <span>{found.label}</span>
              </span>
            )
          })()}
        </SelectPrimitive.Value>
        <SelectPrimitive.Icon render={<ChevronDownIcon className="size-4 text-[var(--text-muted)] shrink-0" />} />
      </SelectPrimitive.Trigger>

      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner side="bottom" sideOffset={4} className="isolate z-50">
          <SelectPrimitive.Popup className="w-(--anchor-width) min-w-56 origin-(--transform-origin) overflow-hidden rounded-lg border border-[var(--border-base)] bg-[var(--bg-card)] shadow-[var(--shadow-md)] data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 duration-100">
            <SelectPrimitive.ScrollUpArrow className="flex w-full items-center justify-center bg-[var(--bg-card)] py-1">
              <ChevronUpIcon className="size-4" />
            </SelectPrimitive.ScrollUpArrow>
            <SelectPrimitive.List className="p-1">
              {GOALS.map(({ value: v, label, icon: Icon }) => (
                <SelectPrimitive.Item
                  key={v}
                  value={v}
                  className="relative flex w-full cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-sm text-[var(--text-base)] outline-hidden select-none transition-colors focus:bg-[var(--color-primary-muted)] data-disabled:opacity-50"
                >
                  <Icon className="size-4 text-[var(--text-muted)]" />
                  <SelectPrimitive.ItemText>{label}</SelectPrimitive.ItemText>
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

export { TrainingGoalSelect }
