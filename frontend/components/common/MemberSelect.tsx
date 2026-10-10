"use client";
import { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { apiClient } from "@/lib/api";
import { Input } from "@/components/ui/input";

interface Member {
  id: string;
  full_name: string;
  email: string;
}

interface Props {
  value: string;
  onChange: (id: string) => void;
}

export default function MemberSelect({ value, onChange }: Props) {
  const { data: session } = useSession();
  const [query, setQuery] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [open, setOpen] = useState(false);
  // El nombre va atado al id: si el socio cambia desde fuera, no queda el nombre del anterior.
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    if (!session?.accessToken || query.length < 1) {
      setMembers([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const client = apiClient(session.accessToken as string);
        const res = await client.get("/api/v1/members", {
          params: { q: query, status: "active" },
        });
        setMembers(res.data.slice(0, 10));
      } catch {
        setMembers([]);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, session?.accessToken]);

  // Llega elegido desde fuera (p. ej. «Cobrar» en la ficha): se muestra su nombre, no el id.
  useEffect(() => {
    if (!session?.accessToken || !value || selected?.id === value) return;
    let alive = true;
    apiClient(session.accessToken as string)
      .get<Member>(`/api/v1/members/${value}`)
      .then((res) => alive && setSelected({ id: value, name: res.data.full_name }))
      .catch(() => alive && setSelected({ id: value, name: "Socio elegido" }));
    return () => {
      alive = false;
    };
  }, [value, selected?.id, session?.accessToken]);

  const handleSelect = (member: Member) => {
    onChange(member.id);
    setSelected({ id: member.id, name: member.full_name });
    setOpen(false);
    setQuery("");
  };

  const displayValue = value ? (selected?.id === value ? selected.name : "Cargando socio…") : "";

  return (
    <div className="relative">
      <Input
        value={open ? query : displayValue}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelected(null);
          onChange("");
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Buscar miembro por nombre..."
        className="bg-[var(--bg-input)] border-[var(--border-base)] text-[var(--text-base)] placeholder:text-[var(--text-muted)]"
      />
      {open && members.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-[var(--bg-card)] border border-[var(--border-base)] rounded-lg shadow-card-hover max-h-48 overflow-y-auto">
          {members.map((m) => (
            <button
              key={m.id}
              type="button"
              className="w-full text-left px-3 py-2 text-sm text-[var(--text-base)] hover:bg-[var(--bg-muted)] flex flex-col transition-colors"
              onMouseDown={(e) => {
                e.preventDefault();
                handleSelect(m);
              }}
            >
              <span className="font-medium">{m.full_name}</span>
              <span className="text-[var(--text-muted)] text-xs">{m.email}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
