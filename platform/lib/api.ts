"use client";

/**
 * Sesión del panel: vive en sessionStorage (se borra al cerrar la pestaña) y
 * dura 30 minutos. Nada se guarda en cookies: este panel no comparte nada con
 * la app de los gimnasios.
 */
const KEY = "fc-platform-session";
// En producción el panel llama a su mismo origen (Caddy enruta /api/platform/* al
// backend). En desarrollo se define NEXT_PUBLIC_API_URL=http://localhost:8000.
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

export interface PlatformSession {
  access_token: string;
  email: string;
  full_name: string;
}

export function getSession(): PlatformSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as PlatformSession) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: PlatformSession) {
  sessionStorage.setItem(KEY, JSON.stringify(s));
}

export function clearSession() {
  try {
    sessionStorage.removeItem(KEY);
  } catch {
    /* sin almacenamiento: no hay nada que borrar */
  }
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function detailOf(body: unknown, fallback: string): string {
  const d = (body as { detail?: unknown })?.detail;
  if (typeof d === "string") return d;
  if (Array.isArray(d) && d[0]?.msg) return String(d[0].msg);
  return fallback;
}

export async function api<T = unknown>(path: string, init: { method?: string; body?: unknown; auth?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (init.auth !== false) {
    const s = getSession();
    if (s) headers.Authorization = `Bearer ${s.access_token}`;
  }
  let res: Response;
  try {
    res = await fetch(`${API_URL}/api/platform${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "No hay conexión con el servidor");
  }
  const body = await res.json().catch(() => ({}));
  if (res.status === 401 && init.auth !== false) {
    clearSession();
    window.location.assign("/login?expired=1");
  }
  if (!res.ok) throw new ApiError(res.status, detailOf(body, "No se pudo completar"));
  return body as T;
}
