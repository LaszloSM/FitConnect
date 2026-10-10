"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import {
  CheckCircleIcon as Ok,
  DesktopIcon as Desktop,
  WarningCircleIcon as Missing,
  XIcon as Close,
} from "@phosphor-icons/react";
import { Button } from "@/components/ui/button";
import { loadSnapshot } from "@/lib/offline/sync";
import { useInstall } from "@/lib/offline/install";
import { formatDateTime } from "@/lib/format";

interface Check {
  ok: boolean;
  label: string;
  fix: string;
}

const STALE_MS = 30 * 60_000;

function useChecks() {
  const { status } = useSession();
  const { installed } = useInstall();
  const [worker, setWorker] = useState<boolean | null>(null);
  const [copyAt, setCopyAt] = useState<string | null | undefined>(undefined);
  const [members, setMembers] = useState(0);

  useEffect(() => {
    const read = () => {
      setWorker(Boolean(navigator.serviceWorker?.controller));
      void loadSnapshot().then((s) => {
        setCopyAt(s?.generated_at ?? null);
        setMembers(s?.members.length ?? 0);
      });
    };
    read();
    const timer = setInterval(read, 15_000);
    navigator.serviceWorker?.addEventListener?.("controllerchange", read);
    return () => {
      clearInterval(timer);
      navigator.serviceWorker?.removeEventListener?.("controllerchange", read);
    };
  }, []);

  const fresh = Boolean(copyAt && Date.now() - new Date(copyAt).getTime() < STALE_MS);
  const checks: Check[] = [
    {
      ok: Boolean(worker),
      label: "Este navegador guarda el Mostrador para abrirlo sin internet",
      fix: "Recarga la página una vez con internet. Si sigue igual, usa Chrome o Edge.",
    },
    {
      ok: fresh,
      label: copyAt
        ? `Copia de ${members} socios guardada el ${formatDateTime(copyAt)}`
        : "Copia de los socios en este equipo",
      fix: "Deja abierto el Mostrador con internet: la copia se actualiza sola cada 5 minutos.",
    },
    {
      ok: status === "authenticated",
      label: "Sesión abierta",
      fix: "Sin internet no se puede iniciar sesión: deja la sesión de recepción abierta durante la jornada.",
    },
    {
      ok: installed,
      label: "LSMFit instalada como aplicación en este computador",
      fix: "Recomendado: instálala para abrirla con un ícono, aunque no haya internet.",
    },
  ];
  return { checks, loading: worker === null || copyAt === undefined };
}

export function InstallButton({ size = "sm" }: { size?: "sm" | "default" }) {
  const { canPrompt, installed, install } = useInstall();
  const [help, setHelp] = useState(false);
  if (installed) return null;
  if (!canPrompt) {
    return (
      <div className="space-y-2">
        <Button type="button" size={size} variant="outline" onClick={() => setHelp((v) => !v)}>
          <Desktop /> Cómo instalar LSMFit en este computador
        </Button>
        {help && (
          <ol className="list-decimal space-y-1 pl-5 text-sm text-ink-muted">
            <li>Abre LSMFit en <strong className="text-ink">Google Chrome</strong> o <strong className="text-ink">Microsoft Edge</strong>.</li>
            <li>En la barra de direcciones, toca el ícono de <strong className="text-ink">Instalar</strong> (un monitor con una flecha).</li>
            <li>Confirma. Queda un ícono de LSMFit en el escritorio que abre el Mostrador, con o sin internet.</li>
          </ol>
        )}
      </div>
    );
  }
  return (
    <Button
      type="button"
      size={size}
      onClick={async () => {
        if (await install()) toast.success("Listo: LSMFit quedó instalada en este computador");
      }}
    >
      <Desktop /> Instalar LSMFit en este computador
    </Button>
  );
}

/**
 * ¿Este equipo puede seguir operando si se cae el internet? Revisa lo que hace
 * falta de verdad (copia de socios, sesión, navegador) y dice qué hacer si no.
 */
export function OfflineReadiness() {
  const { checks, loading } = useChecks();
  if (loading) return <div className="skeleton h-40 rounded-[var(--radius-lg)]" />;
  const ready = checks.slice(0, 3).every((c) => c.ok);
  return (
    <div className="space-y-4">
      <p className={`text-sm font-semibold ${ready ? "text-[var(--signal-ok)]" : "text-ink"}`}>
        {ready ? "Este equipo está listo para trabajar sin internet." : "A este equipo le falta algo para trabajar sin internet."}
      </p>
      <ul className="space-y-2.5">
        {checks.map((c) => (
          <li key={c.label} className="flex gap-2.5 text-sm">
            {c.ok ? (
              <Ok className="mt-0.5 size-4 shrink-0 text-[var(--signal-ok)]" weight="fill" aria-hidden />
            ) : (
              <Missing className="mt-0.5 size-4 shrink-0 text-[var(--signal-warn)]" weight="fill" aria-hidden />
            )}
            <span>
              <span className="text-ink">{c.label}</span>
              {!c.ok && <span className="block text-ink-muted">{c.fix}</span>}
            </span>
          </li>
        ))}
      </ul>
      <InstallButton />
      <p className="text-xs text-ink-muted">
        Sin internet puedes buscar socios, registrar entradas y cobrar en efectivo; todo sube solo al volver la red.
        Sin luz el computador no funciona: el torniquete sigue dejando entrar si tiene una UPS.
      </p>
    </div>
  );
}

/** Aviso corto en el Mostrador solo si a este equipo le falta algo. */
export function OfflineReadinessNotice() {
  const { checks, loading } = useChecks();
  const [hidden, setHidden] = useState(false);
  useEffect(() => {
    try {
      setHidden(sessionStorage.getItem("lsmfit:offline-notice") === "1");
    } catch {
      // sin almacenamiento: se muestra
    }
  }, []);
  const missing = checks.slice(0, 3).filter((c) => !c.ok);
  if (loading || hidden || missing.length === 0 || process.env.NODE_ENV !== "production") return null;
  return (
    <div className="flex flex-wrap items-start gap-3 rounded-[var(--radius-lg)] border border-[var(--signal-warn-line)] bg-[var(--signal-warn-bg)] px-4 py-3 text-sm">
      <Missing className="mt-0.5 size-4 shrink-0 text-[var(--signal-warn)]" weight="fill" aria-hidden />
      <p className="min-w-[220px] flex-1 text-ink">
        <strong className="font-semibold">Si se cae el internet, este equipo aún no está listo.</strong>{" "}
        <span className="text-ink-muted">{missing[0].fix}</span>
      </p>
      <button
        type="button"
        aria-label="Ocultar aviso"
        onClick={() => {
          try {
            sessionStorage.setItem("lsmfit:offline-notice", "1");
          } catch {
            // ignorado
          }
          setHidden(true);
        }}
        className="rounded-[var(--radius-sm)] p-1 text-ink-muted hover:bg-muted hover:text-ink"
      >
        <Close className="size-4" />
      </button>
    </div>
  );
}
