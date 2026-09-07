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
