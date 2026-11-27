import { type ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { catalog } from '../lib/catalog/service';
import { type CatalogPage, type CatalogStrain, CatalogError } from '../lib/catalog/types';
import { ensureStrainForExternal, externalKey } from '../lib/db/repo';
import type { Strain } from '../lib/db/types';
import { useData } from './DataProvider';
import { errorText, useToast } from './Toasts';
import { t } from '../i18n';

/** Synchronisiert die Einstellung „Online-Sortendaten“ mit dem Katalog-Service. */
export function useCatalogOnlineSync() {
  const { settings } = useData();
  useEffect(() => {
    catalog.setOnline(() => settings.onlineCatalog && (typeof navigator === 'undefined' || navigator.onLine !== false));
  }, [settings.onlineCatalog]);
  useEffect(() => {
    catalog.pruneCache();
  }, []);
}

export function catalogErrorText(e: unknown): string {
  if (e instanceof CatalogError) return e.message;
  return errorText(e);
}

/* ───────────── Suche mit Debounce, Abbruch und "Mehr laden" ───────────── */

export interface SearchState {
  items: CatalogStrain[];
  total: number;
  totalPages: number;
  page: number;
  loading: boolean;
  loadingMore: boolean;
  error?: string;
  errorKind?: CatalogError['kind'];
  fromCache: boolean;
  fetchedAt?: string;
  /** true = alle Treffer der Quelle sind geladen */
  complete: boolean;
  progress?: { loaded: number; total: number };
}

const PER_PAGE = 24;
/** Suche: bis zu 3 × 100 Treffer vorab laden, damit nach Relevanz sortiert werden kann */
const SEARCH_PAGES = 3;

export function useStrainSearch(query: string, debounceMs = 350) {
  const [state, setState] = useState<SearchState>({ items: [], total: 0, totalPages: 0, page: 0, loading: true, loadingMore: false, fromCache: false, complete: false });
  const ctrl = useRef<AbortController | null>(null);
  const q = query.trim();

  const apply = (p: CatalogPage, append: boolean) =>
    setState((s) => {
      const items = append ? [...new Map([...s.items, ...p.items].map((i) => [i.key, i])).values()] : p.items;
      return {
        items,
        total: p.total,
        totalPages: p.totalPages,
        page: p.page,
        loading: false,
        loadingMore: false,
        fromCache: (append && s.fromCache) || p.fromCache,
        fetchedAt: append && s.fetchedAt && s.fetchedAt < p.fetchedAt ? s.fetchedAt : p.fetchedAt,
        complete: p.page >= p.totalPages || items.length >= p.total,
      };
    });

  const fail = (e: unknown) => {
    if (e instanceof CatalogError && e.kind === 'aborted') return;
    setState((s) => ({ ...s, loading: false, loadingMore: false, error: catalogErrorText(e), errorKind: e instanceof CatalogError ? e.kind : undefined, progress: undefined }));
  };

  useEffect(() => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    // Neue Anfrage: alte Treffer verwerfen, damit Fehler/Leere nicht mit alten Ergebnissen verwechselt werden.
    setState({ items: [], total: 0, totalPages: 0, page: 0, loading: true, loadingMore: false, fromCache: false, complete: false });
    const t = window.setTimeout(
      () => {
        (q ? catalog.searchTop(q, SEARCH_PAGES, c.signal) : catalog.list(1, PER_PAGE, c.signal)).then((p) => !c.signal.aborted && apply(p, false)).catch(fail);
      },
      q ? debounceMs : 0,
    );
    return () => {
      window.clearTimeout(t);
      c.abort();
    };
  }, [q, debounceMs]);

  const loadMore = useCallback(() => {
    if (state.loadingMore || state.complete) return;
    const c = ctrl.current ?? new AbortController();
    setState((s) => ({ ...s, loadingMore: true, error: undefined }));
    const next = state.page + 1;
    (q ? catalog.search(q, next, 100, c.signal) : catalog.list(next, PER_PAGE, c.signal)).then((p) => !c.signal.aborted && apply(p, true)).catch(fail);
  }, [q, state.page, state.loadingMore, state.complete]);

  /** Alle Treffer laden (für vollständige lokale Filter). Nur auf Nutzerwunsch. */
  const loadAll = useCallback(async () => {
    const c = ctrl.current ?? new AbortController();
    setState((s) => ({ ...s, loadingMore: true, error: undefined, progress: { loaded: s.items.length, total: s.total } }));
    try {
      if (!q) {
        const all = await catalog.loadAll((loaded, total) => setState((s) => ({ ...s, progress: { loaded, total } })), c.signal);
        if (c.signal.aborted) return;
        setState((s) => ({ ...s, items: all.items, total: all.total, page: Math.ceil(all.total / 100), totalPages: Math.ceil(all.total / 100), loadingMore: false, complete: true, fromCache: all.fromCache, fetchedAt: all.fetchedAt, progress: undefined }));
      } else {
        const first = await catalog.search(q, 1, 100, c.signal);
        const items = [...first.items];
        setState((s) => ({ ...s, progress: { loaded: items.length, total: first.total } }));
        for (let p = 2; p <= first.totalPages; p++) {
          const page = await catalog.search(q, p, 100, c.signal);
          items.push(...page.items);
          setState((s) => ({ ...s, progress: { loaded: items.length, total: first.total } }));
        }
        if (c.signal.aborted) return;
        const unique = [...new Map(items.map((i) => [i.key, i])).values()];
        setState((s) => ({ ...s, items: unique, total: first.total, page: first.totalPages, totalPages: first.totalPages, loadingMore: false, complete: true, fromCache: first.fromCache, fetchedAt: first.fetchedAt, progress: undefined }));
      }
    } catch (e) {
      fail(e);
    }
  }, [q]);

  const retry = useCallback(() => {
    setState((s) => ({ ...s, loading: true, error: undefined }));
    const c = new AbortController();
    ctrl.current = c;
    (q ? catalog.search(q, 1, PER_PAGE, c.signal) : catalog.list(1, PER_PAGE, c.signal)).then((p) => apply(p, false)).catch(fail);
  }, [q]);

  return { ...state, loadMore, loadAll, retry, perPage: PER_PAGE };
}

/* ───────────── Detail ───────────── */

export function useStrainDetail(slug: string | undefined) {
  const [state, setState] = useState<{ strain?: CatalogStrain; loading: boolean; error?: string; errorKind?: string; fromCache: boolean; fetchedAt?: string }>({ loading: true, fromCache: false });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!slug) return;
    const c = new AbortController();
    setState((s) => ({ ...s, loading: true, error: undefined }));
    catalog
      .detail(slug, c.signal)
      .then((r) => setState({ strain: r.strain, loading: false, fromCache: r.fromCache, fetchedAt: r.fetchedAt }))
      .catch((e) => {
        if (e instanceof CatalogError && e.kind === 'aborted') return;
        setState({ loading: false, error: catalogErrorText(e), errorKind: e instanceof CatalogError ? e.kind : undefined, fromCache: false });
      });
    return () => c.abort();
  }, [slug, nonce]);
  return { ...state, retry: () => setNonce((n) => n + 1) };
}

/* ───────────── Persönliche Verknüpfungen (Favoriten) ───────────── */

export function seedFromCatalog(s: CatalogStrain) {
  const reportedType = s.typeClass === 'unknown' ? undefined : s.typeClass;
  return {
    provider: s.provider,
    id: s.id,
    name: s.name,
    breeder: s.breeder,
    genetics: s.genetics,
    url: s.attribution.recordUrl,
    reportedType,
    // Bereiche werden nicht in einen Einzelwert umgedeutet – nur echte Einzelwerte übernehmen.
    thc: s.thc?.value !== undefined ? { value: s.thc.value } : undefined,
    cbd: s.cbd?.value !== undefined ? { value: s.cbd.value } : undefined,
    terpenes: s.terpenes,
    aromas: s.aroma.map((a) => a.toLowerCase()),
  };
}

export function useLinkedStrains() {
  const { data } = useData();
  return useMemo(() => {
    const map = new Map<string, Strain>();
    for (const s of data.strains) if (s.externalKey) map.set(s.externalKey, s);
    return map;
  }, [data.strains]);
}

export function useFavoriteToggle() {
  const linked = useLinkedStrains();
  const toast = useToast();
  return useCallback(
    async (s: CatalogStrain) => {
      const existing = linked.get(externalKey(s.provider, s.id));
      try {
        if (existing) {
          await ensureStrainForExternal(seedFromCatalog(s), { favorite: !existing.favorite });
          toast(existing.favorite ? t('discover.fav.removed', { name: s.name }) : t('discover.fav.saved', { name: s.name }));
        } else {
          await ensureStrainForExternal(seedFromCatalog(s), { favorite: true });
          toast(t('discover.fav.added', { name: s.name }));
        }
      } catch (e) {
        toast(errorText(e), { tone: 'error' });
      }
    },
    [linked, toast],
  );
}

/* ───────────── Vergleich (eine gemeinsame Ablage für Online- und eigene Sorten) ───────────── */

/** Schlüssel: "strainapi:<slug>" oder "mine:<id>" */
interface CompareState {
  keys: string[];
  toggle: (key: string) => void;
  remove: (key: string) => void;
  clear: () => void;
  has: (key: string) => boolean;
}

const CompareCtx = createContext<CompareState | null>(null);
export const MAX_COMPARE = 4;
const STORE_KEY = 'terpgrid.compare.v1';

export function CompareProvider({ children }: { children: ReactNode }) {
  const toast = useToast();
  const [keys, setKeys] = useState<string[]>(() => {
    try {
      const v = JSON.parse(sessionStorage.getItem(STORE_KEY) ?? '[]');
      return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, MAX_COMPARE) : [];
    } catch {
      return [];
    }
  });
  useEffect(() => {
    try {
      sessionStorage.setItem(STORE_KEY, JSON.stringify(keys));
    } catch {
      /* ignore */
    }
  }, [keys]);
  const value = useMemo<CompareState>(
    () => ({
      keys,
      has: (k) => keys.includes(k),
      toggle: (k) =>
        setKeys((s) => {
          if (s.includes(k)) return s.filter((x) => x !== k);
          if (s.length >= MAX_COMPARE) {
            toast(t('discover.compareMax', { n: MAX_COMPARE }), { tone: 'info' });
            return s;
          }
          return [...s, k];
        }),
      remove: (k) => setKeys((s) => s.filter((x) => x !== k)),
      clear: () => setKeys([]),
    }),
    [keys, toast],
  );
  return <CompareCtx.Provider value={value}>{children}</CompareCtx.Provider>;
}

export function useCompare(): CompareState {
  const v = useContext(CompareCtx);
  if (!v) throw new Error('useCompare außerhalb von CompareProvider');
  return v;
}

/* ───────────── Vollständiger Katalog (nur auf ausdrücklichen Wunsch) ───────────── */

interface FullState {
  items: CatalogStrain[];
  loading: boolean;
  loaded: boolean;
  progress?: { loaded: number; total: number };
  error?: string;
  fromCache: boolean;
  fetchedAt?: string;
}

let fullState: FullState = { items: [], loading: false, loaded: false, fromCache: false };
const fullListeners = new Set<() => void>();
const setFull = (patch: Partial<FullState>) => {
  fullState = { ...fullState, ...patch };
  fullListeners.forEach((l) => l());
};

export async function loadFullCatalog(): Promise<void> {
  if (fullState.loading || fullState.loaded) return;
  setFull({ loading: true, error: undefined });
  try {
    const all = await catalog.loadAll((loaded, total) => setFull({ progress: { loaded, total } }));
    setFull({ items: all.items, loaded: true, loading: false, fromCache: all.fromCache, fetchedAt: all.fetchedAt, progress: undefined });
    try {
      sessionStorage.setItem('terpgrid.fullCatalog', '1');
    } catch {
      /* ignore */
    }
  } catch (e) {
    setFull({ loading: false, error: catalogErrorText(e), progress: undefined });
  }
}

/** Gemeinsamer, sitzungsweiter Gesamtkatalog für Atlas, Galerie und Vergleich. */
export function useFullCatalog() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    fullListeners.add(l);
    // Wurde in dieser Sitzung bereits geladen → aus dem Cache wiederherstellen
    try {
      if (!fullState.loaded && !fullState.loading && sessionStorage.getItem('terpgrid.fullCatalog') === '1') loadFullCatalog();
    } catch {
      /* ignore */
    }
    return () => {
      fullListeners.delete(l);
    };
  }, []);
  return { ...fullState, load: loadFullCatalog };
}
