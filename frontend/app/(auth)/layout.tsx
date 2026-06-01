import { Activity, Users, CreditCard } from "lucide-react";
import { BrandMark } from "@/components/common/BrandMark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex">
      {/* Brand showcase — athletic Volt panel (desktop only) */}
      <div
        className="hidden lg:flex flex-col justify-between w-[44%] max-w-[560px] p-12 relative overflow-hidden"
        style={{
          background:
            "radial-gradient(120% 90% at 0% 0%, oklch(0.20 0.04 150), oklch(0.13 0.012 150) 60%)",
        }}
      >
        {/* Volt glow */}
        <div
          className="absolute -top-24 -left-24 h-80 w-80 rounded-full blur-3xl opacity-30"
          style={{ background: "oklch(0.78 0.19 128)" }}
          aria-hidden
        />

        <div className="relative flex items-center gap-2.5">
          <BrandMark size={36} />
          <span className="text-white font-extrabold text-xl tracking-tight">FitConnect</span>
        </div>

        <div className="relative">
          <h1 className="text-white font-extrabold text-4xl leading-[1.1] tracking-tight">
            Opera tu gimnasio
            <br />
            con precisión de atleta.
          </h1>
          <p className="text-white/60 text-base mt-4 max-w-sm">
            Miembros, pagos, asistencia y clases en una sola plataforma rápida y clara.
          </p>

          <div className="flex gap-3 mt-8">
            {[
              { icon: Users, label: "Socios" },
              { icon: Activity, label: "Check-ins" },
              { icon: CreditCard, label: "Pagos" },
            ].map(({ icon: Icon, label }) => (
              <div
                key={label}
                className="flex items-center gap-2 rounded-lg px-3 py-2 border border-white/10 bg-white/5"
              >
                <Icon className="h-4 w-4" style={{ color: "oklch(0.82 0.20 128)" }} />
                <span className="text-white/80 text-xs font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-white/40 text-xs">© {new Date().getFullYear()} FitConnect</p>
      </div>

      {/* Form area */}
      <div
        className="flex-1 flex items-center justify-center p-6"
        style={{
          background:
            "radial-gradient(ellipse at center, oklch(0.16 0.012 150) 0%, oklch(0.12 0.010 150) 70%)",
        }}
      >
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
