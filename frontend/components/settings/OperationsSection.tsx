"use client";
/* eslint-disable @typescript-eslint/no-explicit-any */

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { GlassCard } from "@/components/common/GlassCard";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { apiClient } from "@/lib/api";
import type { Location } from "@/lib/types";
import { Lock, MapPin, Plus, Trash2, Loader2 } from "lucide-react";

const inputCls =
  "bg-[var(--bg-base)] border-[var(--border-base)] text-[var(--text-base)] placeholder:text-[var(--text-muted)]";

export default function OperationsSection() {
  const { data: session } = useSession();
  const [graceDays, setGraceDays] = useState<number>(3);
  const [receiptPrefix, setReceiptPrefix] = useState("FC");
  const [cashShiftsEnabled, setCashShiftsEnabled] = useState(true);
  const [savingOps, setSavingOps] = useState(false);
  const [locations, setLocations] = useState<Location[]>([]);
  const [showNewLocation, setShowNewLocation] = useState(false);
  const [newLocation, setNewLocation] = useState({ name: "", address: "", phone: "", max_capacity: "100" });
  const [savingLocation, setSavingLocation] = useState(false);

  const isOwner = (session as any)?.role === "owner" || (session?.user as any)?.role === "owner";

  useEffect(() => {
    if (!session?.accessToken) return;
    const client = apiClient(session.accessToken as string);
    Promise.all([
      client.get("/api/v1/settings/operations"),
      client.get("/api/v1/locations"),
    ]).then(([ops, locs]) => {
      setGraceDays(ops.data.grace_days);
      setReceiptPrefix(ops.data.receipt_prefix);
      setCashShiftsEnabled(ops.data.cash_shifts_enabled ?? true);
      setLocations(locs.data);
    }).catch(() => toast.error("Error cargando configuración"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  const handleSaveOps = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.accessToken) return;
    setSavingOps(true);
    try {
      const client = apiClient(session.accessToken as string);
      await client.patch("/api/v1/settings/operations", {
        grace_days: graceDays,
        receipt_prefix: receiptPrefix || undefined,
        cash_shifts_enabled: cashShiftsEnabled,
      });
      toast.success("Configuración operativa guardada");
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Error guardando configuración");
    } finally {
      setSavingOps(false);
    }
  };

  const handleCreateLocation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.accessToken) return;
    setSavingLocation(true);
    try {
      const client = apiClient(session.accessToken as string);
      const res = await client.post("/api/v1/locations", {
        name: newLocation.name,
        address: newLocation.address,
        phone: newLocation.phone || null,
        max_capacity: Number(newLocation.max_capacity) || 100,
      });
      setLocations([...locations, res.data]);
      setNewLocation({ name: "", address: "", phone: "", max_capacity: "100" });
      setShowNewLocation(false);
      toast.success("Sede creada");
    } catch (err: any) {
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Error creando sede");
    } finally {
      setSavingLocation(false);
    }
  };

  const handleDeactivateLocation = async (id: string, name: string) => {
    if (!session?.accessToken) return;
    if (!window.confirm(`¿Desactivar la sede "${name}"?`)) return;
    try {
      const client = apiClient(session.accessToken as string);
      await client.delete(`/api/v1/locations/${id}`);
      setLocations(locations.filter((l) => l.id !== id));
      toast.success("Sede desactivada");
    } catch {
      toast.error("Error desactivando sede");
    }
  };

  return (
    <GlassCard className="p-6 space-y-8">
      {!isOwner && (
        <div className="flex items-center gap-2 px-3 py-2.5 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/40 rounded-lg">
          <Lock className="h-4 w-4 text-amber-500 shrink-0" aria-hidden="true" />
          <p className="text-sm text-amber-700 dark:text-amber-400">
            Solo el propietario puede editar la configuración operativa.
          </p>
        </div>
      )}

      <form onSubmit={handleSaveOps} className="space-y-4">
        <div>
          <h3 className="text-sm font-semibold text-[var(--text-base)]">Reglas de operación</h3>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Cómo se comporta el gym con membresías vencidas y recibos
          </p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-[var(--text-muted)] text-sm">Días de gracia tras vencimiento</Label>
            <Input
              type="number"
              min={0}
              max={30}
              value={graceDays}
              onChange={(e) => setGraceDays(Number(e.target.value))}
              disabled={!isOwner}
              className={inputCls}
            />
            <p className="text-[11px] text-[var(--text-muted)]">
              El miembro vencido puede entrar durante estos días, con aviso en recepción.
            </p>
          </div>
          <div className="space-y-2">
            <Label className="text-[var(--text-muted)] text-sm">Prefijo de recibos</Label>
            <Input
              value={receiptPrefix}
              onChange={(e) => setReceiptPrefix(e.target.value.toUpperCase())}
              maxLength={10}
              disabled={!isOwner}
              className={inputCls}
            />
          </div>
        </div>

        <div className="flex items-start justify-between gap-4 rounded-lg border border-[var(--border-base)] bg-[var(--bg-base)] p-4">
          <div>
            <p className="text-sm font-medium text-[var(--text-base)]">Manejar turnos de caja</p>
            <p className="text-xs text-[var(--text-muted)] mt-0.5 max-w-md">
              Con turnos, el efectivo exige abrir y cerrar caja (arqueo por empleado). Si atiendes
              tú solo, apágalo y cobra en efectivo directamente.
            </p>
          </div>
          <Switch
            checked={cashShiftsEnabled}
            onCheckedChange={(v: boolean) => setCashShiftsEnabled(v)}
            disabled={!isOwner}
          />
        </div>

        {isOwner && (
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={savingOps}
              className="bg-[var(--color-primary)] text-[var(--color-primary-contrast)] font-semibold hover:bg-[var(--color-primary-hover)]"
            >
              {savingOps ? "Guardando..." : "Guardar cambios"}
            </Button>
          </div>
        )}
      </form>

      <div className="pt-6 border-t border-[var(--border-base)] space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-[var(--text-base)]">Sedes</h3>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Ubicaciones del gym — check-ins, clases y máquinas se asocian a una sede
            </p>
          </div>
          {isOwner && (
            <Button
              type="button"
              onClick={() => setShowNewLocation(!showNewLocation)}
              className="bg-[var(--color-primary)] text-[var(--color-primary-contrast)] font-semibold hover:bg-[var(--color-primary-hover)] h-8 text-xs"
            >
              <Plus className="h-3.5 w-3.5 mr-1" /> Nueva sede
            </Button>
          )}
        </div>

        {showNewLocation && (
          <form
            onSubmit={handleCreateLocation}
            className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-4 rounded-lg border border-[var(--border-base)] bg-[var(--bg-base)]"
          >
            <div className="space-y-1">
              <Label className="text-[var(--text-muted)] text-xs">Nombre</Label>
              <Input
                value={newLocation.name}
                onChange={(e) => setNewLocation({ ...newLocation, name: e.target.value })}
                required
                className={inputCls}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[var(--text-muted)] text-xs">Dirección</Label>
              <Input
                value={newLocation.address}
                onChange={(e) => setNewLocation({ ...newLocation, address: e.target.value })}
                required
                className={inputCls}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[var(--text-muted)] text-xs">Teléfono</Label>
              <Input
                value={newLocation.phone}
                onChange={(e) => setNewLocation({ ...newLocation, phone: e.target.value })}
                className={inputCls}
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[var(--text-muted)] text-xs">Aforo máximo</Label>
              <Input
                type="number"
                min={1}
                value={newLocation.max_capacity}
                onChange={(e) => setNewLocation({ ...newLocation, max_capacity: e.target.value })}
                className={inputCls}
              />
            </div>
            <div className="sm:col-span-2 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setShowNewLocation(false)} className="text-[var(--text-muted)]">
                Cancelar
              </Button>
              <Button
                type="submit"
                disabled={savingLocation}
                className="bg-[var(--color-primary)] text-[var(--color-primary-contrast)] font-semibold hover:bg-[var(--color-primary-hover)]"
              >
                {savingLocation ? <Loader2 className="h-4 w-4 animate-spin" /> : "Crear sede"}
              </Button>
            </div>
          </form>
        )}

        {locations.length === 0 ? (
          <p className="text-[var(--text-muted)] text-sm py-3 text-center">
            Sin sedes registradas — el gym opera como sede única.
          </p>
        ) : (
          <div className="space-y-2">
            {locations.map((loc) => (
              <div
                key={loc.id}
                className="flex items-center gap-3 p-3 rounded-lg border border-[var(--border-base)] bg-[var(--bg-base)]"
              >
                <MapPin className="h-4 w-4 text-[var(--text-muted)] shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--text-base)] truncate">{loc.name}</p>
                  <p className="text-[11px] text-[var(--text-muted)] truncate">
                    {loc.address} · Aforo {loc.max_capacity}
                  </p>
                </div>
                {isOwner && (
                  <button
                    type="button"
                    onClick={() => handleDeactivateLocation(loc.id, loc.name)}
                    title="Desactivar sede"
                    className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </GlassCard>
  );
}
