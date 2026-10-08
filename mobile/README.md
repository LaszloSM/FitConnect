# FitConnect — app móvil (Expo)

App para socios de gimnasios FitConnect y para personas que entrenan por su cuenta.
Expo SDK 57 + Expo Router + TypeScript. Diseño "Calor" (`../DESIGN.md`).

## Correr en desarrollo

```bash
cd mobile
npm install
# En el celular, localhost es el propio celular: usa la IP del PC en la red local.
EXPO_PUBLIC_API_URL=http://192.168.1.50:8000 EXPO_PUBLIC_WEB_URL=http://192.168.1.50:3000 npx expo start
```

Abre el proyecto con Expo Go (Android/iOS) escaneando el QR de la terminal. Para
revisar la interfaz en el navegador: `npx expo start --web`.

El backend debe permitir el origen web en `CORS_ORIGINS` si pruebas la versión web;
la app nativa no necesita CORS.

En desarrollo el código de entrada no llega por correo (no hay SES): sale en el log
del backend, `"Código de la app para <correo>: 123456"`.

## Verificar antes de un commit

```bash
npm run typecheck   # tsc
npm test            # el QR del celular coincide con el del servidor
```

## Publicar en las tiendas (EAS)

1. `npx eas-cli@latest login` y `npx eas-cli@latest init` (crea el `projectId` en `app.json`).
   Sin `projectId` los avisos push no se pueden registrar; la app lo dice y sigue funcionando.
2. `npx eas-cli@latest build --platform android --profile production` (y `ios`).
3. Antes de enviar: llenar `[RAZÓN SOCIAL]`, `[NIT]` y `[CORREO DE PRIVACIDAD]` en
   `frontend/app/(legal)/app/page.tsx` y revisar los textos con un abogado. Apple y Google
   exigen la URL de privacidad y el borrado de cuenta dentro de la app (ya está en Perfil).

## Cómo está armada

- `src/app/` rutas (Expo Router). `(tabs)`: Inicio, Clases, Entrenar, Perfil. Fuera de las
  pestañas: `qr` (pantalla completa), `link`, `workout`, `gym-profile`, `payments`, `body`.
- `src/lib/api.ts` cliente con renovación de sesión (token de 30 min + renovación rotativa).
- `src/lib/storage.ts` sesión y llave del QR en Keychain/Keystore (`expo-secure-store`);
  copias para ver sin señal en AsyncStorage (sin la llave del QR).
- `src/lib/qr.ts` QR rotativo, mismo algoritmo que `backend/app/services/app_accounts.py`.
- `src/lib/workouts.ts` entrenos que se guardan sin señal y se suben solos.

Las dependencias con código nativo se instalan con la versión que fija
`node_modules/expo/bundledNativeModules.json` (lo mismo que hace `npx expo install`).
