/** URL del backend. En el celular de desarrollo, la IP del PC en la red local. */
export const API_URL = (process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:8000").replace(/\/$/, "");
/** Sitio web de FitConnect (páginas legales). */
export const WEB_URL = (process.env.EXPO_PUBLIC_WEB_URL ?? "http://localhost:3000").replace(/\/$/, "");
export const LEGAL_URL = `${WEB_URL}/app`;
