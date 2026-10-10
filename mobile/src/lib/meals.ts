/**
 * Comidas sin señal: igual que los entrenos, se guardan en el celular y se
 * suben cuando hay conexión. El aporte se calcula aquí para mostrarlo ya; el
 * servidor lo recalcula con el mismo alimento al recibirlo.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Crypto from "expo-crypto";

import { api, ApiError, OfflineError } from "./api";
import type { Food, MealEntry, MealKey } from "./types";

const KEY = "q:meals";

export function bogotaToday(now = Date.now()): string {
  return new Date(now - 5 * 3600_000).toISOString().slice(0, 10);
}

export async function pendingMeals(): Promise<MealEntry[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? "[]");
  } catch {
    return [];
  }
}

export function entryFor(food: Food, grams: number, meal: MealKey, day = bogotaToday()): MealEntry {
  const f = grams / 100;
  const r = (v: number) => Math.round(v * f * 10) / 10;
  return {
    id: Crypto.randomUUID(),
    day,
    meal,
    food_id: food.id,
    food_name: food.name,
    grams,
    kcal: r(food.kcal),
    protein_g: r(food.protein_g),
    carbs_g: r(food.carbs_g),
    fat_g: r(food.fat_g),
    fiber_g: r(food.fiber_g),
    nutrients: Object.fromEntries(Object.entries(food.nutrients ?? {}).map(([k, v]) => [k, Math.round((v ?? 0) * f * 100) / 100])),
    pending: true,
  };
}

export const QUICK_LABEL = "Registro rápido";

/** Registro rápido: solo calorías (y macros si se saben), sin alimento ni gramos. */
export function quickEntry(
  v: { label?: string; kcal: number; protein_g?: number; carbs_g?: number; fat_g?: number },
  meal: MealKey,
  day = bogotaToday(),
): MealEntry {
  const r = (n?: number) => Math.round((n ?? 0) * 10) / 10;
  return {
    id: Crypto.randomUUID(),
    day,
    meal,
    food_id: null,
    food_name: v.label?.trim() || QUICK_LABEL,
    grams: 0,
    kcal: r(v.kcal),
    protein_g: r(v.protein_g),
    carbs_g: r(v.carbs_g),
    fat_g: r(v.fat_g),
    fiber_g: 0,
    nutrients: {},
    pending: true,
  };
}

/** La comida que toca según la hora de Bogotá. */
export function mealNow(now = Date.now()): MealKey {
  const h = new Date(now - 5 * 3600_000).getUTCHours();
  if (h < 10) return "breakfast";
  if (h < 15) return "lunch";
  if (h < 18) return "snack";
  return "dinner";
}

let running: Promise<MealEntry[]> | null = null;

export function syncMeals(): Promise<MealEntry[]> {
  if (!running) {
    running = (async () => {
      const left: MealEntry[] = [];
      for (const m of await pendingMeals()) {
        try {
          const json = m.food_id
            ? { id: m.id, day: m.day, meal: m.meal, food_id: m.food_id, grams: m.grams }
            : { id: m.id, day: m.day, meal: m.meal, label: m.food_name, kcal: m.kcal, protein_g: m.protein_g, carbs_g: m.carbs_g, fat_g: m.fat_g };
          await api("/api/v1/me/meals", { method: "POST", json });
        } catch (e) {
          if (e instanceof OfflineError || (e instanceof ApiError && e.status >= 500)) left.push(m);
        }
      }
      await AsyncStorage.setItem(KEY, JSON.stringify(left));
      return left;
    })().finally(() => {
      running = null;
    });
  }
  return running;
}

/** Repite los registros de un día en otro (o en la misma comida). Necesita señal. */
export async function copyMeals(fromDay: string, count: number, opts: { toDay?: string; meal?: MealKey; toMeal?: MealKey } = {}) {
  const ids = Array.from({ length: count }, () => Crypto.randomUUID());
  return api<{ entries: MealEntry[] }>("/api/v1/me/meals/copy", {
    method: "POST",
    json: { from_day: fromDay, to_day: opts.toDay, meal: opts.meal, to_meal: opts.toMeal, ids },
  });
}

export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

export async function logMeal(entry: MealEntry): Promise<"synced" | "queued"> {
  await AsyncStorage.setItem(KEY, JSON.stringify([...(await pendingMeals()), entry]));
  const left = await syncMeals();
  return left.some((m) => m.id === entry.id) ? "queued" : "synced";
}
