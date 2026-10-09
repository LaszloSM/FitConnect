/**
 * Agua: un toque suma un vaso aunque no haya señal. Igual que las comidas,
 * cada vaso lleva su id desde el celular y se sube después sin duplicarse.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";
import { useEffect, useState } from "react";

import { api, ApiError, OfflineError } from "./api";
import { bogotaToday } from "./meals";
import type { WaterDay } from "./types";
import { useCached } from "./useCached";

const KEY = "q:water";

type Op = { op: "add"; id: string; day: string; ml: number } | { op: "del"; id: string };

async function queue(): Promise<Op[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? "[]");
  } catch {
    return [];
  }
}

const save = (ops: Op[]) => AsyncStorage.setItem(KEY, JSON.stringify(ops));

let running: Promise<Op[]> | null = null;

export function syncWater(): Promise<Op[]> {
  if (!running) {
    running = (async () => {
      const left: Op[] = [];
      for (const o of await queue()) {
        try {
          if (o.op === "add") await api("/api/v1/me/water", { method: "POST", json: { id: o.id, day: o.day, ml: o.ml } });
          else await api(`/api/v1/me/water/${o.id}`, { method: "DELETE" });
        } catch (e) {
          if (e instanceof OfflineError || (e instanceof ApiError && e.status >= 500)) left.push(o);
        }
      }
      await save(left);
      return left;
    })().finally(() => {
      running = null;
    });
  }
  return running;
}

/** Aplica sobre el día del servidor lo que todavía no subió. */
export async function withPending(day: WaterDay): Promise<WaterDay> {
  const ops = await queue();
  let entries = day.entries;
  for (const o of ops) {
    if (o.op === "add" && o.day === day.day && !entries.some((e) => e.id === o.id)) entries = [...entries, { id: o.id, ml: o.ml }];
    if (o.op === "del") entries = entries.filter((e) => e.id !== o.id);
  }
  return { ...day, entries, total_ml: entries.reduce((s, e) => s + e.ml, 0) };
}

export async function addGlass(ml: number, day = bogotaToday()): Promise<{ id: string; ml: number }> {
  const op: Op = { op: "add", id: Crypto.randomUUID(), day, ml };
  await save([...(await queue()), op]);
  void syncWater();
  return { id: op.id, ml };
}

export async function removeGlass(id: string): Promise<void> {
  const ops = await queue();
  // Si el vaso todavía no subió, basta con olvidarlo.
  if (ops.some((o) => o.op === "add" && o.id === id)) {
    await save(ops.filter((o) => !(o.op === "add" && o.id === id)));
    return;
  }
  await save([...ops, { op: "del", id }]);
  void syncWater();
}

/** Agua del día con lo pendiente aplicado y toques optimistas. */
export function useWater(day = bogotaToday()) {
  const cached = useCached<WaterDay>(`/api/v1/me/water?day=${day}`);
  const [water, setWater] = useState<WaterDay | null>(null);
  useEffect(() => {
    if (cached.data) void withPending(cached.data).then(setWater);
  }, [cached.data]);
  const add = async () => {
    const base = water ?? cached.data;
    if (!base) return;
    const g = await addGlass(base.glass_ml, day);
    setWater({ ...base, entries: [...base.entries, g], total_ml: base.total_ml + g.ml });
  };
  const remove = async () => {
    const base = water ?? cached.data;
    const last = base?.entries[base.entries.length - 1];
    if (!base || !last) return;
    await removeGlass(last.id);
    setWater({ ...base, entries: base.entries.slice(0, -1), total_ml: base.total_ml - last.ml });
  };
  return { water, add, remove, reload: cached.reload };
}
