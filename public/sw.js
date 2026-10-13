/* STRIDE service worker — offline app shell + map tile caching.
 * Strategies:
 *   - navigation requests: network-first, cache fallback, offline.html last
 *   - static assets (/_next/static, /brand, /icons, images, fonts): network-first,
 *     cached copy as offline fallback (dev-safe: chunk URLs aren't content-hashed)
 *   - map tiles (ArcGIS): stale-while-revalidate (bounded LRU-ish trim)
 *   - session check (/api/auth/me): network-first with offline fallback
 *   - /api/* (other): pass through to the network (never cached)
 */
const VERSION = "stride-v3";
const SHELL_CACHE = `${VERSION}-shell`;
const ASSET_CACHE = `${VERSION}-assets`;
const TILE_CACHE = `${VERSION}-tiles`;
const TILE_LIMIT = 600;
const PRECACHE = ["/", "/offline.html", "/manifest.webmanifest", "/logo-mark.svg"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) =>
      Promise.allSettled(PRECACHE.map((url) => cache.add(new Request(url, { cache: "reload" }))))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => !k.startsWith(VERSION)).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const isMapTile = (url) =>
  url.hostname.endsWith("arcgisonline.com") &&
  url.pathname.includes("/MapServer/tile/");

const isStaticAsset = (url) =>
  url.origin === self.location.origin &&
  (url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/brand/") ||
    url.pathname.startsWith("/icons/") ||
    /\.(?:png|jpg|jpeg|svg|webp|ico|woff2?|ttf|css|js|webmanifest)$/.test(url.pathname));

async function trimCache(cacheName, maxEntries) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length > maxEntries) {
    // delete oldest entries (Map preserves insertion order)
    await Promise.all(keys.slice(0, keys.length - maxEntries).map((k) => cache.delete(k)));
  }
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.protocol !== "https:" && url.protocol !== "http:") return; // skip ws:// etc.

  // session check: network-first, serve the last known session when offline,
  // drop the cached copy the moment the server says 401
  if (url.origin === self.location.origin && url.pathname === "/api/auth/me") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const cache = caches.open(SHELL_CACHE);
          if (res.ok) cache.then((c) => c.put(req, res.clone()));
          else if (res.status === 401) cache.then((c) => c.delete(req));
          return res;
        })
        .catch(async () => (await caches.match(req)) || Response.error())
    );
    return;
  }
  if (url.origin === self.location.origin && url.pathname.startsWith("/api/")) return; // never cache other API routes

  // navigations: network-first with cache + offline fallback
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(SHELL_CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(async () => {
          const cached = await caches.match(req);
          return cached || caches.match("/offline.html");
        })
    );
    return;
  }

  // map tiles: stale-while-revalidate
  if (isMapTile(url)) {
    event.respondWith(
      caches.open(TILE_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        const network = fetch(req)
          .then((res) => {
            if (res.ok || res.type === "opaque") {
              cache.put(req, res.clone()).then(() => trimCache(TILE_CACHE, TILE_LIMIT));
            }
            return res;
          })
          .catch(() => null);
        return cached || (await network) || Response.error();
      })
    );
    return;
  }

  // same-origin static assets: network-first, cache fallback (offline).
  // NOT cache-first: dev chunk URLs aren't content-hashed, so cache-first
  // would forever serve stale JS after a rebuild.
  if (isStaticAsset(url)) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const cached = await cache.match(req);
        try {
          const res = await fetch(req);
          if (res.ok) cache.put(req, res.clone());
          return res;
        } catch {
          return cached || Response.error();
        }
      })
    );
  }
  // everything else: default network behavior (no respondWith)
});

// allow the page to skip waiting on new SW versions
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
