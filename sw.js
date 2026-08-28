/* Service worker: the app shell is cached on install so it opens with no network at all.
   Bump CACHE when you change any shell file, or browsers will serve the old one. */
const CACHE = "glider-wb-v3";
// Bump CACHE above on every shell change; the app ships from main on push,
// so a forgotten bump leaves phones on the previous build.
const SHELL = [
  "./", "./index.html", "./manifest.webmanifest",
  "./icon-192.png", "./icon-512.png", "./icon-180.png",
  "./icon-maskable-512.png", "./js3-profile.json"
];

self.addEventListener("install", (e) => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => Promise.allSettled(SHELL.map(u => c.add(u))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;                 // never cache sync POSTs
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;       // let the sync server pass through

  // Shell: cache first, so an airfield with no signal still opens the app instantly.
  e.respondWith(
    caches.match(req).then(hit => {
      // Revalidate against the server, not the browser's HTTP cache: a stale
      // hit there would be written straight back into this cache, pinning the
      // old build in place. Still cache-first, so offline is unaffected.
      const net = fetch(req, { cache: "no-cache" }).then(res => {
        if (res && res.status === 200 && res.type === "basic")
          caches.open(CACHE).then(c => c.put(req, res.clone()));
        return res;
      }).catch(() => hit);
      return hit || net;
    })
  );
});
