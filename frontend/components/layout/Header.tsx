"use client";
import { signOut } from "next-auth/react";
import { Bell, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export function Header({ gymName }: { gymName?: string }) {
  return (
    <header className="h-16 bg-zinc-900 border-b border-zinc-800 flex items-center justify-between px-6 fixed top-0 right-0 left-64 z-10">
      <h1 className="text-white font-semibold">{gymName ?? "Mi Gym"}</h1>
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white">
          <Bell className="h-5 w-5" />
        </Button>
        <Button variant="ghost" size="icon" className="text-zinc-400 hover:text-white"
          onClick={() => signOut({ callbackUrl: "/login" })}>
          <LogOut className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
