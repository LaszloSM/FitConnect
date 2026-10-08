"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { Button } from "@/components/ui/button";
import { AuthCardHeader } from "@/components/common/AuthCardHeader";
import { TwoStepSetup } from "@/components/security/TwoStepSetup";

/**
 * Dueños y administradores no entran al panel sin la verificación en dos pasos:
 * su sesión solo sirve para configurarla hasta que la activen.
 */
export default function TwoStepRequiredPage() {
  const router = useRouter();
  const { data: session, update } = useSession();
  const [ready, setReady] = useState(false);

  return (
    <div>
      <AuthCardHeader
        title="Protege tu cuenta"
        subtitle="Tu cuenta maneja la plata y los datos de los socios: activa la verificación en dos pasos para continuar."
      />
      <TwoStepSetup
        onEnabled={async (s) => {
          await update({ accessToken: s.access_token, permissions: s.permissions });
          setReady(true);
        }}
      />
      {ready ? (
        <Button
          size="lg"
          className="mt-6 w-full"
          onClick={() => router.push(session?.role === "trainer" ? "/entrenador" : "/dashboard")}
        >
          Ya guardé los códigos, continuar
        </Button>
      ) : (
        <button
          type="button"
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="mt-8 text-sm text-ink-muted hover:text-ink"
        >
          Salir
        </button>
      )}
    </div>
  );
}
