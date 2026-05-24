"use client"

import * as React from "react"
import { Clock } from "lucide-react"
import { cn } from "@/lib/utils"

const ALL_TIMES = Array.from({ length: 96 }, (_, i) => {
  const h = Math.floor(i / 4)
  const m = (i % 4) * 15
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`
})

function getGroup(time: string): "Mañana" | "Tarde" | "Noche" {
  const h = parseInt(time.split(":")[0], 10)
  if (h < 12) return "Mañana"
  if (h < 19) return "Tarde"
  return "Noche"
}

interface TimePickerProps {
  value?: string
  onChange: (time: string) => void
  placeholder?: string
}

function TimePicker({ value, onChange, placeholder = "Seleccionar hora" }: TimePickerProps) {
  const [open, setOpen] = React.useState(false)
  const [search, setSearch] = React.useState("")
  const ref = React.useRef<HTMLDivElement>(null)
  const listRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClick)
    return () => document.removeEventListener("mousedown", handleClick)
  }, [])

  // Scroll to selected time when opening
  React.useEffect(() => {
    if (open && value && listRef.current) {
      const el = listRef.current.querySelector(`[data-time="${value}"]`) as HTMLElement
      if (el) el.scrollIntoView({ block: "center" })
    }
  }, [open, value])

  const filtered = search
    ? ALL_TIMES.filter((t) => t.includes(search))
    : ALL_TIMES

  const groups: Record<string, string[]> = {}
  for (const t of filtered) {
    const g = getGroup(t)
    if (!groups[g]) groups[g] = []
    groups[g].push(t)
  }

  return (
    <div ref={ref} className="relative w-full">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={cn(
          "flex h-9 w-full items-center gap-2 rounded-lg border border-[var(--border-base)] bg-[var(--bg-input)] px-3 text-sm transition-colors outline-none",
          "focus-visible:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/20",
          !value && "text-[var(--text-placeholder)]",
          value && "text-[var(--text-base)]"
        )}
      >
        <Clock className="size-4 shrink-0 text-[var(--text-muted)]" />
        <span className="flex-1 text-left">{value || placeholder}</span>
      </button>

      {open && (
        <div className="absolute left-0 top-10 z-50 w-56 rounded-lg border border-[var(--border-base)] bg-[var(--bg-card)] shadow-[var(--shadow-md)] flex flex-col" style={{ maxHeight: 280 }}>
          <div className="p-2 border-b border-[var(--border-base)]">
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar hora..."
              className="w-full rounded-md border border-[var(--border-base)] bg-[var(--bg-input)] px-2 py-1 text-xs text-[var(--text-base)] outline-none placeholder:text-[var(--text-placeholder)] focus:border-[var(--color-primary)]"
            />
          </div>
          <div ref={listRef} className="overflow-y-auto flex-1">
            {Object.entries(groups).map(([group, times]) => (
              <div key={group}>
                <div className="px-3 py-1.5 text-xs font-semibold text-[var(--text-muted)] sticky top-0 bg-[var(--bg-card)]">
                  {group}
                </div>
                {times.map((t) => (
                  <button
                    key={t}
                    type="button"
                    data-time={t}
                    onClick={() => { onChange(t); setOpen(false) }}
                    className={cn(
                      "w-full px-3 py-1.5 text-left text-sm transition-colors",
                      t === value
                        ? "bg-[var(--color-primary)] text-white font-medium"
                        : "text-[var(--text-base)] hover:bg-[var(--bg-muted)]"
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>
            ))}
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-sm text-[var(--text-muted)] text-center">Sin resultados</p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export { TimePicker }
