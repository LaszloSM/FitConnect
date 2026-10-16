"use client";

import { useEffect, useState } from "react";
import { Notice } from "@/components/StatusPill";
import { api } from "@/lib/api";
import { money } from "@/lib/format";
import type { TenantDetail } from "@/lib/types";

/** Datos del gimnasio y precio acordado. El correo del dueño no se cambia aquí:
 *  vive en tres sitios (maestra, directorio y su gimnasio) y lo cambia él con código. */
export function GymDataCard({ tenant, onSaved }: { tenant: TenantDetail; onSaved: () => void }) {
  const [form, setForm] = useState({ name: "", city: "", phone: "", address: "", price: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [ok, setOk] = useState("");

  useEffect(() => {
    setForm({
      name: tenant.name,
      city: tenant.city ?? "",
      phone: tenant.phone ?? "",
      address: tenant.address ?? "",
      price: tenant.price_cop != null ? String(tenant.price_cop) : "",
    });
  }, [tenant]);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: k === "price" ? e.target.value.replace(/\D/g, "") : e.target.value }));

  const save = async () => {
    setBusy(true);
    setError("");
    setOk("");
    try {
      await api(`/tenants/${tenant.id}`, {
        method: "PATCH",
        body: {
          name: form.name,
          city: form.city,
          phone: form.phone,
          address: form.address,
          price_cop: form.price === "" ? null : Number(form.price),
        },
      });
      setOk("Datos guardados.");
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card space-y-3 p-5">
      <h2 className="text-base font-semibold">Datos del gimnasio</h2>
      {error && <Notice tone="danger">{error}</Notice>}
      {ok && <Notice tone="ok">{ok}</Notice>}
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm sm:col-span-2">
          <span className="text-ink-muted">Nombre</span>
          <input className="field w-full" value={form.name} onChange={set("name")} maxLength={255} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-ink-muted">Ciudad</span>
          <input className="field w-full" value={form.city} onChange={set("city")} maxLength={100} />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-ink-muted">Teléfono</span>
          <input className="field w-full" value={form.phone} onChange={set("phone")} maxLength={50} />
        </label>
        <label className="space-y-1 text-sm sm:col-span-2">
          <span className="text-ink-muted">Dirección</span>
          <input className="field w-full" value={form.address} onChange={set("address")} maxLength={500} />
        </label>
        <label className="space-y-1 text-sm sm:col-span-2">
          <span className="text-ink-muted">Precio mensual acordado (COP)</span>
          <input
            className="field num w-full"
            inputMode="numeric"
            placeholder={`Vacío = precio de lista (${money(tenant.list_price)})`}
            value={form.price}
            onChange={set("price")}
          />
        </label>
      </div>
      <div className="flex justify-end">
        <button type="button" className="btn btn-primary" disabled={busy || form.name.trim().length < 2} onClick={save}>
          Guardar datos
        </button>
      </div>
    </div>
  );
}
