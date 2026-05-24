"use client"

import * as React from "react"
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react"
import { cn } from "@/lib/utils"

const DAYS_ES = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"]
const MONTHS_ES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
]

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate()
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay()
}

function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
}

function isToday(date: Date) {
  return isSameDay(date, new Date())
}

interface DatePickerProps {
  value?: Date
  onChange: (date: Date) => void
  placeholder?: string
  minDate?: Date
  maxDate?: Date
  className?: string
}

function DatePicker({ value, onChange, placeholder = "Seleccionar fecha", minDate, maxDate, className }: DatePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [viewDate, setViewDate] = React.useState(() => {
    const d = value ?? new Date()
    return { year: d.getFullYear(), month: d.getMonth() }
  })
  const ref = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  const daysInMonth = getDaysInMonth(viewDate.year, viewDate.month)
  const firstDay = getFirstDayOfMonth(viewDate.year, viewDate.month)
  const blanks = Array(firstDay).fill(null)
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1)

  function prevMonth() {
    setViewDate(({ year, month }) => {
      if (month === 0) return { year: year - 1, month: 11 }
      return { year, month: month - 1 }
    })
  }

  function nextMonth() {
    setViewDate(({ year, month }) => {
      if (month === 11) return { year: year + 1, month: 0 }
      return { year, month: month + 1 }
    })
  }

  function selectDay(day: number) {
    const selected = new Date(viewDate.year, viewDate.month, day)
    if (minDate && selected < minDate) return
    if (maxDate && selected > maxDate) return
    onChange(selected)
    setOpen(false)
  }

  function isDayDisabled(day: number) {
    const d = new Date(viewDate.year, viewDate.month, day)
    if (minDate && d < minDate) return true
    if (maxDate && d > maxDate) return true
    return false
  }

  const displayValue = value
    ? `${String(value.getDate()).padStart(2, "0")}/${String(value.getMonth() + 1).padStart(2, "0")}/${value.getFullYear()}`
    : ""

  return (
    <div ref={ref} className={cn("relative w-full", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-lg border border-[var(--border-base)] bg-[var(--bg-input)] px-3 text-sm transition-colors outline-none",
          "focus-visible:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/20",
          !displayValue && "text-[var(--text-placeholder)]",
          displayValue && "text-[var(--text-base)]"
        )}
      >
        <Calendar className="size-4 shrink-0 text-[var(--text-muted)]" />
        <span className="flex-1 text-left">{displayValue || placeholder}</span>
      </button>

      {open && (
        <div className="absolute left-0 top-10 z-50 w-72 rounded-lg border border-[var(--border-base)] bg-[var(--bg-card)] shadow-[var(--shadow-md)] p-4">
          <div className="flex items-center justify-between mb-4">
            <button
              type="button"
              onClick={prevMonth}
              className="flex size-7 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-base)] transition-colors"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-sm font-semibold text-[var(--text-base)]">
              {MONTHS_ES[viewDate.month]} {viewDate.year}
            </span>
            <button
              type="button"
              onClick={nextMonth}
              className="flex size-7 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-base)] transition-colors"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          <div className="grid grid-cols-7 mb-2">
            {DAYS_ES.map((d) => (
              <div key={d} className="flex items-center justify-center text-xs font-medium text-[var(--text-muted)] h-8">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-y-1">
            {blanks.map((_, i) => <div key={`b-${i}`} />)}
            {days.map((day) => {
              const date = new Date(viewDate.year, viewDate.month, day)
              const selected = value && isSameDay(date, value)
              const todayDay = isToday(date)
              const disabled = isDayDisabled(day)
              return (
                <button
                  key={day}
                  type="button"
                  disabled={disabled}
                  onClick={() => selectDay(day)}
                  className={cn(
                    "flex size-8 mx-auto items-center justify-center rounded-full text-sm transition-colors",
                    selected && "bg-[var(--color-primary)] text-white font-semibold",
                    !selected && todayDay && "border-2 border-[var(--color-primary)] text-[var(--color-primary)] font-semibold",
                    !selected && !todayDay && !disabled && "text-[var(--text-base)] hover:bg-[var(--bg-muted)]",
                    disabled && "opacity-30 cursor-not-allowed"
                  )}
                >
                  {day}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export { DatePicker }
