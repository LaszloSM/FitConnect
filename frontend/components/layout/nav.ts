import {
  BarbellIcon,
  CalendarBlankIcon,
  CashRegisterIcon,
  ChartBarIcon,
  ChatTextIcon,
  ClipboardTextIcon,
  DoorOpenIcon,
  GearSixIcon,
  HouseSimpleIcon,
  QuestionIcon,
  ScrollIcon,
  SunIcon,
  TagIcon,
  UsersIcon,
  WrenchIcon,
} from "@phosphor-icons/react/ssr";
import { P, type Permission } from "@/lib/permissions";

export type NavItem = {
  href: string;
  label: string;
  icon: typeof UsersIcon;
  /** Sin esta capacidad el ítem no se muestra: una puerta que responde 403 es
   *  peor que no ofrecerla. */
  needs?: Permission;
};
/** Un grupo sin etiqueta es el bloque principal del menú. */
export type NavGroup = { label: string; items: NavItem[] };

// El entrenador no ve un gimnasio recortado: ve SU día.
export const trainerGroups: NavGroup[] = [
  {
    label: "",
    items: [
      { href: "/entrenador", label: "Mi día", icon: SunIcon },
      { href: "/entrenador/socios", label: "Mis socios", icon: UsersIcon },
      { href: "/entrenador/rutinas", label: "Mis rutinas", icon: ClipboardTextIcon },
      { href: "/classes", label: "Clases", icon: CalendarBlankIcon },
    ],
  },
  {
    label: "Más",
    items: [
      { href: "/routines", label: "Rutinas", icon: BarbellIcon },
      { href: "/ayuda", label: "Ayuda", icon: QuestionIcon },
    ],
  },
];

// Seis destinos para el trabajo diario; lo que se configura una vez vive en "Más".
export const staffGroups: NavGroup[] = [
  {
    label: "",
    items: [
      { href: "/dashboard", label: "Hoy", icon: HouseSimpleIcon },
      { href: "/checkins", label: "Mostrador", icon: DoorOpenIcon },
      { href: "/members", label: "Socios", icon: UsersIcon },
      { href: "/payments", label: "Caja", icon: CashRegisterIcon, needs: P.PAYMENTS_WRITE },
      { href: "/classes", label: "Clases", icon: CalendarBlankIcon },
      { href: "/reports", label: "Informe", icon: ChartBarIcon, needs: P.REPORTS_READ },
    ],
  },
  {
    label: "Más",
    items: [
      { href: "/routines", label: "Rutinas", icon: BarbellIcon },
      { href: "/messages", label: "Mensajes", icon: ChatTextIcon, needs: P.MESSAGES_READ },
      { href: "/plans", label: "Planes", icon: TagIcon, needs: P.PLANS_READ },
      { href: "/machines", label: "Máquinas", icon: WrenchIcon, needs: P.MACHINES_READ },
      { href: "/audit", label: "Auditoría", icon: ScrollIcon, needs: P.AUDIT_READ },
      { href: "/settings", label: "Ajustes", icon: GearSixIcon },
      { href: "/ayuda", label: "Ayuda", icon: QuestionIcon },
    ],
  },
];

/** Destinos fijos de la barra inferior en móvil; "Más" abre el menú completo.
 *  `featured` es la acción principal y va al centro, resaltada. */
export const staffMobile: (NavItem & { featured?: boolean })[] = [
  { href: "/dashboard", label: "Hoy", icon: HouseSimpleIcon },
  { href: "/members", label: "Socios", icon: UsersIcon },
  { href: "/payments", label: "Cobrar", icon: CashRegisterIcon, featured: true },
  { href: "/checkins", label: "Mostrador", icon: DoorOpenIcon },
];

export const trainerMobile: (NavItem & { featured?: boolean })[] = [
  { href: "/entrenador", label: "Mi día", icon: SunIcon },
  { href: "/entrenador/socios", label: "Socios", icon: UsersIcon },
  { href: "/entrenador/rutinas", label: "Rutinas", icon: ClipboardTextIcon },
  { href: "/classes", label: "Clases", icon: CalendarBlankIcon },
];

export function isActivePath(pathname: string, href: string) {
  if (pathname === href) return true;
  if (href === "/dashboard" || href === "/entrenador") return false;
  return pathname.startsWith(href + "/");
}
