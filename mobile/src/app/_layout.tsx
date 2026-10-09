import { BricolageGrotesque_600SemiBold, BricolageGrotesque_700Bold } from "@expo-google-fonts/bricolage-grotesque";
import { Figtree_400Regular, Figtree_500Medium, Figtree_600SemiBold, useFonts } from "@expo-google-fonts/figtree";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { useColorScheme } from "react-native";

import { SessionProvider, useSession } from "@/lib/session";
import { fonts, useColors } from "@/lib/theme";

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded] = useFonts({
    BricolageGrotesque_600SemiBold,
    BricolageGrotesque_700Bold,
    Figtree_400Regular,
    Figtree_500Medium,
    Figtree_600SemiBold,
  });
  return (
    <SessionProvider>
      <Routes fontsLoaded={loaded} />
    </SessionProvider>
  );
}

function Routes({ fontsLoaded }: { fontsLoaded: boolean }) {
  const { status } = useSession();
  const c = useColors();
  const scheme = useColorScheme();
  const ready = fontsLoaded && status !== "loading";

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  if (!ready) return null;
  const signedIn = status === "signedIn";
  return (
    <>
      <StatusBar style={scheme === "dark" ? "light" : "dark"} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: c.bg },
          headerStyle: { backgroundColor: c.bg },
          headerShadowVisible: false,
          headerTintColor: c.ink,
          headerTitleStyle: { fontFamily: fonts.bodySemi, fontSize: 17 },
          headerBackButtonDisplayMode: "minimal",
        }}>
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="qr" options={{ presentation: "fullScreenModal", animation: "fade" }} />
          <Stack.Screen name="link" options={{ headerShown: true, title: "Vincular mi gimnasio" }} />
          <Stack.Screen name="workout" options={{ headerShown: true, title: "Entreno", gestureEnabled: false }} />
          <Stack.Screen name="gym-profile" options={{ headerShown: true, title: "Mis datos en el gimnasio" }} />
          <Stack.Screen name="payments" options={{ headerShown: true, title: "Pagos y renovación" }} />
          <Stack.Screen name="body" options={{ headerShown: true, title: "Mis medidas" }} />
          <Stack.Screen name="add-food" options={{ headerShown: true, title: "Agregar alimento" }} />
          <Stack.Screen name="scan" options={{ headerShown: true, title: "Escanear" }} />
          <Stack.Screen name="create-food" options={{ headerShown: true, title: "Crear alimento" }} />
          <Stack.Screen name="recipe" options={{ headerShown: true, title: "Mi comida" }} />
          <Stack.Screen name="generate" options={{ headerShown: true, title: "Generar plan" }} />
          <Stack.Screen name="plans" options={{ headerShown: true, title: "Mis planes" }} />
          <Stack.Screen name="plan/[id]" options={{ headerShown: true, title: "Plan" }} />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="login" />
        </Stack.Protected>
      </Stack>
    </>
  );
}
