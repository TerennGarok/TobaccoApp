// PocketPDF service worker: offline app shell + runtime caching (incl. OCR assets) + share target.
const VERSION = 'v1';
const APP_CACHE = 'app-' + VERSION;
const RUNTIME = 'runtime-' + VERSION;

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(APP_CACHE).then((c) => c.addAll(['./', './index.html', './manifest.webmanifest', './icons/icon.svg', './icons/icon-192.png'])).then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((k) => ![APP_CACHE, RUNTIME, 'share-inbox'].includes(k)).map((k) => caches.delete(k)))).then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Web Share Target: stash shared files, then open the app.
  if (req.method === 'POST' && url.pathname.endsWith('/share-target')) {
    e.respondWith((async () => {
      const form = await req.formData();
      const files = form.getAll('files');
      const cache = await caches.open('share-inbox');
      let i = 0;
      for (const f of files) {
        if (!(f instanceof File)) continue;
        await cache.put(new Request('./shared/' + Date.now() + '-' + i++), new Response(f, { headers: { 'content-type': f.type, 'x-filename': encodeURIComponent(f.name) } }));
      }
      return Response.redirect('./?share-target=1', 303);
    })());
    return;
  }
  if (req.method !== 'GET') return;

  // Navigations: network first, fall back to cached shell.
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then((res) => {
        const copy = res.clone();
        caches.open(APP_CACHE).then((c) => c.put('./index.html', copy));
        return res;
      }).catch(() => caches.match('./index.html').then((r) => r || caches.match('./'))),
    );
    return;
  }

  const sameOrigin = url.origin === self.location.origin;
  const ocrAsset = /cdn\.jsdelivr\.net|unpkg\.com|tessdata/.test(url.href);
  if (!sameOrigin && !ocrAsset) return;

  // Cache-first for hashed assets, OCR engine & language data.
  e.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        if (res.ok && (res.type === 'basic' || res.type === 'cors')) {
          const copy = res.clone();
          caches.open(RUNTIME).then((c) => c.put(req, copy));
        }
        return res;
      });
    }),
  );
});
