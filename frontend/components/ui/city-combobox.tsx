"use client"

import { useEffect, useMemo, useState } from "react"
import { Combobox } from "@base-ui/react/combobox"
import { ChevronDownIcon, CheckIcon, MapPin } from "lucide-react"
import { cn } from "@/lib/utils"
import { COLOMBIA_CITIES } from "@/lib/geo"

interface CityComboboxProps {
  value?: string
  onChange?: (value: string) => void
  className?: string
  placeholder?: string
  /** Fuerza superficie blanca sobre cards claras (auth). */
  id?: string
}

// Búsqueda insensible a tildes: "bogota" encuentra "Bogotá", "medellin" a "Medellín"
const fold = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()

// Combobox con búsqueda por ciudad o departamento. Permite texto libre: si lo
// escrito no coincide con la lista, ofrece "Usar: {texto}" para guardarlo igual
// (un municipio pequeño no listado sigue siendo válido).
function CityCombobox({ value, onChange, className, placeholder = "Ciudad", id }: CityComboboxProps) {
  const [inputValue, setInputValue] = useState(value ?? "")

  useEffect(() => {
    setInputValue(value ?? "")
  }, [value])

  const matches = useMemo(() => {
    const q = fold(inputValue.trim())
    if (!q) return COLOMBIA_CITIES.slice(0, 50).map((c) => c.city)
    const filtered = COLOMBIA_CITIES.filter(
      (c) => fold(c.city).includes(q) || fold(c.department).includes(q)
    )
    const cities = filtered.map((c) => c.city)
    // Texto libre: si no hay coincidencia exacta, permitir guardar lo escrito
    const exact = COLOMBIA_CITIES.some((c) => fold(c.city) === q)
    if (!exact && inputValue.trim()) cities.unshift(inputValue.trim())
    return Array.from(new Set(cities)).slice(0, 50)
  }, [inputValue])

  const deptOf = (city: string) =>
    COLOMBIA_CITIES.find((c) => c.city === city)?.department

  const triggerBg = "bg-[var(--bg-input)] border-[var(--border-base)] text-[var(--text-base)]"

  return (
    <Combobox.Root
      items={matches}
      value={value || null}
      onValueChange={(v) => onChange?.(v ?? "")}
      inputValue={inputValue}
      onInputValueChange={(v) => {
        setInputValue(v)
        onChange?.(v)
      }}
    >
      <div className="relative">
        <MapPin className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--text-muted)]" />
        <Combobox.Input
          id={id}
          placeholder={placeholder}
          className={cn(
            "flex h-9 w-full items-center rounded-lg border pl-9 pr-9 text-sm transition-colors outline-none",
            "placeholder:text-[var(--text-placeholder)]",
            "focus-visible:border-[var(--color-primary)] focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/20",
            "disabled:cursor-not-allowed disabled:opacity-50",
            triggerBg,
            className
          )}
        />
        <Combobox.Icon
          render={<ChevronDownIcon className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 size-4 text-[var(--text-muted)]" />}
        />
      </div>

      <Combobox.Portal>
        <Combobox.Positioner side="bottom" sideOffset={4} className="isolate z-50">
          <Combobox.Popup className="w-(--anchor-width) max-h-72 origin-(--transform-origin) overflow-y-auto rounded-lg border border-[var(--border-base)] bg-[var(--bg-card)] p-1 shadow-[var(--shadow-md)] data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95 duration-100">
            <Combobox.Empty className="px-3 py-2 text-sm text-[var(--text-muted)]">
              Escribe para buscar tu ciudad
            </Combobox.Empty>
            <Combobox.List>
              {(city: string) => (
                <Combobox.Item
                  key={city}
                  value={city}
                  className="relative flex w-full cursor-default items-center gap-2 rounded-md py-1.5 pr-8 pl-2 text-sm text-[var(--text-base)] outline-hidden select-none transition-colors data-highlighted:bg-[var(--color-primary-muted)]"
                >
                  <span className="flex-1 truncate">
                    {city}
                    {deptOf(city) && (
                      <span className="ml-1.5 text-[11px] text-[var(--text-muted)]">{deptOf(city)}</span>
                    )}
                  </span>
                  <Combobox.ItemIndicator
                    render={<span className="absolute right-2 flex size-4 items-center justify-center" />}
                  >
                    <CheckIcon className="size-3.5" />
                  </Combobox.ItemIndicator>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  )
}

export { CityCombobox }
