/*
 * TERPGRID Service Worker – nur die öffentliche App-Hülle (HTML, JS, CSS, Schriften, Icons).
 * NIE gecacht: /api/* (Sitzungen, private Datensätze, Fotos, Exporte, Katalog-Proxy),
 * Antworten mit „Cache-Control: no-store/private“ und fremde Origins. Private Daten liegen
 * ausschließlich in der IndexedDB des jeweiligen Kontos (nur mit Offline-Freigabe dauerhaft),
 * daher kann dieser Cache keine Inhalte zwischen Konten preisgeben.
 *
 * Lebenszyklus (PWA 3.0): Eine neue Version wartet, bis die Nutzerin oder der Nutzer
 * „Aktualisieren“ wählt (Nachricht SKIP_WAITING). So wird nie mitten in einer Eingabe neu geladen.
 */
const VERSION = '__TERPGRID_SW_VERSION__';
const PREFIX = 'terpgrid-shell-';
const CACHE = `${PREFIX}${VERSION}`;
const scope = new URL(self.registration.scope);
const SHELL = ['./', 'index.html', 'manifest.webmanifest', 'favicon.svg', 'icon-192.png', 'apple-touch-icon.png'].map((p) => new URL(p, scope).href);

// Beim Build eingesetzt: gehashte JS-/CSS-/Schrift-Dateien (öffentlich, keine Nutzerdaten)
const PRECACHE = [/*__TERPGRID_PRECACHE__*/].map((p) => new URL(p, scope).href);

const OFFLINE_HTML = `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>TERPGRID · Offline</title>
<style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#07090a;color:#e6ebe8;font:16px/1.5 system-ui,sans-serif;padding:24px;box-sizing:border-box}main{max-width:26rem}h1{font-size:1.25rem}button{font:inherit;padding:.6rem 1rem;border-radius:.6rem;border:0;background:#4ade80;color:#07090a;font-weight:600}</style></head>
<body><main><h1>Keine Verbindung</h1><p>TERPGRID konnte nicht geladen werden und ist auf diesem Gerät noch nicht für die Offline-Nutzung vorbereitet. Öffne die App einmal mit Internetverbindung.</p><button onclick="location.reload()">Erneut versuchen</button></main></body></html>`;

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.addAll(SHELL).then(() => Promise.all(PRECACHE.map((u) => c.add(u).catch(() => {}))))),
  );
  // Kein automatisches skipWaiting: Beim allerersten Besuch gibt es keinen aktiven Worker,
  // dann aktiviert der Browser sofort. Updates warten auf SKIP_WAITING.
});

self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type === 'SKIP_WAITING') self.skipWaiting();
  else if (data.type === 'GET_VERSION' && event.ports[0]) event.ports[0].postMessage({ version: VERSION });
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

/** Nur öffentliche, cachebare Antworten ablegen. */
function cacheable(res) {
  if (!res || !res.ok || res.type !== 'basic') return false;
  const cc = (res.headers.get('Cache-Control') || '').toLowerCase();
  return !cc.includes('no-store') && !cc.includes('private');
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (isPrivate(url)) return; // Browser/Netz direkt – kein Cache
  if (req.mode === 'navigate') {
    // Netz zuerst (Updates), offline die gecachte Hülle, sonst eine schlichte Offline-Seite
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (cacheable(res)) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(new URL('index.html', scope).href, copy));
          }
          return res;
        })
        .catch(() =>
          caches
            .match(new URL('index.html', scope).href, { ignoreVary: true })
            .then((hit) => hit || new Response(OFFLINE_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })),
        ),
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
          if (cacheable(res)) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        }),
    ),
  );
});
