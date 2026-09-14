import { SquaresFourIcon as LayoutDashboard, UsersIcon as Users, CreditCardIcon as CreditCard, CalendarBlankIcon as Calendar, BarbellIcon as Dumbbell, ChartBarIcon as BarChart3, GearSixIcon as Settings, ActivityIcon as Activity, TagIcon as Tag, ScrollIcon as ScrollText, QuestionIcon as HelpCircle, ChatTextIcon as MessageSquare, ClipboardTextIcon as ClipboardList, SunIcon as Sun, WrenchIcon as Wrench } from "@phosphor-icons/react/ssr";
import { P, type Permission } from "@/lib/permissions";

export type NavItem = {
  href: string;
  label: string;
  icon: typeof Users;
  /** Sin esta capacidad el ítem no se muestra: una puerta que responde 403 es
   *  peor que no ofrecerla. */
  needs?: Permission;
};
export type NavGroup = { label: string; items: NavItem[] };

// El entrenador no ve un gimnasio recortado: ve SU día.
export const trainerGroups: NavGroup[] = [
  {
    label: "Mi trabajo",
    items: [
      { href: "/entrenador", label: "Mi día", icon: Sun },
      { href: "/entrenador/socios", label: "Mis socios", icon: Users },
      { href: "/entrenador/rutinas", label: "Mis rutinas", icon: ClipboardList },
    ],
  },
  {
    label: "Gimnasio",
    items: [
      { href: "/classes", label: "Clases", icon: Calendar },
      { href: "/routines", label: "Rutinas", icon: Dumbbell },
      { href: "/ayuda", label: "Ayuda", icon: HelpCircle },
    ],
  },
];

export const staffGroups: NavGroup[] = [
  {
    label: "Operación",
    items: [
      { href: "/dashboard", label: "Panel", icon: LayoutDashboard },
      { href: "/members", label: "Socios", icon: Users },
      { href: "/checkins", label: "Check-ins", icon: Activity },
      { href: "/classes", label: "Clases", icon: Calendar },
      { href: "/routines", label: "Rutinas", icon: Dumbbell },
      { href: "/messages", label: "Mensajes", icon: MessageSquare, needs: P.MESSAGES_READ },
    ],
  },
  {
    label: "Negocio",
    items: [
      { href: "/payments", label: "Caja y pagos", icon: CreditCard, needs: P.PAYMENTS_WRITE },
      { href: "/plans", label: "Planes", icon: Tag, needs: P.PLANS_READ },
      { href: "/machines", label: "Máquinas", icon: Wrench, needs: P.MACHINES_READ },
      { href: "/reports", label: "Reportes", icon: BarChart3, needs: P.REPORTS_READ },
    ],
  },
  {
    label: "Sistema",
    items: [
      { href: "/audit", label: "Auditoría", icon: ScrollText, needs: P.AUDIT_READ },
      { href: "/settings", label: "Configuración", icon: Settings },
      { href: "/ayuda", label: "Ayuda", icon: HelpCircle },
    ],
  },
];

/** Los cuatro destinos fijos de la barra inferior en móvil (el quinto es "Más"). */
export const staffMobile: NavItem[] = [
  { href: "/dashboard", label: "Panel", icon: LayoutDashboard },
  { href: "/members", label: "Socios", icon: Users },
  { href: "/payments", label: "Cobrar", icon: CreditCard },
  { href: "/checkins", label: "Check-ins", icon: Activity },
];

export const trainerMobile: NavItem[] = [
  { href: "/entrenador", label: "Mi día", icon: Sun },
  { href: "/entrenador/socios", label: "Socios", icon: Users },
  { href: "/entrenador/rutinas", label: "Rutinas", icon: ClipboardList },
  { href: "/classes", label: "Clases", icon: Calendar },
];

export function isActivePath(pathname: string, href: string) {
  if (pathname === href) return true;
  if (href === "/dashboard" || href === "/entrenador") return false;
  return pathname.startsWith(href + "/");
}
