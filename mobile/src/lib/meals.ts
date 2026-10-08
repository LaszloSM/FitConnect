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
    pending: true,
  };
}

let running: Promise<MealEntry[]> | null = null;

export function syncMeals(): Promise<MealEntry[]> {
  if (!running) {
    running = (async () => {
      const left: MealEntry[] = [];
      for (const m of await pendingMeals()) {
        try {
          await api("/api/v1/me/meals", { method: "POST", json: { id: m.id, day: m.day, meal: m.meal, food_id: m.food_id, grams: m.grams } });
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

export async function logMeal(entry: MealEntry): Promise<"synced" | "queued"> {
  await AsyncStorage.setItem(KEY, JSON.stringify([...(await pendingMeals()), entry]));
  const left = await syncMeals();
  return left.some((m) => m.id === entry.id) ? "queued" : "synced";
}
