"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { apiClient } from "@/lib/api";
import { parseApiError } from "@/lib/errors";
import { P, useCan } from "@/lib/permissions";
import { DoorOpenIcon as DoorOpen, SpinnerGapIcon as Loader2 } from "@phosphor-icons/react";

interface Device {
  id: string;
  name: string;
  connected: boolean;
}

/** Plan B de recepción: abrir el torniquete (queda en auditoría). */
export function OpenTurnstileButton() {
  const { data: session } = useSession();
  const token = session?.accessToken as string | undefined;
  const { can } = useCan();
  const allowed = can(P.ACCESS_OVERRIDE);
  const [devices, setDevices] = useState<Device[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!token || !allowed) return;
    apiClient(token)
      .get<Device[]>("/api/v1/access/devices")
      .then((r) => setDevices(r.data.filter((d) => d.connected)))
      .catch(() => setDevices([]));
  }, [token, allowed]);

  if (!allowed || devices.length === 0) return null;

  const open = async (device: Device) => {
    if (!token) return;
    setBusy(true);
    try {
      await apiClient(token).post(`/api/v1/access/devices/${device.id}/open`, { reason: "Apertura desde el Mostrador" });
      toast.success(`Abriendo ${device.name}`);
    } catch (err) {
      toast.error(parseApiError(err, "No se pudo abrir"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {devices.map((d) => (
        <Button key={d.id} type="button" variant="outline" disabled={busy} onClick={() => open(d)}>
          {busy ? <Loader2 className="animate-spin" /> : <DoorOpen />}
          {devices.length > 1 ? `Abrir ${d.name}` : "Abrir torniquete"}
        </Button>
      ))}
    </>
  );
}
