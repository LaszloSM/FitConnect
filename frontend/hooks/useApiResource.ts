/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { apiClient } from "@/lib/api";

interface ApiResource<T> {
  data: T;
  loading: boolean;
  error: string;
  refetch: () => Promise<void>;
  setData: React.Dispatch<React.SetStateAction<T>>;
}

interface ApiResourceOptions {
  params?: Record<string, string | number | boolean | undefined>;
  /** Refresca cada N ms (p.ej. el feed de check-ins de recepción). */
  pollMs?: number;
}

/**
 * Hook compartido de lectura: encapsula session + apiClient + loading/error.
 * Reemplaza el patrón useState+useEffect+axios copiado en cada *Client.tsx.
 */
export function useApiResource<T>(
  path: string,
  initial: T,
  options: ApiResourceOptions = {}
): ApiResource<T> {
  const { data: session } = useSession();
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const { pollMs } = options;
  // Serializado para que cambios de identidad del objeto no re-disparen el efecto
  const paramsKey = JSON.stringify(options.params ?? {});

  const refetch = useCallback(async (background = false) => {
    if (!session?.accessToken) return;
    if (!background) setLoading(true);
    try {
      const client = apiClient(session.accessToken as string);
      const params = JSON.parse(paramsKey);
      const res = await client.get(path, { params });
      setData(res.data);
      setError("");
    } catch (err: any) {
      setError(
        typeof err.response?.data?.detail === "string"
          ? err.response.data.detail
          : "Error cargando datos"
      );
    } finally {
      setLoading(false);
    }
  }, [session, path, paramsKey]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  useEffect(() => {
    if (!pollMs) return;
    const id = setInterval(() => void refetch(true), pollMs);
    return () => clearInterval(id);
  }, [pollMs, refetch]);

  return { data, loading, error, refetch, setData };
}
