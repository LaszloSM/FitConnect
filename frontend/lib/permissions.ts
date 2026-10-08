"use client";

import { useSession } from "next-auth/react";

/**
 * Capacidades del backend (`app/core/permissions.py`).
 *
 * La MATRIZ no se copia aquí: el login devuelve las capacidades del rol y
 * viajan en la sesión. Lo único que se repite son los nombres, y
 * `test_permission_names.py` falla si alguno deja de existir en el backend.
 */
export const P = {
  PAYMENTS_READ: "payments.read",
  PAYMENTS_WRITE: "payments.write",
  PAYMENTS_CONFIRM: "payments.confirm",
  PAYMENTS_REVERSE: "payments.reverse",

  CASH_READ: "cash.read",
  CASH_OPEN: "cash.open",
  CASH_CLOSE: "cash.close",
  CASH_EXPENSE: "cash.expense",
  CASH_REOPEN: "cash.reopen",

  PLANS_READ: "plans.read",
  PLANS_WRITE: "plans.write",

  MEMBERS_READ: "members.read",
  MEMBERS_WRITE: "members.write",
  MEMBERS_DELETE: "members.delete",
  MEMBERS_IMPORT: "members.import",
  MEMBERSHIPS_WRITE: "memberships.write",
  MEMBERSHIPS_COURTESY: "memberships.courtesy",
  MEMBER_MONEY_READ: "members.money_read",

  DAY_PASSES_SELL: "day_passes.sell",
  DAY_PASSES_WRITE: "day_passes.write",

  PRODUCTS_READ: "products.read",
  PRODUCTS_WRITE: "products.write",
  STOCK_MOVEMENT: "stock.movement",

  MACHINES_READ: "machines.read",
  MACHINES_WRITE: "machines.write",
  MACHINES_MAINTAIN: "machines.maintain",

  CLASSES_READ: "classes.read",
  CLASSES_WRITE: "classes.write",
  CLASSES_ATTEND: "classes.attend",

  INSTRUCTORS_READ: "instructors.read",
  INSTRUCTORS_WRITE: "instructors.write",

  ROUTINES_READ: "routines.read",
  ROUTINES_WRITE: "routines.write",
  ROUTINES_ASSIGN: "routines.assign",

  TRAINER_PORTAL: "trainer.portal",

  CHECKINS_WRITE: "checkins.write",
  ACCESS_VALIDATE: "access.validate",
  ACCESS_OVERRIDE: "access.override",
  CREDENTIALS_WRITE: "credentials.write",
  CONSENT_WRITE: "consent.write",

  REPORTS_READ: "reports.read",

  MESSAGES_READ: "messages.read",
  MESSAGES_WRITE: "messages.write",
  MESSAGES_SEND: "messages.send",
  NOTIFICATIONS_OUTBOX: "notifications.outbox",

  SETTINGS_READ: "settings.read",
  SETTINGS_PROFILE: "settings.profile",
  SETTINGS_WRITE: "settings.write",
  SETTINGS_SECRETS: "settings.secrets",

  LOCATIONS_WRITE: "locations.write",
  PROMOS_WRITE: "promos.write",
  KIOSK_MANAGE: "kiosk.manage",

  USERS_READ: "users.read",
  USERS_MANAGE: "users.manage",
  AUDIT_READ: "audit.read",
  JOBS_RUN: "jobs.run",
} as const;

export type Permission = (typeof P)[keyof typeof P];

/**
 * `can(permiso)` para decidir qué se muestra.
 *
 * Mientras la sesión carga devuelve `false`: es preferible que un botón aparezca
 * un instante después a que alguien alcance a ver lo que no le corresponde.
 */
export function useCan() {
  const { data: session, status } = useSession();
  // El rol vive en `session.role`, NO en `session.user.role`: leerlo del user
  // devuelve undefined y cualquier comparación es falsa en silencio.
  const granted = session?.permissions ?? [];
  const ready = status === "authenticated";

  const can = (...perms: Permission[]) => ready && perms.every((p) => granted.includes(p));
  const canAny = (...perms: Permission[]) => ready && perms.some((p) => granted.includes(p));

  return { can, canAny, ready, role: session?.role ?? null };
}

/** Roles tal como se le nombran a una persona, no como los guarda el backend. */
export const ROLE_LABEL: Record<string, string> = {
  owner: "Dueño",
  admin: "Administrador",
  receptionist: "Recepcionista",
  trainer: "Entrenador",
};

export const rolLegible = (rol: string | null | undefined) =>
  rol ? ROLE_LABEL[rol] ?? rol : "";
