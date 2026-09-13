import { daysUntil } from "@/lib/format"
import { StatusBadge } from "@/components/ui/status-badge"

type MembershipStatus = "ok" | "expired" | "no_membership"

interface MembershipStatusBadgeProps {
  status: MembershipStatus
  endDate?: string
  className?: string
}

const plural = (n: number) => `${n} día${n !== 1 ? "s" : ""}`

/** Estado de membresía con los días que faltan o que pasaron, sobre el badge del sistema. */
function MembershipStatusBadge({ status, endDate, className }: MembershipStatusBadgeProps) {
  if (status === "no_membership") {
    return <StatusBadge status="none" className={className} />
  }

  if (status === "expired") {
    const days = endDate ? Math.abs(daysUntil(endDate)) : null
    return (
      <StatusBadge
        status="expired"
        label={days !== null ? `Vencida · hace ${plural(days)}` : "Vencida"}
        className={className}
      />
    )
  }

  if (!endDate) return <StatusBadge status="active" className={className} />

  const days = daysUntil(endDate)
  return days <= 7 ? (
    <StatusBadge status="in_grace" tone="warning" label={`Por vencer · ${plural(days)}`} className={className} />
  ) : (
    <StatusBadge status="active" label={`Activa · ${plural(days)}`} className={className} />
  )
}

export { MembershipStatusBadge }
