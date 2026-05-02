// Token comes from NextAuth session (HTTP-only cookie), not localStorage.
// For client requests use apiClient(session.accessToken).
// For server requests (Server Components) use apiServer(token).
import axios from "axios";

export function apiClient(accessToken?: string) {
  return axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL,
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
  });
}

export function apiServer(accessToken: string) {
  return axios.create({
    baseURL: process.env.NEXT_PUBLIC_API_URL,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
  });
}
