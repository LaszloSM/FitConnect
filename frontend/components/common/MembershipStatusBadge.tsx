import { cn } from "@/lib/utils"

type MembershipStatus = "ok" | "expired" | "no_membership"

interface MembershipStatusBadgeProps {
  status: MembershipStatus
  endDate?: string
  className?: string
}

function getDaysDiff(isoDate: string): number {
  const end = new Date(isoDate)
  const now = new Date()
  end.setHours(0, 0, 0, 0)
  now.setHours(0, 0, 0, 0)
  return Math.round((end.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
}

function MembershipStatusBadge({ status, endDate, className }: MembershipStatusBadgeProps) {
  let label: string
  let badgeClass: string
  let dotClass: string

  if (status === "no_membership") {
    label = "Sin membresía"
    badgeClass = "bg-[var(--bg-muted)] border-[var(--border-base)] text-[var(--text-muted)]"
    dotClass = "bg-[var(--text-muted)]"
  } else if (status === "expired") {
    const days = endDate ? Math.abs(getDaysDiff(endDate)) : null
    label = days !== null ? `Vencida · hace ${days} día${days !== 1 ? "s" : ""}` : "Vencida"
    badgeClass = "bg-red-50 border-red-200 text-red-700 dark:bg-red-950/30 dark:border-red-800/50 dark:text-red-400"
    dotClass = "bg-red-500"
  } else {
    // status === "ok"
    if (endDate) {
      const days = getDaysDiff(endDate)
      if (days <= 7) {
        label = `Por vencer · ${days} día${days !== 1 ? "s" : ""}`
        badgeClass = "bg-amber-50 border-amber-200 text-amber-700 dark:bg-amber-950/30 dark:border-amber-800/50 dark:text-amber-400"
        dotClass = "bg-amber-500"
      } else {
        label = `Activa · ${days} día${days !== 1 ? "s" : ""}`
        badgeClass = "bg-green-50 border-green-200 text-green-700 dark:bg-green-950/30 dark:border-green-800/50 dark:text-green-400"
        dotClass = "bg-green-500"
      }
    } else {
      label = "Activa"
      badgeClass = "bg-green-50 border-green-200 text-green-700 dark:bg-green-950/30 dark:border-green-800/50 dark:text-green-400"
      dotClass = "bg-green-500"
    }
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium",
        badgeClass,
        className
      )}
    >
      <span className={cn("size-1.5 rounded-full shrink-0", dotClass)} />
      {label}
    </span>
  )
}

export { MembershipStatusBadge }
