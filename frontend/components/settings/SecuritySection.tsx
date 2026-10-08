"use client";

import { GlassCard } from "@/components/common/GlassCard";
import { TwoStepSetup } from "@/components/security/TwoStepSetup";

export default function SecuritySection() {
  return (
    <GlassCard className="space-y-4 p-6">
      <div>
        <h3 className="text-base font-semibold text-ink">Verificación en dos pasos</h3>
        <p className="text-sm text-ink-muted">Un código del celular además de la contraseña cada vez que entras.</p>
      </div>
      <TwoStepSetup />
    </GlassCard>
  );
}
