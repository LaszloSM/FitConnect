"use client";

import axios from "axios";
import { apiClient } from "@/lib/api";
import {
  enqueue, listQueue, loadSnapshot, notify, removeItem, saveSnapshot, subscribe, updateItem,
  type QueueItem, type QueuedCheckin, type QueuedRequest, type Snapshot, type SnapshotMember,
} from "./store";

const API = process.env.NEXT_PUBLIC_API_URL ?? "";
const SNAPSHOT_AT = "fc-offline-snapshot-at";

export interface OfflineState {
  online: boolean;
  syncing: boolean;
  pending: number;
  review: QueueItem[];
  snapshotAt: string | null;
}

let state: OfflineState = { online: true, syncing: false, pending: 0, review: [], snapshotAt: null };
const listeners = new Set<(s: OfflineState) => void>();

function set(patch: Partial<OfflineState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}

export function getState(): OfflineState {
  return state;
}

export function onState(fn: (s: OfflineState) => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export async function refreshCounts(): Promise<void> {
  const items = await listQueue().catch(() => []);
  let snapshotAt: string | null = null;
  try {
    snapshotAt = localStorage.getItem(SNAPSHOT_AT);
  } catch {
    snapshotAt = null;
  }
  set({
    pending: items.filter((i) => i.status === "pending").length,
    review: items.filter((i) => i.status === "review"),
    snapshotAt,
  });
}

if (typeof window !== "undefined") subscribe(() => void refreshCounts());

/** ¿Hay red y el servidor responde? `navigator.onLine` solo dice si hay cable/wifi. */
export async function checkConnection(): Promise<boolean> {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    set({ online: false });
    return false;
  }
  try {
    await axios.get(`${API}/health`, { timeout: 5000 });
    set({ online: true });
    return true;
  } catch (err) {
    // El servidor respondió (aunque sea con error): hay conexión.
    const online = axios.isAxiosError(err) && Boolean(err.response);
    set({ online });
    return online;
  }
}

/** Un error sin respuesta del servidor = no hay conexión (no es un rechazo). */
export function isNetworkError(err: unknown): boolean {
  return axios.isAxiosError(err) && !err.response;
}

export async function refreshSnapshot(token: string): Promise<void> {
  const { data } = await apiClient(token).get<Snapshot>("/api/v1/offline/snapshot", { timeout: 60_000 });
  await saveSnapshot(data);
  try {
    localStorage.setItem(SNAPSHOT_AT, data.generated_at);
  } catch {
    /* sin almacenamiento: el indicador no muestra la hora, la copia sí quedó */
  }
  await refreshCounts();
}

export { loadSnapshot };

// ─── Encolar ─────────────────────────────────────────────────────────────────

export async function queueCheckin(member: Pick<SnapshotMember, "id" | "name">, decision: "allowed" | "override", reason?: string) {
  const payload: QueuedCheckin = {
    kind: "checkin",
    client_event_id: crypto.randomUUID().replace(/-/g, ""),
    member_id: member.id,
    occurred_at: new Date().toISOString(),
    decision,
    reason,
  };
  return enqueue({ label: `Entrada de ${member.name}`, payload });
}

export async function queueRequest(label: string, url: string, body: unknown, extra: Partial<QueuedRequest> = {}) {
  const payload: QueuedRequest = {
    kind: "request", method: "POST", url, body,
    idempotency_key: crypto.randomUUID().replace(/-/g, ""), ...extra,
  };
  return enqueue({ label, payload });
}

// ─── Subir lo pendiente ──────────────────────────────────────────────────────

function detail(err: unknown): string {
  if (axios.isAxiosError(err)) {
    const d = err.response?.data?.detail;
    if (typeof d === "string") return d;
    if (Array.isArray(d) && d[0]?.msg) return String(d[0].msg);
    return `Error ${err.response?.status ?? ""}`.trim();
  }
  return "Error desconocido";
}

let flushing = false;

/**
 * Sube la cola en orden: primero altas y cobros (las entradas pueden depender
 * de ellos), después las entradas en un solo lote. Cada envío lleva su clave,
 * así que repetirlo nunca duplica.
 */
export async function flush(token: string | undefined): Promise<void> {
  if (!token || flushing) return;
  flushing = true;
  set({ syncing: true });
  try {
    const client = apiClient(token);
    const items = (await listQueue()).filter((i) => i.status === "pending");
    const idMap = new Map<string, string>();

    for (const item of items) {
      if (item.payload.kind !== "request") continue;
      const p = item.payload;
      try {
        const { data } = await client.post(p.url, p.body, { headers: { "Idempotency-Key": p.idempotency_key } });
        if (p.temp_member_id && data?.id) idMap.set(p.temp_member_id, String(data.id));
        await removeItem(item);
      } catch (err) {
        if (isNetworkError(err)) return;
        const status = axios.isAxiosError(err) ? err.response?.status ?? 0 : 0;
        await updateItem({
          ...item, attempts: item.attempts + 1,
          status: status >= 500 && item.attempts < 5 ? "pending" : "review",
          error: detail(err),
        });
      }
    }

    const checkins = (await listQueue()).filter((i) => i.status === "pending" && i.payload.kind === "checkin");
    for (const item of checkins) {
      const p = item.payload as QueuedCheckin;
      if (idMap.has(p.member_id)) {
        p.member_id = idMap.get(p.member_id)!;
        await updateItem(item);
      }
    }
    const ready = checkins.filter((i) => !(i.payload as QueuedCheckin).member_id.startsWith("tmp-"));
    if (ready.length) {
      try {
        const { data } = await client.post("/api/v1/offline/checkins", {
          events: ready.map((i) => {
            const { kind: _kind, ...event } = i.payload as QueuedCheckin;
            void _kind;
            return event;
          }),
        });
        const byId = new Map<string, { result: string; detail?: string }>(
          data.results.map((r: { client_event_id: string; result: string; detail?: string }) => [r.client_event_id, r]),
        );
        for (const item of ready) {
          const r = byId.get((item.payload as QueuedCheckin).client_event_id);
          if (!r) continue;
          if (r.result === "ok" || r.result === "duplicate") await removeItem(item);
          else await updateItem({ ...item, status: "review", error: r.detail ?? "Revisar" });
        }
      } catch (err) {
        if (!isNetworkError(err)) {
          for (const item of ready) await updateItem({ ...item, attempts: item.attempts + 1, error: detail(err) });
        }
      }
    }
  } finally {
    flushing = false;
    set({ syncing: false });
    if (typeof window !== "undefined") window.dispatchEvent(new Event("fc:synced"));
    await refreshCounts();
    notify();
  }
}

export async function retry(item: QueueItem, token: string | undefined) {
  await updateItem({ ...item, status: "pending", error: undefined });
  await flush(token);
}

export async function discard(item: QueueItem) {
  await removeItem(item);
}
