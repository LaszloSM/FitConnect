/**
 * Dos cajones:
 * - `secure`: sesión y llaves del QR. En el celular, Keychain / Keystore
 *   (expo-secure-store). En web (solo para revisar la interfaz) cae al
 *   almacenamiento del navegador.
 * - `cache`: copias de lo último que se vio, para mostrar algo sin señal.
 */
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const web = Platform.OS === "web";

export const secure = {
  get: (key: string) => (web ? AsyncStorage.getItem(`s:${key}`) : SecureStore.getItemAsync(key)),
  set: (key: string, value: string) =>
    web ? AsyncStorage.setItem(`s:${key}`, value) : SecureStore.setItemAsync(key, value),
  del: (key: string) => (web ? AsyncStorage.removeItem(`s:${key}`) : SecureStore.deleteItemAsync(key)),
};

export const cache = {
  async get<T>(key: string): Promise<{ value: T; at: number } | null> {
    try {
      const raw = await AsyncStorage.getItem(`c:${key}`);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },
  async set<T>(key: string, value: T): Promise<void> {
    await AsyncStorage.setItem(`c:${key}`, JSON.stringify({ value, at: Date.now() }));
  },
  async clearAll(): Promise<void> {
    const keys = (await AsyncStorage.getAllKeys()).filter((k) => k.startsWith("c:") || k.startsWith("q:"));
    await AsyncStorage.multiRemove(keys);
  },
};
