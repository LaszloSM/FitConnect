/**
 * URL pública del sitio para metadatos, sitemap y datos estructurados. En
 * producción el frontend y la API comparten dominio (NEXT_PUBLIC_API_URL =
 * PUBLIC_URL), así que al poner el dominio propio todo esto lo sigue solo.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:3000").replace(/\/+$/, "");
