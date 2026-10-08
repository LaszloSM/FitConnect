import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

import { api, clearTokens, currentRefreshToken, loadTokens, OfflineError, saveTokens, setSessionEndHandler } from "./api";
import { cache, secure } from "./storage";
import type { GymRef, Me } from "./types";
import { syncMeals } from "./meals";
import { clearAllReminders } from "./reminders";
import { syncWorkouts } from "./workouts";

type Status = "loading" | "signedOut" | "signedIn";

interface SessionValue {
  status: Status;
  me: Me | null;
  /** El gimnasio que se está mirando (la persona puede tener varios). */
  gym: GymRef | null;
  offline: boolean;
  setGym: (linkId: string) => void;
  refresh: () => Promise<void>;
  signIn: (tokens: { access_token: string; refresh_token: string }) => Promise<void>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<SessionValue | null>(null);
const ME_KEY = "me";
const GYM_KEY = "active-gym";

export function SessionProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>("loading");
  const [me, setMe] = useState<Me | null>(null);
  const [gymId, setGymId] = useState<string | null>(null);
  const [offline, setOffline] = useState(false);

  const forget = useCallback(async () => {
    await clearTokens();
    await clearAllReminders();
    await cache.clearAll();
    await secure.del(GYM_KEY);
    setMe(null);
    setGymId(null);
    setStatus("signedOut");
  }, []);

  const refresh = useCallback(async () => {
    try {
      const fresh = await api<Me>("/api/v1/me");
      setMe(fresh);
      setOffline(false);
      await cache.set(ME_KEY, fresh);
      void syncWorkouts();
      void syncMeals();
    } catch (e) {
      if (!(e instanceof OfflineError)) throw e;
      setOffline(true);
      const saved = await cache.get<Me>(ME_KEY);
      if (saved) setMe(saved.value);
    }
  }, []);

  useEffect(() => {
    setSessionEndHandler(() => void forget());
    (async () => {
      setGymId(await secure.get(GYM_KEY));
      if (!(await loadTokens())) {
        setStatus("signedOut");
        return;
      }
      try {
        await refresh();
        setStatus("signedIn");
      } catch {
        setStatus("signedOut");
      }
    })();
  }, [forget, refresh]);

  const signIn = useCallback(
    async (tokens: { access_token: string; refresh_token: string }) => {
      await saveTokens(tokens);
      await refresh();
      setStatus("signedIn");
    },
    [refresh],
  );

  const signOut = useCallback(async () => {
    const token = await currentRefreshToken();
    if (token) {
      await api("/api/v1/app/auth/logout", { method: "POST", auth: false, json: { refresh_token: token } }).catch(() => undefined);
    }
    await forget();
  }, [forget]);

  const setGym = useCallback((linkId: string) => {
    setGymId(linkId);
    void secure.set(GYM_KEY, linkId);
  }, []);

  const gym = useMemo(() => {
    const gyms = me?.gyms ?? [];
    return gyms.find((g) => g.link_id === gymId) ?? gyms[0] ?? null;
  }, [me, gymId]);

  const value = useMemo(
    () => ({ status, me, gym, offline, setGym, refresh, signIn, signOut }),
    [status, me, gym, offline, setGym, refresh, signIn, signOut],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession(): SessionValue {
  const v = useContext(Ctx);
  if (!v) throw new Error("useSession fuera de SessionProvider");
  return v;
}
