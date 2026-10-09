/**
 * Cliente del backend. El token de acceso dura 30 minutos; ante un 401 se
 * renueva una sola vez (aunque fallen varias peticiones a la vez) y se reintenta.
 * Si la renovación falla, la sesión terminó: `onSessionEnd` lleva al login.
 */
import { API_URL } from "./config";
import { secure } from "./storage";

const ACCESS = "fc.access";
const REFRESH = "fc.refresh";

export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

/** Sin señal o el servidor no respondió: la pantalla decide si muestra la copia guardada. */
export class OfflineError extends Error {
  constructor() {
    super("Sin conexión");
  }
}

let access: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onSessionEnd: () => void = () => {};

export function setSessionEndHandler(fn: () => void) {
  onSessionEnd = fn;
}

export async function loadTokens(): Promise<boolean> {
  access = await secure.get(ACCESS);
  return Boolean(access || (await secure.get(REFRESH)));
}

export async function saveTokens(t: { access_token: string; refresh_token: string }) {
  access = t.access_token;
  await secure.set(ACCESS, t.access_token);
  await secure.set(REFRESH, t.refresh_token);
}

export async function clearTokens() {
  access = null;
  await secure.del(ACCESS);
  await secure.del(REFRESH);
}

export async function currentRefreshToken() {
  return secure.get(REFRESH);
}

function detailOf(body: unknown, fallback: string): { message: string; code?: string } {
  const d = (body as { detail?: unknown } | null)?.detail;
  if (typeof d === "string") return { message: d };
  if (d && typeof d === "object") {
    const o = d as { message?: string; code?: string };
    return { message: o.message ?? fallback, code: o.code };
  }
  if (Array.isArray(d)) return { message: "Revisa los datos e intenta de nuevo." };
  return { message: fallback };
}

async function raw(path: string, init: RequestInit & { auth?: boolean } = {}): Promise<Response> {
  const headers: Record<string, string> = { "Content-Type": "application/json", ...(init.headers as Record<string, string>) };
  if (init.auth !== false && access) headers.Authorization = `Bearer ${access}`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    return await fetch(`${API_URL}${path}`, { ...init, headers, signal: controller.signal });
  } catch {
    throw new OfflineError();
  } finally {
    clearTimeout(timer);
  }
}

async function refresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = (async () => {
      const token = await secure.get(REFRESH);
      if (!token) return false;
      const r = await raw("/api/v1/app/auth/refresh", { method: "POST", auth: false, body: JSON.stringify({ refresh_token: token }) });
      if (!r.ok) return false;
      await saveTokens(await r.json());
      return true;
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

export async function api<T>(path: string, init: RequestInit & { auth?: boolean; json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = init;
  const req = { ...rest, body: json !== undefined ? JSON.stringify(json) : rest.body };
  let r = await raw(path, req);
  if (r.status === 401 && init.auth !== false) {
    let renewed = false;
    try {
      renewed = await refresh();
    } catch (e) {
      // Sin señal no se cierra la sesión: se intenta de nuevo al volver.
      if (e instanceof OfflineError) throw e;
    }
    if (!renewed) {
      await clearTokens();
      onSessionEnd();
      throw new ApiError("Tu sesión terminó. Vuelve a entrar.", 401);
    }
    r = await raw(path, req);
  }
  if (r.status === 204) return undefined as T;
  const body = await r.json().catch(() => null);
  if (!r.ok) {
    const { message, code } = detailOf(body, "Algo salió mal. Intenta de nuevo.");
    throw new ApiError(message, r.status, code);
  }
  return body as T;
}
