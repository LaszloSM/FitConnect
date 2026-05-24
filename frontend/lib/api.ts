// Token comes from NextAuth session (HTTP-only cookie), not localStorage.
// For client requests use apiClient(session.accessToken).
// For server requests (Server Components) use apiServer(token).
import axios, { type AxiosInstance } from "axios";

function addResponseInterceptor(instance: AxiosInstance): AxiosInstance {
  instance.interceptors.response.use(
    (res) => res,
    (error) => {
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
