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

/**
 * Hook compartido de lectura: encapsula session + apiClient + loading/error.
 * Reemplaza el patrón useState+useEffect+axios copiado en cada *Client.tsx.
 */
export function useApiResource<T>(path: string, initial: T): ApiResource<T> {
  const { data: session } = useSession();
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refetch = useCallback(async () => {
    if (!session?.accessToken) return;
    setLoading(true);
    try {
      const client = apiClient(session.accessToken as string);
      const res = await client.get(path);
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
  }, [session, path]);

  useEffect(() => {
    void refetch();
  }, [refetch]);

  return { data, loading, error, refetch, setData };
}
