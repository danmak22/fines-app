// Service worker: keeps a copy of the app on the phone so it opens
// with no signal. Data calls (/rest/...) are never cached here.

const CACHE = 'fines-shell-v2';
const SHELL = [
  './',
  'index.html',
  'vendor/supabase.js',
  'manifest.webmanifest',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
];
const shellUrls = SHELL.map((p) => new URL(p, self.location).href);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) {
      if (key !== CACHE) await caches.delete(key);
    }
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  url.search = '';

  // The page itself: use the network if it answers within 3s so updates
  // show up, otherwise open the saved copy. A blocked or weak network can
  // hang for minutes rather than failing, so don't wait for it.
  if (req.mode === 'navigate') {
    const network = fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(shellUrls[0], copy));
      }
      return res;
    });
    event.waitUntil(network.catch(() => {}));
    event.respondWith((async () => {
      const saved = await caches.match(shellUrls[0]);
      if (!saved) return network;
      const timeout = new Promise((resolve) => setTimeout(() => resolve(saved), 3000));
      return Promise.race([network.catch(() => saved), timeout]);
    })());
    return;
  }

  // Other app files: saved copy first, network if missing.
  if (shellUrls.includes(url.href)) {
    event.respondWith(caches.match(url.href).then((hit) => hit || fetch(req)));
  }
});
