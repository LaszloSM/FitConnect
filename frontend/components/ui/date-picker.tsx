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
  /** Earliest selectable year in the dropdown (default 1920). */
  fromYear?: number
  /** Latest selectable year in the dropdown (default current year + 5). */
  toYear?: number
}

function DatePicker({
  value,
  onChange,
  placeholder = "Seleccionar fecha",
  minDate,
  maxDate,
  className,
  fromYear = 1920,
  toYear = new Date().getFullYear() + 5,
}: DatePickerProps) {
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

  const years = React.useMemo(() => {
    const lo = Math.min(fromYear, toYear)
    const hi = Math.max(fromYear, toYear)
    // Newest first — birth dates and recent dates are reached fastest.
    return Array.from({ length: hi - lo + 1 }, (_, i) => hi - i)
  }, [fromYear, toYear])

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
          "flex h-10 md:h-9 w-full items-center gap-2 rounded-lg border border-[var(--border-base)] bg-[var(--bg-input)] px-3 text-sm transition-colors outline-none",
          "focus-visible:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/20",
          !displayValue && "text-[var(--text-placeholder)]",
          displayValue && "text-[var(--text-base)]"
        )}
      >
        <Calendar className="size-4 shrink-0 text-[var(--text-muted)]" />
        <span className="flex-1 text-left">{displayValue || placeholder}</span>
      </button>

      {open && (
        <div className="absolute left-0 top-11 z-50 w-[min(18rem,calc(100vw-2rem))] rounded-[var(--radius-xl)] border border-[var(--border-base)] bg-[var(--bg-card)] shadow-[var(--shadow-lg)] p-4">
          <div className="flex items-center gap-1.5 mb-4">
            <button
              type="button"
              onClick={prevMonth}
              aria-label="Mes anterior"
              className="flex size-9 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-base)] transition-colors"
            >
              <ChevronLeft className="size-4" />
            </button>

            <select
              aria-label="Mes"
              value={viewDate.month}
              onChange={(e) => setViewDate((v) => ({ ...v, month: Number(e.target.value) }))}
              className="flex-1 min-w-0 h-9 rounded-md border border-[var(--border-base)] bg-[var(--bg-input)] px-2 text-sm font-medium text-[var(--text-base)] outline-none focus-visible:border-[var(--color-primary)] cursor-pointer"
            >
              {MONTHS_ES.map((m, i) => (
                <option key={m} value={i}>{m}</option>
              ))}
            </select>

            <select
              aria-label="Año"
              value={viewDate.year}
              onChange={(e) => setViewDate((v) => ({ ...v, year: Number(e.target.value) }))}
              className="w-[4.5rem] shrink-0 h-9 rounded-md border border-[var(--border-base)] bg-[var(--bg-input)] px-2 text-sm font-medium text-[var(--text-base)] outline-none focus-visible:border-[var(--color-primary)] cursor-pointer"
            >
              {years.map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>

            <button
              type="button"
              onClick={nextMonth}
              aria-label="Mes siguiente"
              className="flex size-9 shrink-0 items-center justify-center rounded-md text-[var(--text-muted)] hover:bg-[var(--bg-muted)] hover:text-[var(--text-base)] transition-colors"
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
                    "flex size-9 mx-auto items-center justify-center rounded-full font-mono text-sm tabular-nums transition-colors",
                    selected && "bg-[var(--color-primary)] text-[var(--color-primary-contrast)] font-semibold",
                    !selected && todayDay && "border border-[var(--color-primary)] text-[var(--color-primary-ink)] font-medium",
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
