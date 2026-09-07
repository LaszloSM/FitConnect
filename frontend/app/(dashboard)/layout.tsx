"use client";

import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { SidebarProvider, useSidebar } from "@/components/layout/SidebarContext";
import { CheckinToaster } from "@/components/common/CheckinToaster";
import { SessionGuard } from "@/components/common/SessionGuard";
import { motion } from "framer-motion";

function DashboardShell({ children }: { children: React.ReactNode }) {
  const { collapsed } = useSidebar();

  return (
    <div className="min-h-screen bg-[var(--bg-base)]">
      <Sidebar />
      <Header />
      <motion.main
        animate={{ marginLeft: collapsed ? 64 : 256 }}
        transition={{ type: "spring", stiffness: 260, damping: 28 }}
        className="pt-16 p-6"
      >
        {children}
      </motion.main>
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
