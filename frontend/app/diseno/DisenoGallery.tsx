"use client";

import { useTheme } from "next-themes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import { KpiCard } from "@/components/ui/kpi-card";
import { GlassCard } from "@/components/common/GlassCard";

const SWATCHES = [
  ["Fondo", "--bg-base"],
  ["Tarjeta", "--bg-card"],
  ["Menú", "--bg-sidebar"],
  ["Apagado", "--bg-muted"],
  ["Línea", "--border-base"],
  ["Tinta", "--text-base"],
  ["Coral", "--brand"],
  ["Coral suave", "--brand-muted"],
  ["Atención", "--bg-attention"],
] as const;

export function DisenoGallery() {
  const { resolvedTheme, setTheme } = useTheme();

  return (
    <main className="mx-auto flex max-w-[1200px] flex-col gap-10 px-8 py-10">
      <header className="flex items-end justify-between gap-6">
        <div>
          <p className="text-sm font-semibold text-ink-muted">Galería de desarrollo</p>
          <h1 className="text-[40px] font-bold leading-none">Sistema Calor</h1>
        </div>
        <Button variant="outline" onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}>
          Cambiar a {resolvedTheme === "dark" ? "claro" : "oscuro"}
        </Button>
      </header>

      <section className="grid grid-cols-3 gap-4 sm:grid-cols-5 lg:grid-cols-9">
        {SWATCHES.map(([label, token]) => (
          <div key={token}>
            <div className="h-16 rounded-[var(--radius-md)] shadow-[0_0_0_1px_var(--border-base)]" style={{ background: `var(${token})` }} />
            <p className="mt-1.5 text-xs font-semibold">{label}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <GlassCard className="flex flex-col gap-4 p-6">
          <h2 className="text-base font-semibold">Tipografía</h2>
          <p className="font-display text-[44px] font-bold leading-none tracking-[-0.02em]">Bricolage Grotesque</p>
          <p className="num text-[34px]">$1.170.000 · 41 · 18:42</p>
          <p className="max-w-[60ch] text-base">
            Figtree para leer: etiquetas, tablas y formularios. Las cifras usan la display con dígitos tabulares.
          </p>
        </GlassCard>

        <GlassCard className="flex flex-col gap-4 p-6">
          <h2 className="text-base font-semibold">Botones</h2>
          <div className="flex flex-wrap gap-2.5">
            <Button>Cobrar</Button>
            <Button variant="outline">Nuevo socio</Button>
            <Button variant="secondary">Secundario</Button>
            <Button variant="ghost">Fantasma</Button>
            <Button variant="destructive">Anular pago</Button>
            <Button variant="link">Ver todo</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <Button size="lg">Cobrar renovación</Button>
            <Button size="sm" variant="outline">Pequeño</Button>
            <Button isLoading>Guardando</Button>
            <Button disabled>Deshabilitado</Button>
          </div>
        </GlassCard>

        <GlassCard className="flex flex-col gap-4 p-6">
          <h2 className="text-base font-semibold">Campos</h2>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold">Cédula</span>
            <Input placeholder="1098412337" />
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-semibold">Teléfono</span>
            <Input aria-invalid defaultValue="300 12" />
            <span className="text-xs font-medium text-[var(--signal-danger)]">Faltan 5 dígitos</span>
          </label>
          <Input disabled defaultValue="Campo deshabilitado" />
        </GlassCard>

        <GlassCard className="flex flex-col gap-4 p-6">
          <h2 className="text-base font-semibold">Estados</h2>
          <div className="flex flex-wrap gap-2">
            <StatusBadge status="active" label="Al día" />
            <StatusBadge status="in_grace" label="Vence en 3 días" />
            <StatusBadge status="expired" />
            <StatusBadge status="frozen" />
            <StatusBadge status="cancelled" />
            <StatusBadge status="denied" />
          </div>
        </GlassCard>
      </section>

      <section className="grid gap-6 sm:grid-cols-3">
        <KpiCard label="Caja de hoy" value={460000} prefix="$" delta={7} deltaLabel="vs. jueves pasado" sparkline={[350, 180, 60, 520, 340, 390, 460]} />
        <KpiCard label="Socios activos" value={163} caption="de 353" delta={-3} />
        <KpiCard label="Por cobrar" value="—" failed />
      </section>

      <section className="rounded-[var(--radius-lg)] bg-attention p-6">
        <h2 className="text-base font-semibold">Ingreso en riesgo</h2>
        <p className="num mt-2 text-[32px]">$2.790.000</p>
        <p className="text-sm text-ink-muted">31 socios con señales de irse.</p>
      </section>
    </main>
  );
}
