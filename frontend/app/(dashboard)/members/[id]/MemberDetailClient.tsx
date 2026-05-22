"use client";
import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { apiClient } from "@/lib/api";
import { GlassCard } from "@/components/common/GlassCard";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";

type Tab = "info" | "memberships" | "payments" | "checkins";

const TAB_LABELS: Record<Tab, string> = {
  info: "Info",
  memberships: "Membresías",
  payments: "Pagos",
  checkins: "Check-ins",
};

export default function MemberDetailClient({ memberId }: { memberId: string }) {
  const { data: session } = useSession();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("info");
  const [member, setMember] = useState<any>(null); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [payments, setPayments] = useState<any[]>([]); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [checkins, setCheckins] = useState<any[]>([]); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [memberships, setMemberships] = useState<any[]>([]); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<any[]>([]); // eslint-disable-line @typescript-eslint/no-explicit-any
  const [selectedPlan, setSelectedPlan] = useState("");
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (!session?.accessToken) return;
    const client = apiClient(session.accessToken as string);
    Promise.all([
      client.get(`/api/v1/members/${memberId}`),
      client.get(`/api/v1/members/${memberId}/payments`),
      client.get(`/api/v1/members/${memberId}/checkins`),
      client.get(`/api/v1/members/${memberId}/memberships`),
    ]).then(([m, p, c, ms]) => {
      setMember(m.data);
      setPayments(p.data);
      setCheckins(c.data);
      setMemberships(ms.data);
      setLoading(false);
    }).catch(() => setLoading(false));
    client.get("/api/v1/member-plans").then(r => setPlans(r.data)).catch(() => {});
  }, [session?.accessToken, memberId]);

  const handleAssign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.accessToken || !selectedPlan) return;
    setAssigning(true);
    try {
      const client = apiClient(session.accessToken as string);
      await client.post("/api/v1/member-plans/assign", {
        member_id: memberId,
        plan_id: selectedPlan,
        start_date: startDate,
      });
      toast.success("Membresía asignada");
      setSelectedPlan("");
      // Refresh memberships list
      const ms = await client.get(`/api/v1/members/${memberId}/memberships`);
      setMemberships(ms.data);
    } catch (err: any) { // eslint-disable-line @typescript-eslint/no-explicit-any
      const detail = err.response?.data?.detail;
      toast.error(typeof detail === "string" ? detail : "Error asignando membresía");
    } finally {
      setAssigning(false);
    }
  };

  if (loading) return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="h-12 bg-white/5 rounded animate-pulse" />
      ))}
    </div>
  );

  if (!member) return <p className="text-muted p-8">Miembro no encontrado</p>;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button variant="ghost" onClick={() => router.back()} className="text-muted">
          <ArrowLeft className="h-4 w-4 mr-2" /> Volver
        </Button>
        <div className="flex-1">
          <h2 className="text-2xl font-bold text-white font-display">{member.full_name}</h2>
          <p className="text-muted text-sm">{member.email}</p>
        </div>
        <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
          member.status === "active" ? "bg-success/20 text-success" : "bg-danger/20 text-danger"
        }`}>
          {member.status === "active" ? "Activo" : "Inactivo"}
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border-dark">
        {(Object.keys(TAB_LABELS) as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? "border-primary text-white"
                : "border-transparent text-muted hover:text-white"
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <GlassCard className="p-5">
        {tab === "info" && (
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            {([
              ["Teléfono", member.phone],
              ["Documento", member.id_number],
              ["Fecha nacimiento", member.birth_date],
              ["Miembro desde", new Date(member.created_at).toLocaleDateString("es-CO")],
            ] as [string, string | null][]).map(([label, value]) => (
              <div key={label}>
                <dt className="text-muted text-xs mb-1">{label}</dt>
                <dd className="text-white">{value || "—"}</dd>
              </div>
            ))}
            {member.notes && (
              <div className="col-span-2">
                <dt className="text-muted text-xs mb-1">Notas</dt>
                <dd className="text-white">{member.notes}</dd>
              </div>
            )}
          </dl>
        )}

        {tab === "memberships" && (
          <div className="space-y-3">
            {memberships.length === 0
              ? <p className="text-muted text-sm">Sin membresías registradas</p>
              : memberships.map((m: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                <div key={m.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg">
                  <div>
                    <p className="text-white font-medium">{m.plan_name}</p>
                    <p className="text-muted text-xs">{m.start_date} → {m.end_date}</p>
                  </div>
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    m.status === "active" ? "bg-success/20 text-success" : "bg-warning/20 text-warning"
                  }`}>
                    {m.status}
                  </span>
                </div>
              ))
            }
            <div className="mt-4 pt-4 border-t border-border-dark">
              <p className="text-muted text-xs mb-3 font-medium uppercase tracking-wide">Asignar membresía</p>
              <form onSubmit={handleAssign} className="flex gap-3 flex-wrap items-end">
                <div className="flex-1 min-w-48">
                  <select
                    value={selectedPlan}
                    onChange={e => setSelectedPlan(e.target.value)}
                    className="w-full h-9 rounded-md border border-border-dark bg-bg-deep px-3 text-sm text-white"
                    required
                  >
                    <option value="">Seleccionar plan...</option>
                    {plans.map((p: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                      <option key={p.id} value={p.id}>
                        {p.name} — ${Number(p.price).toLocaleString()} / {p.duration_days}d
                      </option>
                    ))}
                  </select>
                </div>
                <input
                  type="date"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="h-9 rounded-md border border-border-dark bg-bg-deep px-3 text-sm text-white"
                  required
                />
                <Button type="submit" disabled={assigning} className="bg-primary text-bg-deep font-semibold">
                  {assigning ? "Asignando..." : "Asignar"}
                </Button>
              </form>
            </div>
          </div>
        )}

        {tab === "payments" && (
          <div className="space-y-2">
            {payments.length === 0
              ? <p className="text-muted text-sm">Sin pagos registrados</p>
              : payments.map((p: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                <div key={p.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg text-sm">
                  <span className="text-white flex-1">{p.concept}</span>
                  <span className="text-white font-medium mx-4">${Number(p.amount).toLocaleString("es-CO")}</span>
                  <span className="text-muted">{new Date(p.created_at).toLocaleDateString("es-CO")}</span>
                </div>
              ))
            }
          </div>
        )}

        {tab === "checkins" && (
          <div className="space-y-2">
            {checkins.length === 0
              ? <p className="text-muted text-sm">Sin check-ins registrados</p>
              : checkins.map((c: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                <div key={c.id} className="flex items-center justify-between p-3 bg-white/5 rounded-lg text-sm">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    c.type === "entry" ? "bg-success/20 text-success" : "bg-danger/20 text-danger"
                  }`}>
                    {c.type === "entry" ? "Entrada" : "Salida"}
                  </span>
                  <span className="text-muted">{new Date(c.created_at).toLocaleString("es-CO")}</span>
                </div>
              ))
            }
          </div>
        )}
      </GlassCard>
    </div>
  );
}
