"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, Users, CreditCard, Calendar,
  Dumbbell, BarChart3, Settings, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/members", label: "Miembros", icon: Users },
  { href: "/payments", label: "Pagos", icon: CreditCard },
  { href: "/classes", label: "Clases", icon: Calendar },
  { href: "/machines", label: "Máquinas", icon: Dumbbell },
  { href: "/reports", label: "Reportes", icon: BarChart3 },
  { href: "/settings", label: "Configuración", icon: Settings },
];

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="w-64 bg-zinc-900 border-r border-zinc-800 flex flex-col h-screen fixed">
      <div className="p-6 border-b border-zinc-800">
        <div className="flex items-center gap-2">
          <Zap className="h-6 w-6 text-orange-500" />
          <span className="text-white font-bold text-lg">SaaS Gym</span>
        </div>
      </div>
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href}
            className={cn(
              "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
              pathname === href
                ? "bg-orange-500/20 text-orange-400 font-medium"
                : "text-zinc-400 hover:bg-zinc-800 hover:text-white"
            )}>
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
