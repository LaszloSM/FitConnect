"use client"

import { useEffect, useState } from "react"
import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { CheckCircleIcon as CircleCheckIcon, InfoIcon, WarningIcon as TriangleAlertIcon, XCircleIcon as OctagonXIcon, SpinnerGapIcon as Loader2Icon } from "@phosphor-icons/react";

const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  // Igual que el Header: hasta montar se usa el valor por defecto del servidor.
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  return (
    <Sonner
      theme={(mounted ? theme : "system") as ToasterProps["theme"]}
      className="toaster group"
      // En móvil la barra de navegación inferior ocupa 56 px: el toast va encima.
      mobileOffset={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }}
      icons={{
        success: (
          <CircleCheckIcon className="size-4" />
        ),
        info: (
          <InfoIcon className="size-4" />
        ),
        warning: (
          <TriangleAlertIcon className="size-4" />
        ),
        error: (
          <OctagonXIcon className="size-4" />
        ),
        loading: (
          <Loader2Icon className="size-4 animate-spin" />
        ),
      }}
      style={
        {
          // Vars de shadcn que este proyecto nunca definió: el toast salía con
          // los colores por defecto de sonner, ajenos al tema.
          "--normal-bg": "var(--bg-card)",
          "--normal-text": "var(--text-base)",
          "--normal-border": "var(--border-base)",
          "--border-radius": "var(--radius-md)",
        } as React.CSSProperties
      }
      toastOptions={{
        classNames: {
          toast: "cn-toast",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
