import { useCallback, useEffect, useRef, useState } from "react";

import { api, OfflineError } from "./api";
import { cache } from "./storage";

/**
 * Pide `path` y guarda la respuesta. Sin señal muestra la última copia y
 * `stale` dice desde cuándo. Un error real (403, 404) no se tapa con la copia.
 */
export function useCached<T>(path: string | null, sanitize?: (value: T) => T) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState<number | null>(null);
  const [loading, setLoading] = useState(Boolean(path));
  const current = useRef(path);
  current.current = path;

  const load = useCallback(async () => {
    if (!path) return;
    setLoading(true);
    try {
      const fresh = await api<T>(path);
      if (current.current !== path) return;
      setData(fresh);
      setError(null);
      setStale(null);
      await cache.set(path, sanitize ? sanitize(fresh) : fresh);
    } catch (e) {
      if (current.current !== path) return;
      if (e instanceof OfflineError) {
        const saved = await cache.get<T>(path);
        if (saved) {
          setData(saved.value);
          setStale(saved.at);
        } else {
          setError("Sin conexión y todavía no hay datos guardados en este celular.");
        }
      } else {
        setError(e instanceof Error ? e.message : "No se pudo cargar");
      }
    } finally {
      if (current.current === path) setLoading(false);
    }
  }, [path, sanitize]);

  useEffect(() => {
    setData(null);
    setError(null);
    setStale(null);
    void (async () => {
      if (path) {
        const saved = await cache.get<T>(path);
        if (saved && current.current === path) setData(saved.value);
      }
      await load();
    })();
  }, [path, load]);

  return { data, error, stale, loading, reload: load, setData };
}
