// Token comes from NextAuth session (HTTP-only cookie), not localStorage.
// For client requests use apiClient(session.accessToken).
// For server requests (Server Components) use apiServer(token).
import axios, { type AxiosInstance } from "axios";

type Listener = () => void;
let unauthorizedListener: Listener | null = null;
let sessionEnding = false;

/** Registra quién reacciona a un 401 (lo hace SessionGuard). Devuelve el cleanup. */
export function onUnauthorized(fn: Listener): () => void {
  unauthorizedListener = fn;
  return () => {
    if (unauthorizedListener === fn) unauthorizedListener = null;
  };
}

/**
 * Cierra la sesión una sola vez y manda al login con el motivo. Sin la guarda,
 * una pantalla con varias peticiones en paralelo dispararía un signOut por cada
 * 401 y encadenaría redirecciones.
 */
export async function endSession(): Promise<void> {
  if (sessionEnding || typeof window === "undefined") return;
  sessionEnding = true;
  const { signOut } = await import("next-auth/react");
  await signOut({ callbackUrl: "/login?expired=1" });
}

function addResponseInterceptor(instance: AxiosInstance): AxiosInstance {
  instance.interceptors.response.use(
    (res) => res,
    (error) => {
      // Sesión inválida: no tiene sentido mostrar "Error cargando datos" en cada
      // panel; se cierra sesión y se pide entrar de nuevo.
      if (error?.response?.status === 401 && unauthorizedListener) {
        unauthorizedListener();
      }
      // Cuenta en solo lectura o sin la verificación en dos pasos: lo resuelve
      // un aviso global (SubscriptionBanner / SessionGuard), no cada pantalla.
      if (typeof window !== "undefined") {
        const status = error?.response?.status;
        const data = error?.response?.data;
        if (status === 402 && data?.code === "read_only") window.dispatchEvent(new Event("fc:read-only"));
        if (status === 403 && data?.detail === "mfa_setup_required") window.location.assign("/seguridad/dos-pasos");
      }
      // Re-throw as-is — parseApiError() en lib/errors.ts extrae el mensaje legible
      return Promise.reject(error);
    }
  );
  return instance;
}

export function apiClient(accessToken?: string): AxiosInstance {
  return addResponseInterceptor(
    axios.create({
      baseURL: process.env.NEXT_PUBLIC_API_URL,
      // Sin tope, una petición que nunca resuelve deja la pantalla cargando
      // indefinidamente: ni datos ni error, solo el esqueleto.
      timeout: 20_000,
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
    })
  );
}

export function apiServer(accessToken: string): AxiosInstance {
  return addResponseInterceptor(
    axios.create({
      baseURL: process.env.NEXT_PUBLIC_API_URL,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
    })
  );
}

/**
 * Clave de idempotencia para una escritura de dinero.
 *
 * Se genera al ABRIR el formulario, no al enviarlo: así el reintento tras un
 * spinner trabado, un F5 o un doble clic llevan la MISMA clave y el backend
 * devuelve el cobro que ya hizo en vez de crear otro. Los guards de `setCharging`
 * siguen ahí como cortesía, pero dejan de ser la única defensa.
 */
export function newIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

export function idempotent(key: string) {
  return { headers: { "Idempotency-Key": key } };
}

/**
 * POST de dinero con reintento seguro.
 *
 * Reenvía la misma clave mientras sea el mismo cobro (el backend devuelve el
 * que ya hizo) y la rota en cuanto uno se completa, para que el siguiente cobro
 * sea de verdad otro cobro. Si el cuerpo cambió con la clave vieja —el cajero
 * agregó un producto al carrito y volvió a cobrar— el backend responde 409 y
 * aquí se reintenta una vez con clave nueva.
 */
export async function postOnce<T = unknown>(
  client: AxiosInstance,
  url: string,
  body: unknown,
  keyRef: { current: string }
) {
  const send = () => client.post<T>(url, body, idempotent(keyRef.current));
  try {
    const res = await send();
    keyRef.current = newIdempotencyKey();
    return res;
  } catch (err: unknown) {
    const e = err as { response?: { status?: number; data?: { detail?: string } } };
    const isKeyReuse =
      e?.response?.status === 409 &&
      String(e.response?.data?.detail ?? "").includes("idempotencia");
    if (!isKeyReuse) throw err;
    keyRef.current = newIdempotencyKey();
    const res = await send();
    keyRef.current = newIdempotencyKey();
    return res;
  }
}
