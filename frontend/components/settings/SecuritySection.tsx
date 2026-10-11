"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { GlassCard } from "@/components/common/GlassCard";
import { TwoStepMethods } from "@/components/security/TwoStepMethods";
import { EmailChange, PasswordChange, SessionsCard } from "@/components/security/AccountSecurity";
import { apiClient } from "@/lib/api";

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <GlassCard className="space-y-4 p-6">
      <div>
        <h3 className="text-base font-semibold text-ink">{title}</h3>
        {subtitle && <p className="text-sm text-ink-muted">{subtitle}</p>}
      </div>
      {children}
    </GlassCard>
  );
}

/** Ajustes › Seguridad: dos pasos, contraseña, correo de acceso y sesiones. */
export default function SecuritySection() {
  const { data: session } = useSession();
  const token = session?.accessToken;
  const [info, setInfo] = useState<{ email: string; totp: boolean } | null>(null);

  const load = useCallback(() => {
    if (!token) return;
    apiClient(token)
      .get("/api/v1/auth/mfa/status")
      .then((r) => setInfo({ email: r.data.email, totp: Boolean(r.data.methods?.totp) }))
      .catch(() => setInfo(null));
  }, [token]);

  useEffect(load, [load]);

  return (
    <div className="space-y-6">
      <Card
        title="Verificación en dos pasos"
        subtitle="Además de tu contraseña, al entrar te pedimos una prueba de que eres tú. Elige uno o varios métodos."
      >
        <TwoStepMethods onChange={load} />
      </Card>
      <Card title="Contraseña">
        <PasswordChange hasTotp={Boolean(info?.totp)} />
      </Card>
      {info && (
        <Card title="Correo de acceso">
          <EmailChange email={info.email} onChanged={(email) => setInfo((i) => (i ? { ...i, email } : i))} />
        </Card>
      )}
      <Card title="Sesiones abiertas">
        <SessionsCard />
      </Card>
    </div>
  );
}
