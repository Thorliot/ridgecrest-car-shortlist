/* Service worker for the GitHub Pages snapshot (tools/export_full_snapshot.py fills in VERSION and SHELL).
   - Install: save the page frame (HTML, scripts, styles, icons, Bootstrap/Font Awesome/fonts).
   - Everything else is saved as it's used; the app's "Save for offline" (and its automatic save on launch)
     fetches every car, photo, budget and PDF, which lands here.
   - Notebook audio: the first play also downloads the whole episode in the background, then seeking works
     offline from the saved copy.
   - A new snapshot ships a new VERSION: the old copy is deleted once the new one is installed. */
const VERSION = "20261029161149";
const SHELL = ["./", "manifest.webmanifest", "static/app.js", "static/style.css", "static/snapshot-shim.js", "static/icons/apple-touch-icon.png", "static/icons/icon-192.png", "static/icons/icon-512.png", "static/icons/icon-maskable-512.png", "https://fonts.googleapis.com", "https://fonts.gstatic.com", "https://fonts.googleapis.com/css2?family=Overpass:wght@400;600;800&display=swap", "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/css/bootstrap.min.css", "https://cdn.jsdelivr.net/npm/@fortawesome/fontawesome-free@6.5.2/css/all.min.css", "https://www.nhtsa.gov/recalls", "https://vehiclehistory.bja.ojp.gov/nmvtis_vehiclehistory", "https://www.nicb.org/vincheck", "https://www.carfax.com", "https://www.autocheck.com", "https://www.bar.ca.gov/consumer/smog-check-program", "https://maps.cdtfa.ca.gov/", "https://cdn.jsdelivr.net/npm/bootstrap@5.3.3/dist/js/bootstrap.bundle.min.js"];
const CACHE = `rcf-snapshot-${VERSION}`;
const MEDIA = "rcf-snapshot-media"; // audio is large and rarely changes, so it survives new snapshots
const SCOPE = new URL(self.registration.scope);
const CDN_HOSTS = ["cdn.jsdelivr.net", "fonts.googleapis.com", "fonts.gstatic.com", "cdnjs.cloudflare.com"];

self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await Promise.all(SHELL.map(async (u) => {
      const url = new URL(u, SCOPE);
      try {
        // CDN files are fetched in CORS mode (all of them allow it), so the saved copy can answer both
        // plain <link>/<script> requests and the crossorigin font stylesheet.
        const res = await fetch(url, url.origin === SCOPE.origin ? { cache: "reload" } : { mode: "cors" });
        if (res.ok || res.type === "opaque") await cache.put(key(url), res);
      } catch { /* saved later when used */ }
    }));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("rcf-snapshot-") && k !== CACHE && k !== MEDIA) await caches.delete(k);
    await self.clients.claim();
  })());
});

// Same-origin files are saved without their ?v= build stamp or calculator settings: the cache itself is per build.
function key(url) {
  const u = new URL(url);
  if (u.origin === SCOPE.origin) u.search = "";
  return u.href;
}

async function cacheFirst(req) {
  const cache = await caches.open(CACHE);
  const hit = await cache.match(key(req.url));
  if (hit) return hit;
  const res = await fetch(req);
  if (res.ok || res.type === "opaque") await cache.put(key(req.url), res.clone());
  return res;
}

async function page(req) {
  const cache = await caches.open(CACHE);
  try {
    const res = await fetch(req);
    if (res.ok) await cache.put(SCOPE.href, res.clone());
    return res;
  } catch {
    return (await cache.match(SCOPE.href)) || new Response("Offline and not saved yet.", { status: 503 });
  }
}

async function audio(event) {
  const req = event.request;
  const cache = await caches.open(MEDIA);
  const full = await cache.match(key(req.url));
  if (!full) {
    // Stream this play from the network, and save the whole episode in the background.
    event.waitUntil(fetch(key(req.url)).then((r) => r.ok && r.status === 200 && cache.put(key(req.url), r)).catch(() => {}));
    return fetch(req);
  }
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.get("range") || "");
  if (!range) return full;
  const blob = await full.blob();
  const start = range[1] ? +range[1] : Math.max(0, blob.size - +range[2]);
  const end = range[1] && range[2] ? Math.min(+range[2], blob.size - 1) : blob.size - 1;
  return new Response(blob.slice(start, end + 1), {
    status: 206,
    headers: { "Content-Type": "audio/mp4", "Content-Range": `bytes ${start}-${end}/${blob.size}`,
      "Content-Length": String(end - start + 1), "Accept-Ranges": "bytes" },
  });
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (req.mode === "navigate" && url.href.startsWith(SCOPE.href)) return event.respondWith(page(req));
  if (url.href.startsWith(SCOPE.href) && /\/notebook\/[^/]+\.m4a$/.test(url.pathname)) return event.respondWith(audio(event));
  if (url.href.startsWith(SCOPE.href) || CDN_HOSTS.includes(url.hostname)) event.respondWith(cacheFirst(req));
});
