import { useCallback, useEffect, useRef, useState } from 'react';
import { catalogViaProxy } from '../lib/catalog/endpoint';
import { type LibStatus, lastLibraryStatus, library } from '../lib/catalog/library';
import { ApiError } from '../lib/server/api';
import { useData } from './DataProvider';
import { errorText } from './Toasts';

/**
 * Status des lokalen Katalogs. `null` = nicht verfügbar (Lokalmodus ohne Server
 * oder noch kein Import), `undefined` = wird geprüft.
 */
export function useLibraryStatus(): LibStatus | null | undefined {
  const [s, setS] = useState<LibStatus | null | undefined>(!catalogViaProxy() ? null : lastLibraryStatus ? (lastLibraryStatus.available ? lastLibraryStatus : null) : undefined);
  useEffect(() => {
    if (!catalogViaProxy()) return setS(null);
    let alive = true;
    library
      .status()
      .then((r) => alive && setS(r.available ? r : null))
      .catch(() => alive && setS(null));
    return () => {
      alive = false;
    };
  }, []);
  return s;
}

/** Lädt Daten mit Abbruch bei Parameterwechsel; Fehler als deutscher Text. */
export function useAsync<T>(fn: (signal: AbortSignal) => Promise<T>, deps: unknown[]) {
  const [state, setState] = useState<{ data?: T; loading: boolean; error?: string; notFound?: boolean }>({ loading: true });
  const [nonce, setNonce] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    const c = new AbortController();
    setState((s) => ({ data: s.data, loading: true }));
    fnRef
      .current(c.signal)
      .then((data) => !c.signal.aborted && setState({ data, loading: false }))
      .catch((e) => {
        if (c.signal.aborted) return;
        setState({ loading: false, error: errorText(e), notFound: e instanceof ApiError && e.status === 404 });
      });
    return () => c.abort();
  }, [...deps, nonce]); // eslint-disable-line react-hooks/exhaustive-deps
  const retry = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, retry };
}

/** Gemerkte Breeder (synchronisierte Einstellung). */
export function useFavoriteBreeders() {
  const { settings, updateSettings } = useData();
  const ids = settings.favoriteBreeders;
  const toggle = useCallback(
    (id: string) => updateSettings({ favoriteBreeders: ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id] }),
    [ids, updateSettings],
  );
  return { ids, has: (id: string) => ids.includes(id), toggle };
}

/** Merkt eine angesehene Katalogsorte (nur im eigenen, verschlüsselt synchronisierten Konto). */
export function useRememberCultivar() {
  const { settings, updateSettings } = useData();
  const recent = settings.recentCultivars;
  return useCallback(
    (c: { id: string; name: string; breeder: string }) => {
      if (recent[0]?.id === c.id) return;
      void updateSettings({ recentCultivars: [c, ...recent.filter((r) => r.id !== c.id)].slice(0, 12) });
    },
    [recent, updateSettings],
  );
}
