"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { api, clearSession, getSession, type PlatformSession } from "@/lib/api";
import { BrandMark } from "@/components/BrandMark";

const NAV = [
  { href: "/", label: "Gimnasios" },
  { href: "/bitacora", label: "Bitácora" },
];

/** Marco del panel: sin sesión manda al login; la sesión se cierra sola a los 30 min. */
export function Shell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [session, setSession] = useState<PlatformSession | null>(null);

  useEffect(() => {
    const s = getSession();
    if (!s) {
      router.replace("/login");
      return;
    }
    setSession(s);
  }, [router]);

  const logout = async () => {
    await api("/auth/logout", { method: "POST" }).catch(() => undefined);
    clearSession();
    router.replace("/login");
  };

  if (!session) return null;

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-10 border-b border-line bg-sidebar/95 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-[1200px] items-center gap-6 px-4 md:px-6">
          <span className="flex items-center gap-2 font-display text-[15px] font-bold">
            <BrandMark size={26} />
            LSMFit · Plataforma
          </span>
          <nav className="flex gap-1">
            {NAV.map((n) => {
              const active = n.href === "/" ? pathname === "/" || pathname.startsWith("/gimnasios") : pathname.startsWith(n.href);
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-[var(--radius-sm)] px-3 py-1.5 text-sm font-medium ${
                    active ? "bg-panel text-ink shadow-[var(--shadow-card)]" : "text-ink-muted hover:text-ink"
                  }`}
                >
                  {n.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="hidden text-ink-muted sm:inline">{session.email}</span>
            <button className="btn btn-outline btn-sm" onClick={logout}>
              Salir
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1200px] px-4 py-8 md:px-6">{children}</main>
    </div>
  );
}
