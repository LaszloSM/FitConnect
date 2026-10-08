import { Tabs } from "expo-router";
import { BarbellIcon, CalendarIcon, HouseIcon, UserIcon } from "phosphor-react-native";

import { fonts, useColors } from "@/lib/theme";

export default function TabsLayout() {
  const c = useColors();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.brandInk,
        tabBarInactiveTintColor: c.inkMuted,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.line, minHeight: 60 },
        tabBarLabelStyle: { fontFamily: fonts.bodySemi, fontSize: 12 },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: "Inicio", tabBarIcon: ({ color, focused }) => <HouseIcon color={String(color)} size={24} weight={focused ? "fill" : "regular"} /> }}
      />
      <Tabs.Screen
        name="classes"
        options={{ title: "Clases", tabBarIcon: ({ color, focused }) => <CalendarIcon color={String(color)} size={24} weight={focused ? "fill" : "regular"} /> }}
      />
      <Tabs.Screen
        name="train"
        options={{ title: "Entrenar", tabBarIcon: ({ color, focused }) => <BarbellIcon color={String(color)} size={24} weight={focused ? "fill" : "regular"} /> }}
      />
      <Tabs.Screen
        name="profile"
        options={{ title: "Perfil", tabBarIcon: ({ color, focused }) => <UserIcon color={String(color)} size={24} weight={focused ? "fill" : "regular"} /> }}
      />
    </Tabs>
  );
}
