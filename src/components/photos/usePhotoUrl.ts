import { useEffect, useState } from 'react';
import { getOne } from '../../lib/db/database';

/**
 * Objekt-URLs für lokal gespeicherte Bilder mit kleinem LRU-Cache.
 * URLs werden beim Verdrängen aus dem Cache wieder freigegeben.
 */
const MAX = 160;
const cache = new Map<string, string>();
const inflight = new Map<string, Promise<string | null>>();

function remember(key: string, url: string) {
  cache.set(key, url);
  while (cache.size > MAX) {
    const [oldKey, oldUrl] = cache.entries().next().value as [string, string];
    cache.delete(oldKey);
    setTimeout(() => URL.revokeObjectURL(oldUrl), 30_000);
  }
}

export function loadPhotoUrl(id: string, variant: 'thumb' | 'full'): Promise<string | null> {
  const key = `${id}:${variant}`;
  const hit = cache.get(key);
  if (hit) {
    cache.delete(key);
    cache.set(key, hit);
    return Promise.resolve(hit);
  }
  let p = inflight.get(key);
  if (!p) {
    p = getOne('photoData', id)
      .then((d) => {
        if (!d) return null;
        const url = URL.createObjectURL(new Blob([variant === 'thumb' ? d.thumb : d.full], { type: d.mime }));
        remember(key, url);
        return url;
      })
      .catch(() => null)
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

export function forgetPhoto(id: string) {
  for (const v of ['thumb', 'full']) {
    const key = `${id}:${v}`;
    const url = cache.get(key);
    if (url) {
      cache.delete(key);
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    }
  }
}

export function usePhotoUrl(id: string | undefined, variant: 'thumb' | 'full' = 'thumb'): { url: string | null; loading: boolean } {
  const [state, setState] = useState<{ url: string | null; loading: boolean }>(() => {
    const hit = id ? cache.get(`${id}:${variant}`) : undefined;
    return { url: hit ?? null, loading: !!id && !hit };
  });
  useEffect(() => {
    if (!id) {
      setState({ url: null, loading: false });
      return;
    }
    let alive = true;
    const hit = cache.get(`${id}:${variant}`);
    if (hit) setState({ url: hit, loading: false });
    else {
      setState((s) => ({ url: s.url, loading: true }));
      loadPhotoUrl(id, variant).then((url) => alive && setState({ url, loading: false }));
    }
    return () => {
      alive = false;
    };
  }, [id, variant]);
  return state;
}

/** Gibt alle Bild-URLs frei (Abmelden/Kontowechsel – keine Bilder des vorherigen Kontos im Speicher). */
export function clearPhotoUrlCache(): void {
  for (const url of cache.values()) URL.revokeObjectURL(url);
  cache.clear();
  inflight.clear();
}
