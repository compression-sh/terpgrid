import { useSyncExternalStore } from 'react';

/**
 * Minimaler Hash-Router (kein Server nötig, funktioniert auch offline/als Datei).
 * Routen: "#/grows/abc?tab=photos" → path ["grows","abc"], query tab=photos
 */
export interface Route {
  path: string[];
  query: URLSearchParams;
  raw: string;
}

function read(): string {
  return typeof window === 'undefined' ? '' : window.location.hash.replace(/^#\/?/, '');
}

export function parseRoute(raw: string): Route {
  const [p = '', q = ''] = raw.split('?');
  return { path: p.split('/').filter(Boolean).map(decodeURIComponent), query: new URLSearchParams(q), raw };
}

let cachedRaw = '';
let cached: Route = parseRoute('');

function subscribe(cb: () => void) {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
}

function snapshot(): Route {
  const raw = read();
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cached = parseRoute(raw);
  }
  return cached;
}

export function useRoute(): Route {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}

export function href(to: string): string {
  return `#/${to.replace(/^\/+/, '')}`;
}

export function navigate(to: string, opts: { replace?: boolean } = {}): void {
  const target = href(to);
  if (opts.replace) window.location.replace(target);
  else window.location.hash = target;
}

/** Query-Parameter ändern, ohne einen neuen History-Eintrag anzulegen. */
export function setQuery(route: Route, patch: Record<string, string | undefined>): void {
  const q = new URLSearchParams(route.query);
  for (const [k, v] of Object.entries(patch)) {
    if (v === undefined || v === '') q.delete(k);
    else q.set(k, v);
  }
  const qs = q.toString();
  navigate(`${route.path.map(encodeURIComponent).join('/')}${qs ? `?${qs}` : ''}`, { replace: true });
}
