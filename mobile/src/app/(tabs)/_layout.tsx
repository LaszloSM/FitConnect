import { Tabs } from "expo-router";
import { BarbellIcon, CalendarIcon, ForkKnifeIcon, HouseIcon, UserIcon } from "phosphor-react-native";

import { useSafeAreaInsets } from "react-native-safe-area-context";

import { fonts, useColors } from "@/lib/theme";

/** Barra de Stitch: blanca, borde superior fino, activa en coral, sin fondos. */
export default function TabsLayout() {
  const c = useColors();
  const insets = useSafeAreaInsets();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.brand,
        tabBarInactiveTintColor: c.inkFaint,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.line, borderTopWidth: 1, height: 62 + insets.bottom, paddingTop: 6, elevation: 0, shadowOpacity: 0 },
        tabBarLabelStyle: { fontFamily: fonts.bodySemi, fontSize: 11.5, marginBottom: 2 },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: "Inicio", tabBarIcon: ({ color, focused }) => <HouseIcon color={String(color)} size={24} weight={focused ? "bold" : "regular"} /> }}
      />
      <Tabs.Screen
        name="classes"
        options={{ title: "Clases", tabBarIcon: ({ color, focused }) => <CalendarIcon color={String(color)} size={24} weight={focused ? "bold" : "regular"} /> }}
      />
      <Tabs.Screen
        name="train"
        options={{ title: "Entrenar", tabBarIcon: ({ color, focused }) => <BarbellIcon color={String(color)} size={24} weight={focused ? "bold" : "regular"} /> }}
      />
      <Tabs.Screen
        name="eat"
        options={{ title: "Comer", tabBarIcon: ({ color, focused }) => <ForkKnifeIcon color={String(color)} size={24} weight={focused ? "bold" : "regular"} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "Perfil", tabBarIcon: ({ color, focused }) => <UserIcon color={String(color)} size={24} weight={focused ? "bold" : "regular"} /> }}
      />
    </Tabs>
  );
}
