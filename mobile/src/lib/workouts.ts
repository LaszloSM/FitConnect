/**
 * Entrenos sin señal: se guardan primero en el celular y se suben cuando hay
 * conexión. El id lo genera el celular, así que reenviar no duplica.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";

import { api, ApiError, OfflineError } from "./api";
import type { Workout } from "./types";

const KEY = "q:workouts";

export async function pendingWorkouts(): Promise<Workout[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? "[]");
  } catch {
    return [];
  }
}

async function setPending(list: Workout[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(list));
}

export async function saveWorkout(w: Workout): Promise<"synced" | "queued"> {
  await setPending([...(await pendingWorkouts()).filter((x) => x.id !== w.id), w]);
  const left = await syncWorkouts();
  return left.some((x) => x.id === w.id) ? "queued" : "synced";
}

let running: Promise<Workout[]> | null = null;

/** Sube lo pendiente. Devuelve lo que quedó sin subir. */
export function syncWorkouts(): Promise<Workout[]> {
  if (!running) {
    running = (async () => {
      const left: Workout[] = [];
      for (const w of await pendingWorkouts()) {
        try {
          await api("/api/v1/me/workouts", { method: "POST", json: w });
        } catch (e) {
          // Sin señal o error del servidor: se reintenta luego. Un 4xx no se va a arreglar solo.
          if (e instanceof OfflineError || (e instanceof ApiError && e.status >= 500)) left.push(w);
        }
      }
      await setPending(left);
      return left;
    })().finally(() => {
      running = null;
    });
  }
  return running;
}
