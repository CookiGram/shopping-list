/* Shopping List v0 — service worker (Lane B).
 * App-shell offline cache. Mirrors CookiGram's `sw.js` precache pattern
 * with our own cache name. Catalog refreshes bust the cache: the token
 * below tracks the synced catalog ref (first 7 of the SHA in
 * data/cookigram-catalog.json meta.source.ref); the catalog sync lane
 * bumps it on every refresh.
 */
const CATALOG_REF7 = "656f2f0";
const CACHE = `shopping-list-${CATALOG_REF7}`;

const PRECACHE = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./css/tokens.css",
  "./css/app.css",
  "./js/app.js",
  "./js/catalog.js",
  "./js/components.js",
  "./js/history.js",
  "./js/list.js",
  "./js/search.js",
  "./js/staples.js",
  "./js/store.js",
  "./js/tags.js",
  "./js/voice.js",
  "./data/cookigram-catalog.json",
  "./data/shopping-dict.json",
  "./data/dictionary/non-food.fr.json",
  "./data/aisles.json",
  "./icons/icon.svg",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./assets/illustrations/empty-basket.svg",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE).then(async (cache) => {
      // addAll fails atomically; add one-by-one so a lane that has not
      // landed yet (e.g. js/app.js) does not break the install.
      const results = await Promise.allSettled(
        PRECACHE.map((url) => cache.add(url)),
      );
      const failed = PRECACHE.filter((_, i) => results[i].status === "rejected");
      if (failed.length) console.warn("[sw] precache skipped:", failed.join(", "));
    }).then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  // Navigations: network-first, offline fallback to the app shell.
  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put("./index.html", copy));
          return response;
        })
        .catch(() => caches.match("./index.html", { ignoreSearch: true })),
    );
    return;
  }

  // Same-origin assets + catalog snapshot: cache-first, refresh in background.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(request, { ignoreSearch: false }).then((cached) => {
        const network = fetch(request).then((response) => {
          if (response && response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        }).catch(() => cached);
        return cached || network;
      }),
    );
  }
});
