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
  const [selectedName, setSelectedName] = useState("");

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

  const handleSelect = (member: Member) => {
    onChange(member.id);
    setSelectedName(member.full_name);
    setOpen(false);
    setQuery("");
  };

  const displayValue = selectedName || (value ? `(${value.slice(0, 8)}...)` : "");

  return (
    <div className="relative">
      <Input
        value={open ? query : displayValue}
        onChange={(e) => {
          setQuery(e.target.value);
          setSelectedName("");
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
