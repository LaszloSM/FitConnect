import { Activity, Users, CreditCard } from "lucide-react";
import { BrandMark } from "@/components/common/BrandMark";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex bg-[var(--bg-base)]">
      {/* Panel de marca: superficie oscura FIJA a propósito, como la landing y
          la pantalla del gym. Por eso lleva el relleno de marca y nunca el ink,
          que en tema claro es oscuro y desaparecería sobre el negro. */}
      <div
        className="hidden lg:flex flex-col justify-between w-[44%] max-w-[560px] p-12 relative overflow-hidden"
        style={{
          background:
            "radial-gradient(120% 90% at 0% 0%, oklch(0.22 0.05 45), oklch(0.14 0.014 45) 60%)",
        }}
      >
        <div
          className="absolute -top-24 -left-24 h-80 w-80 rounded-full blur-3xl opacity-25 pointer-events-none"
          style={{ background: "var(--color-primary)" }}
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
                <Icon className="h-4 w-4 text-[var(--color-primary)]" />
                <span className="text-white/80 text-xs font-medium">{label}</span>
              </div>
            ))}
          </div>
        </div>

        <p className="relative text-white/40 text-xs">© {new Date().getFullYear()} FitConnect</p>
      </div>

      {/* Área del formulario: SÍ sigue el tema. Antes era un degradado oscuro
          fijo con una tarjeta blanca forzada encima, y esa contradicción obligó
          a inventar una escala `slate-*` paralela (`surface="on-light"`) para
          que los campos no salieran oscuros sobre blanco. */}
      <div className="flex-1 flex items-center justify-center p-6 bg-[var(--bg-base)]">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}
