/* LSMFit: service worker de recepción sin conexión.
 *
 * - Archivos de /_next/static (llevan hash en el nombre): primero la caché.
 * - Páginas: primero la red; sin red, la última copia de esa página.
 * - /api/auth/session: primero la red; sin red, la última sesión válida SIN el
 *   token de acceso (quién es y su rol). Sin esto NextAuth deja la pantalla sin
 *   sesión durante el corte y no la recupera al volver la red hasta recargar.
 *   Al volver la red, OfflineProvider pide la sesión completa de nuevo.
 * - Todo lo demás (API del backend, otros orígenes): no se toca. Los datos para
 *   operar sin red viven cifrados en IndexedDB (lib/offline), no aquí.
 */
const VERSION = "fc-v2";
const STATIC = `${VERSION}-static`;
const PAGES = `${VERSION}-pages`;
const SESSION = `${VERSION}-session`;
const OFFLINE_ROUTES = ["/checkins", "/dashboard", "/members"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(PAGES).then((c) => Promise.all(OFFLINE_ROUTES.map((r) => c.add(r).catch(() => undefined)))),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k)))),
  );
  self.clients.claim();
});

self.addEventListener("message", (event) => {
  // Al cerrar sesión no debe quedar una sesión guardada en el equipo.
  if (event.data === "logout") event.waitUntil(caches.delete(SESSION));
});

/** Lo que se guarda de la sesión: quién es y qué puede hacer, nunca el token. */
async function sanitizedSession(response) {
  try {
    const data = await response.clone().json();
    if (data && typeof data === "object") {
      delete data.accessToken;
      delete data.error;
    }
    return new Response(JSON.stringify(data), { headers: { "Content-Type": "application/json" } });
  } catch {
    return null;
  }
}

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const response = await fetch(request);
    if (response.ok) {
      if (cacheName === SESSION) {
        const clean = await sanitizedSession(response);
        if (clean) cache.put(request, clean);
      } else {
        cache.put(request, response.clone());
      }
    }
    return response;
  } catch (err) {
    const hit = await cache.match(request, { ignoreSearch: cacheName === PAGES });
    if (hit) return hit;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(STATIC);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") {
    if (new URL(request.url).pathname.startsWith("/api/auth/signout")) {
      event.waitUntil(caches.delete(SESSION));
    }
    return;
  }
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname === "/api/auth/session") {
    event.respondWith(networkFirst(request, SESSION));
    return;
  }
  if (url.pathname.startsWith("/_next/static/") || /\.(?:woff2?|png|svg|ico)$/.test(url.pathname)) {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (url.pathname.startsWith("/api/")) return;
  if (request.mode === "navigate" || request.headers.get("RSC") === "1") {
    event.respondWith(networkFirst(request, PAGES));
  }
});
