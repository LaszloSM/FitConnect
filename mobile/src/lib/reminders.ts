/** Recordatorios locales de las comidas de un plan (solo en el celular, sin servidor). */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import type { MealPlanData } from "./types";

const key = (planId: string) => `c:reminders:${planId}`;

export async function reminderIds(planId: string): Promise<string[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(key(planId))) ?? "[]");
  } catch {
    return [];
  }
}

export async function enableMealReminders(planId: string, data: MealPlanData): Promise<"ok" | "denied" | "unsupported"> {
  if (Platform.OS === "web") return "unsupported";
  const { status } = await Notifications.requestPermissionsAsync();
  if (status !== "granted") return "denied";
  await disableMealReminders(planId);
  const ids: string[] = [];
  for (const m of data.meals) {
    const [hour, minute] = m.time.split(":").map(Number);
    ids.push(
      await Notifications.scheduleNotificationAsync({
        content: { title: `${m.name} · ${m.kcal} kcal`, body: m.items.map((i) => i.food).join(", ").slice(0, 140), data: { planId } },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DAILY, hour, minute },
      }),
    );
  }
  await AsyncStorage.setItem(key(planId), JSON.stringify(ids));
  return "ok";
}

export async function disableMealReminders(planId: string): Promise<void> {
  for (const id of await reminderIds(planId)) {
    await Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
  }
  await AsyncStorage.removeItem(key(planId));
}

/** Al cerrar sesión no deben quedar recordatorios de otra persona en el celular. */
export async function clearAllReminders(): Promise<void> {
  if (Platform.OS !== "web") await Notifications.cancelAllScheduledNotificationsAsync().catch(() => undefined);
}
