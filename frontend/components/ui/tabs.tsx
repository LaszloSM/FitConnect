"use client"

import * as React from "react"
import { motion } from "framer-motion"
import { cn } from "@/lib/utils"

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
      <div className={cn("flex flex-col gap-4", className)}>{children}</div>
    </TabsContext.Provider>
  )
}

function TabsList({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      role="tablist"
      className={cn(
        "relative flex items-center gap-1 border-b border-[var(--border-base)] overflow-x-auto",
        className
      )}
    >
      {children}
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
        "relative pb-2.5 pt-1 px-1 text-sm font-medium whitespace-nowrap transition-colors outline-none",
        "focus-visible:ring-2 focus-visible:ring-[var(--color-primary)]/40 rounded-sm",
        isActive ? "text-[var(--text-base)]" : "text-[var(--text-muted)] hover:text-[var(--text-base)]",
        disabled && "opacity-50 cursor-not-allowed",
        className
      )}
    >
      {children}
      {isActive && (
        <motion.div
          layoutId="tab-indicator"
          className="absolute bottom-0 left-0 right-0 h-0.5 rounded-full bg-[var(--color-primary)]"
          transition={{ type: "spring", stiffness: 500, damping: 35 }}
        />
      )}
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
