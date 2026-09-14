"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LockIcon as Lock } from "@phosphor-icons/react";
import { EmptyState } from "@/components/common/EmptyState";
import { buttonVariants } from "@/components/ui/button";
import { P, useCan, type Permission } from "@/lib/permissions";

/**
 * El menú ya esconde lo que el rol no puede ver, pero la URL sigue abierta: sin
 * esta guarda, recepción entraba a /reports y veía tarjetas con "No se pudo
 * cargar". La autorización real la hace el backend; esto solo evita mostrar una
 * pantalla rota a quien no le corresponde.
 */
const RULES: { prefix: string; anyOf: Permission[] }[] = [
  { prefix: "/reports", anyOf: [P.REPORTS_READ] },
  { prefix: "/audit", anyOf: [P.AUDIT_READ] },
  { prefix: "/messages", anyOf: [P.MESSAGES_READ] },
  { prefix: "/payments", anyOf: [P.PAYMENTS_READ, P.PAYMENTS_WRITE, P.CASH_OPEN, P.DAY_PASSES_SELL] },
  { prefix: "/plans", anyOf: [P.PLANS_READ] },
  { prefix: "/machines", anyOf: [P.MACHINES_READ] },
  { prefix: "/members", anyOf: [P.MEMBERS_READ] },
  { prefix: "/entrenador", anyOf: [P.TRAINER_PORTAL] },
];

export function RouteGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";
  const { canAny, ready, role } = useCan();
  const rule = RULES.find((r) => pathname === r.prefix || pathname.startsWith(r.prefix + "/"));

  if (!rule || !ready || canAny(...rule.anyOf)) return <>{children}</>;

  return (
    <EmptyState
      icon={<Lock className="size-10 text-ink-muted" />}
      title="Esta sección no está disponible para tu rol"
      description="Si necesitas verla, pídele al dueño del gimnasio que ajuste tu rol en Configuración → Equipo."
      action={
        <Link href={role === "trainer" ? "/entrenador" : "/dashboard"} className={buttonVariants({ variant: "outline" })}>
          Volver al inicio
        </Link>
      }
    />
  );
}
