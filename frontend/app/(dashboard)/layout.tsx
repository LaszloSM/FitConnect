"use client";

import { useEffect, useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { MobileNav } from "@/components/layout/MobileNav";
import { RouteGuard } from "@/components/layout/RouteGuard";
import { SidebarProvider, useSidebar } from "@/components/layout/SidebarContext";
import { CheckinToaster } from "@/components/common/CheckinToaster";
import { SessionGuard } from "@/components/common/SessionGuard";
import { SIDEBAR_COLLAPSED_W, SIDEBAR_EXPANDED_W } from "@/lib/layout-constants";

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const width = mounted && collapsed ? SIDEBAR_COLLAPSED_W : SIDEBAR_EXPANDED_W;

  return (
    // El ancho del sidebar viaja como variable CSS: header y contenido lo leen
    // solo desde `lg`, así que en móvil y tablet no hay offset que calcular.
    <div
      className="min-h-dvh bg-surface"
      style={{ "--sidebar-w": `${width}px` } as React.CSSProperties}
    >
      <a
        href="#contenido"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-panel focus:px-3 focus:py-2 focus:text-sm focus:text-ink focus:shadow-[var(--shadow-md)]"
      >
        Saltar al contenido
      </a>
      <Sidebar />
      <Header />
      <main
        id="contenido"
        className="pb-24 pt-[calc(3.5rem+1.5rem)] transition-[padding] duration-200 ease-[var(--ease-out)] md:pb-10 md:pt-[calc(3.5rem+2rem)] lg:pl-[var(--sidebar-w)]"
      >
        <div className="mx-auto w-full max-w-[1440px] px-4 md:px-6 lg:px-8">
          <RouteGuard>{children}</RouteGuard>
        </div>
      </main>
      <MobileNav />
      <CheckinToaster />
      <SessionGuard />
    </div>
  );
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <SidebarProvider>
      <DashboardShell>{children}</DashboardShell>
    </SidebarProvider>
  );
}
