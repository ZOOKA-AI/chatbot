/*
 * ZOOKA-AI service worker.
 *
 * Deliberately small and dependency-free (no Workbox, no build step):
 *  - navigation requests: network first, cached copy as fallback, then /offline.html
 *  - static assets under /_next/static, /icons, /images and fonts: cache first
 *  - everything else (API routes, auth, admin, POST/PUT/DELETE) is never touched
 *
 * The worker is registered only in production from components/pwa-register.tsx,
 * so a stale cache can never shadow a development build.
 */

const VERSION = "zooka-v1";
const STATIC_CACHE = `${VERSION}-static`;
const PAGE_CACHE = `${VERSION}-pages`;
const OFFLINE_URL = "/offline.html";

// Assets needed for an offline shell. Kept minimal on purpose.
const PRECACHE = [
  OFFLINE_URL,
  "/icons/icon-192.png",
  "/icons/icon-512.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(STATIC_CACHE);
      await cache.addAll(PRECACHE.map((url) => new Request(url, { cache: "reload" })));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys.filter((key) => !key.startsWith(VERSION)).map((key) => caches.delete(key)),
      );
      await self.clients.claim();
    })(),
  );
});

function isCacheableStatic(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname.startsWith("/images/") ||
    url.pathname.startsWith("/fonts/") ||
    /\.(?:css|js|png|jpg|jpeg|webp|avif|svg|woff2?|ico)$/.test(url.pathname)
  );
}

function isBypassed(url) {
  return (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/admin") ||
    url.pathname.startsWith("/stripe") ||
    url.pathname.startsWith("/webhooks/") ||
    url.pathname.startsWith("/manifest.webmanifest")
  );
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (isBypassed(url)) return;

  // Pages: network first so signed-in content is never stale, cache as fallback.
  if (request.mode === "navigate") {
    event.respondWith(
      (async () => {
        try {
          const fresh = await fetch(request);
          const cache = await caches.open(PAGE_CACHE);
          cache.put(request, fresh.clone());
          return fresh;
        } catch {
          const cached = await caches.match(request);
          if (cached) return cached;
          const offline = await caches.match(OFFLINE_URL);
          if (offline) return offline;
          return new Response("offline", { status: 503, statusText: "offline" });
        }
      })(),
    );
    return;
  }

  // Static assets: cache first.
  if (isCacheableStatic(url)) {
    event.respondWith(
      (async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        const fresh = await fetch(request);
        if (fresh && fresh.status === 200) {
          const cache = await caches.open(STATIC_CACHE);
          cache.put(request, fresh.clone());
        }
        return fresh;
      })(),
    );
  }
});
