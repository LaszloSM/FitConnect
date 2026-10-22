"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { useSlidingIndicator } from "@/components/motion/useSlidingIndicator"

interface TabsContextValue {
  active: string
  setActive: (v: string) => void
}

const TabsContext = React.createContext<TabsContextValue>({ active: "", setActive: () => {} })

interface TabsProps {
  defaultValue?: string
  value?: string
  onValueChange?: (value: string) => void
  children: React.ReactNode
  className?: string
}

function Tabs({ defaultValue = "", value, onValueChange, children, className }: TabsProps) {
  const [internal, setInternal] = React.useState(defaultValue)
  const active = value ?? internal
  function setActive(v: string) {
    setInternal(v)
    onValueChange?.(v)
  }
  return (
    <TabsContext.Provider value={{ active, setActive }}>
      <div className={cn("flex flex-col gap-5", className)}>{children}</div>
    </TabsContext.Provider>
  )
}

function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  const { active } = React.useContext(TabsContext)
  const list = React.useRef<HTMLDivElement>(null)
  // El subrayado se desliza a la pestaña nueva: dice de dónde vienes y a dónde vas.
  const ind = useSlidingIndicator<HTMLDivElement, HTMLSpanElement>(list, '[role="tab"][aria-selected="true"]', [active])
  return (
    <div
      ref={list}
      role="tablist"
      className={cn(
        // Scroll propio en móvil: las pestañas nunca empujan el ancho de la página.
        "relative -mx-4 flex items-center gap-1 overflow-x-auto border-b border-line-soft px-4 [scrollbar-width:none] md:mx-0 md:px-0",
        className
      )}
    >
      {children}
      <span ref={ind} aria-hidden="true" className="slide-ind bottom-0 left-0 h-0.5 w-px bg-action opacity-0" />
    </div>
  )
}

interface TabsTriggerProps {
  value: string
  children: React.ReactNode
  className?: string
  disabled?: boolean
}

function TabsTrigger({ value, children, className, disabled }: TabsTriggerProps) {
  const { active, setActive } = React.useContext(TabsContext)
  const isActive = active === value

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      disabled={disabled}
      onClick={() => !disabled && setActive(value)}
      className={cn(
        "relative flex h-11 items-center gap-2 whitespace-nowrap px-3 text-sm font-medium outline-none transition-colors duration-150",
        "focus-visible:rounded-[var(--radius-sm)] focus-visible:ring-2 focus-visible:ring-action/40",
        "[&_svg]:size-4",
        isActive ? "text-ink" : "text-ink-muted hover:text-ink",
        disabled && "cursor-not-allowed opacity-50",
        className
      )}
    >
      {children}
    </button>
  )
}

interface TabsContentProps {
  value: string
  children: React.ReactNode
  className?: string
}

function TabsContent({ value, children, className }: TabsContentProps) {
  const { active } = React.useContext(TabsContext)
  if (active !== value) return null
  return (
    <div role="tabpanel" className={cn("outline-none", className)}>
      {children}
    </div>
  )
}

export { Tabs, TabsList, TabsTrigger, TabsContent }
