"use client";

/**
 * Datos de recepción sin conexión, en IndexedDB y cifrados con AES-GCM.
 *
 * La llave se genera en este navegador como NO extraíble y vive en el mismo
 * IndexedDB. Eso evita que los datos se lean abriendo los archivos del navegador
 * con otra herramienta, pero quien copie el perfil completo del navegador se lleva
 * también la llave. La protección de verdad del PC de recepción es su usuario de
 * Windows con contraseña y el disco cifrado (BitLocker). Por eso la copia solo
 * tiene lo mínimo (sin teléfonos, correos, salud ni el código QR) y se borra al
 * cerrar sesión.
 */

const DB_NAME = "fitconnect-offline";
const DB_VERSION = 1;

export interface SnapshotMember {
  id: string;
  name: string;
  id_number: string | null;
  /** SHA-256 del QR del carné: el código que abre la puerta no se guarda aquí. */
  qr_hash: string | null;
  type: string;
  status: "ok" | "in_grace" | "scheduled" | "expired" | "frozen" | "no_entries" | "no_membership";
  plan: string | null;
  end_date: string | null;
  entries_left: number | null;
}

export interface SnapshotPlan {
  id: string;
  name: string;
  price: number;
  duration_days: number;
  entries_total: number | null;
}

export interface Snapshot {
  generated_at: string;
  today: string;
  grace_days: number;
  members: SnapshotMember[];
  plans: SnapshotPlan[];
  /** QR de la app por vínculo: socio y llaves de hoy y mañana. */
  app_qr?: Record<string, { member_id: string; keys: Record<string, string> }>;
}

export type QueueStatus = "pending" | "review" | "done";

export interface QueuedCheckin {
  kind: "checkin";
  client_event_id: string;
  member_id: string;
  occurred_at: string;
  decision: "allowed" | "override";
  reason?: string;
}

export interface QueuedRequest {
  kind: "request";
  method: "POST";
  url: string;
  body: unknown;
  idempotency_key: string;
  /** Alta hecha sin red: su id real llega al sincronizar. */
  temp_member_id?: string;
}

export interface QueueItem {
  id: string;
  created_at: string;
  label: string;
  status: QueueStatus;
  error?: string;
  attempts: number;
  payload: QueuedCheckin | QueuedRequest;
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const store of ["keys", "data", "queue"]) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(store: string, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const r = fn(t.objectStore(store));
    t.oncomplete = () => resolve(r ? (r.result as T) : undefined);
    t.onerror = () => reject(t.error);
  });
}

async function key(): Promise<CryptoKey> {
  const existing = await tx<CryptoKey>("keys", "readonly", (s) => s.get("main"));
  if (existing) return existing;
  const created = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
  await tx("keys", "readwrite", (s) => s.put(created, "main"));
  return created;
}

async function seal(value: unknown): Promise<{ iv: Uint8Array; data: ArrayBuffer }> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await key(), new TextEncoder().encode(JSON.stringify(value)));
  return { iv, data };
}

async function unseal<T>(box: { iv: Uint8Array; data: ArrayBuffer } | undefined): Promise<T | null> {
  if (!box) return null;
  try {
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: box.iv as BufferSource }, await key(), box.data);
    return JSON.parse(new TextDecoder().decode(plain)) as T;
  } catch {
    return null;
  }
}

// ─── Copia de socios ─────────────────────────────────────────────────────────

export async function saveSnapshot(s: Snapshot): Promise<void> {
  const box = await seal(s);
  await tx("data", "readwrite", (st) => st.put(box, "snapshot"));
}

export async function loadSnapshot(): Promise<Snapshot | null> {
  const box = await tx<{ iv: Uint8Array; data: ArrayBuffer }>("data", "readonly", (s) => s.get("snapshot"));
  return unseal<Snapshot>(box);
}

export async function clearSnapshot(): Promise<void> {
  await tx("data", "readwrite", (s) => s.delete("snapshot"));
}

// ─── Cola ────────────────────────────────────────────────────────────────────

export async function enqueue(item: Omit<QueueItem, "id" | "created_at" | "status" | "attempts">): Promise<QueueItem> {
  const full: QueueItem = {
    ...item,
    id: crypto.randomUUID(),
    created_at: new Date().toISOString(),
    status: "pending",
    attempts: 0,
  };
  const box = await seal(full);
  await tx("queue", "readwrite", (s) => s.put(box, `${full.created_at}|${full.id}`));
  notify();
  return full;
}

export async function listQueue(): Promise<QueueItem[]> {
  const db = await open();
  const entries: { k: IDBValidKey; v: { iv: Uint8Array; data: ArrayBuffer } }[] = await new Promise((resolve, reject) => {
    const out: { k: IDBValidKey; v: { iv: Uint8Array; data: ArrayBuffer } }[] = [];
    const req = db.transaction("queue", "readonly").objectStore("queue").openCursor();
    req.onsuccess = () => {
      const c = req.result;
      if (!c) return resolve(out);
      out.push({ k: c.key, v: c.value });
      c.continue();
    };
    req.onerror = () => reject(req.error);
  });
  const items = await Promise.all(entries.map((e) => unseal<QueueItem>(e.v)));
  return items.filter((x): x is QueueItem => x !== null);
}

export async function updateItem(item: QueueItem): Promise<void> {
  const box = await seal(item);
  await tx("queue", "readwrite", (s) => s.put(box, `${item.created_at}|${item.id}`));
  notify();
}

export async function removeItem(item: QueueItem): Promise<void> {
  await tx("queue", "readwrite", (s) => s.delete(`${item.created_at}|${item.id}`));
  notify();
}

// ─── Avisos entre componentes y pestañas ────────────────────────────────────

const listeners = new Set<() => void>();
let channel: BroadcastChannel | null = null;

function bc(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!channel) {
    channel = new BroadcastChannel("fitconnect-offline");
    channel.onmessage = () => listeners.forEach((l) => l());
  }
  return channel;
}

export function notify(): void {
  listeners.forEach((l) => l());
  bc()?.postMessage("changed");
}

export function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  bc();
  return () => listeners.delete(fn);
}
