/*
 * TERPGRID Service Worker – nur die öffentliche App-Hülle (HTML, JS, CSS, Schriften, Icons).
 * NIE gecacht: /api/* (Sitzungen, private Datensätze, Fotos, Exporte, Katalog-Proxy) und
 * fremde Origins. Private Daten liegen ausschließlich in der IndexedDB des jeweiligen Kontos,
 * daher kann der Cache keine Inhalte zwischen Konten preisgeben.
 */
const VERSION = '__TERPGRID_SW_VERSION__';
const CACHE = `terpgrid-shell-${VERSION}`;
const scope = new URL(self.registration.scope);
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'favicon.svg', 'icon-192.png'].map((p) => new URL(p, scope).href);

// Beim Build eingesetzt: gehashte JS-/CSS-/Schrift-Dateien (öffentlich, keine Nutzerdaten)
const PRECACHE = [/*__TERPGRID_PRECACHE__*/].map((p) => new URL(p, scope).href);

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(SHELL).then(() => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => {})))))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('terpgrid-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

function isPrivate(url) {
  return url.origin !== scope.origin || url.pathname.startsWith('/api/') || url.pathname.includes('/api/');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (isPrivate(url)) return; // Browser/Netz direkt – kein Cache
  if (req.mode === 'navigate') {
    // Netz zuerst (Updates), offline die gecachte Hülle
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) caches.open(CACHE).then((c) => c.put(new URL('index.html', scope).href, res.clone()));
          return res;
        })
        .catch(() => caches.match(new URL('index.html', scope).href, { ignoreVary: true })),
    );
    return;
  }
  // Statische Dateien (Dateinamen mit Hash): Cache zuerst. ignoreVary: öffentliche, unveränderliche
  // Dateien – ein „Vary: Origin“ des Servers darf den Treffer nicht verhindern (Modul-Skripte senden Origin).
  event.respondWith(
    caches.match(req, { ignoreVary: true }).then(
      (hit) =>
        hit ||
        fetch(req).then((res) => {
          if (res.ok && res.type === 'basic') {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
