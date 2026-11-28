import { BottomSheet } from '../../components/ui/BottomSheet';
import { Bookmark, ChevronDown, Clock, Database, Loader2, RotateCcw, Search, SlidersHorizontal, Sprout, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useData } from '../../app/DataProvider';
import { useFavoriteBreeders } from '../../app/library';
import { href, setQuery, useRoute } from '../../app/router';
import { DiscoverNav } from '../../components/discover/DiscoverNav';
import { DatasetNotice } from '../../components/discover/DatasetNotice';
import { StrainCard, StrainCardSkeleton } from '../../components/discover/StrainCard';
import { Callout } from '../../components/ui/Callout';
import { EmptyState } from '../../components/ui/EmptyState';
import { type LibSearchParams, type LibSearchResult, type LibStatus, MATCH_LABEL, type MatchTier, library, toCatalogStrain } from '../../lib/catalog/library';
import { TERPENES } from '../../lib/catalog/terpenes';
import { fmt } from '../../lib/format';
import { errorText } from '../../app/Toasts';
import { t } from '../../i18n';

const PER_PAGE = 24;
const TIERS: MatchTier[] = ['exact', 'prefix', 'name', 'related', 'similar'];
const SORTS = [
  { id: 'relevance', get label() { return t('discover.lb.sRel'); }, needsQuery: true },
  { id: 'name', get label() { return t('discover.lb.sName'); } },
  { id: 'breeder', get label() { return t('discover.lb.sBreeder'); } },
  { id: 'thc', get label() { return t('discover.lb.sThc'); } },
  { id: 'listings', get label() { return t('discover.lb.sListings'); } },
] as const;

const FILTER_KEYS = ['type', 'auto', 'seed', 'lineage', 'thc', 'terpene', 'parent'] as const;

/**
 * Lokal indexierter Katalog (CI-Strains-Pro). Suche, Filter, Sortierung und Gesamtzahlen
 * laufen serverseitig über den kompletten Datensatz – angezeigte Summen sind vollständig.
 */
export function LibraryPage({ status }: { status: LibStatus }) {
  const route = useRoute();
  const q = route.query;
  const { settings } = useData();
  const favBreeders = useFavoriteBreeders();
  const [text, setText] = useState(q.get('q') ?? '');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const query = (q.get('q') ?? '').trim();
  const params: LibSearchParams = useMemo(
    () => ({
      q: query || undefined,
      type: (['indica', 'sativa', 'balanced'] as const).find((tv) => tv === q.get('type')),
      auto: q.get('auto') === '1' ? '1' : q.get('auto') === '0' ? '0' : undefined,
      seed: q.get('seed') === 'feminisiert' || q.get('seed') === 'regulär' ? (q.get('seed') as 'feminisiert' | 'regulär') : undefined,
      lineage: q.get('lineage') === '1' ? '1' : undefined,
      thc: q.get('thc') === '1' ? '1' : undefined,
      samples: q.get('samples') === '1' ? '1' : undefined,
      terpene: q.get('terpene') || undefined,
      parent: q.get('parent') || undefined,
      sort: (SORTS.find((s) => s.id === q.get('sort') && (!('needsQuery' in s) || query))?.id ?? (query ? 'relevance' : 'listings')) as LibSearchParams['sort'],
    }),
    [route.raw], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const key = JSON.stringify(params);
  const [res, setRes] = useState<{ key: string; data?: LibSearchResult; loading: boolean; more: boolean; error?: string }>({ key: '', loading: true, more: false });
  const ctrl = useRef<AbortController | null>(null);

  // Suchfeld → URL (verzögert, verlinkbar)
  useEffect(() => {
    const tv = window.setTimeout(() => {
      if ((q.get('q') ?? '') !== text.trim()) setQuery(route, { q: text.trim() || undefined });
    }, 300);
    return () => window.clearTimeout(tv);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if ((q.get('q') ?? '') !== text.trim()) setText(q.get('q') ?? '');
  }, [q.get('q')]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setRes((r) => ({ key, data: r.data, loading: true, more: false }));
    library
      .search({ ...params, page: 1, perPage: PER_PAGE }, c.signal)
      .then((data) => !c.signal.aborted && setRes({ key, data, loading: false, more: false }))
      .catch((e) => !c.signal.aborted && setRes({ key, loading: false, more: false, error: errorText(e) }));
    return () => c.abort();
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadMore = () => {
    const d = res.data;
    if (!d || d.page >= d.totalPages || res.more) return;
    setRes((r) => ({ ...r, more: true }));
    library
      .search({ ...params, page: d.page + 1, perPage: PER_PAGE })
      .then((n) => setRes((r) => (r.key === key && r.data ? { ...r, more: false, data: { ...n, items: [...r.data.items, ...n.items] } } : r)))
      .catch((e) => setRes((r) => ({ ...r, more: false, error: errorText(e) })));
  };

  const set = (p: Record<string, string | undefined>) => setQuery(route, p);
  const active = FILTER_KEYS.filter((k) => q.get(k)).length;
  const reset = () => {
    setText('');
    set(Object.fromEntries([...FILTER_KEYS, 'q', 'sort'].map((k) => [k, undefined])));
  };
  const items = useMemo(() => (res.data?.items ?? []).map(toCatalogStrain), [res.data]);
  const d = res.data;
  const field = 'input-base py-1.5 text-[13px]';

  const activeFilters = ['type', 'auto', 'seed', 'terpene', 'lineage', 'thc', 'samples'].filter((k) => q.get(k)).length;
  const filterControls = (
    <>
          <select className={field} aria-label={t('discover.lb.gType')} value={q.get('type') ?? ''} onChange={(e) => set({ type: e.target.value || undefined })}>
            <option value="">{t('discover.lb.typeAll')}</option>
            <option value="indica">{t('discover.lb.indica')}</option>
            <option value="sativa">{t('discover.lb.sativa')}</option>
            <option value="balanced">{t('discover.lb.balanced')}</option>
          </select>
          <select className={field} aria-label={t('discover.lb.flowering')} value={q.get('auto') ?? ''} onChange={(e) => set({ auto: e.target.value || undefined })}>
            <option value="">{t('discover.lb.flAll')}</option>
            <option value="1">{t('discover.lb.onlyAuto')}</option>
            <option value="0">{t('discover.lb.onlyPhoto')}</option>
          </select>
          <select className={field} aria-label={t('discover.lb.seed')} value={q.get('seed') ?? ''} onChange={(e) => set({ seed: e.target.value || undefined })}>
            <option value="">{t('discover.lb.seedAll')}</option>
            <option value="feminisiert">{t('discover.lb.fem')}</option>
            <option value="regulär">{t('discover.lb.reg')}</option>
          </select>
          <select className={field} aria-label={t('discover.lb.terp')} value={q.get('terpene') ?? ''} onChange={(e) => set({ terpene: e.target.value || undefined })}>
            <option value="">{t('discover.lb.terpAll')}</option>
            {TERPENES.map((tv) => (
              <option key={tv.id} value={tv.id}>
                {tv.name}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 rounded-lg border border-white/[0.06] px-2.5 text-[12px] text-ink-300">
            <input type="checkbox" className="accent-leaf-500" checked={q.get('lineage') === '1'} onChange={(e) => set({ lineage: e.target.checked ? '1' : undefined })} /> {t('discover.lb.withLineage')}
          </label>
          <label className="flex items-center gap-2 rounded-lg border border-white/[0.06] px-2.5 text-[12px] text-ink-300">
            <input type="checkbox" className="accent-leaf-500" checked={q.get('thc') === '1'} onChange={(e) => set({ thc: e.target.checked ? '1' : undefined })} /> {t('discover.lb.withThc')}
          </label>
          <label
            className="flex items-center gap-2 rounded-lg border border-white/[0.06] px-2.5 text-[12px] text-ink-300"
            title={t('discover.lb.samplesHint')}
          >
            <input type="checkbox" className="accent-leaf-500" checked={q.get('samples') === '1'} onChange={(e) => set({ samples: e.target.checked ? '1' : undefined })} /> {t('discover.lb.withSamples')}
          </label>
          <select className={field} aria-label={t('discover.lb.sort')} value={params.sort} onChange={(e) => set({ sort: e.target.value })}>
            {SORTS.filter((s) => !('needsQuery' in s) || query).map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
    </>
  );
  return (
    <div>
      {filtersOpen && (
        <BottomSheet
          title={t('discover.lb.filters')}
          onClose={() => setFiltersOpen(false)}
          footer={
            <>
              {activeFilters > 0 && (
                <button type="button" className="btn-ghost mr-auto" onClick={() => set({ type: undefined, auto: undefined, seed: undefined, terpene: undefined, lineage: undefined, thc: undefined, samples: undefined })}>
                  <RotateCcw className="size-4" /> {t('discover.lb.reset')}
                </button>
              )}
              <button type="button" className="btn-primary" onClick={() => setFiltersOpen(false)}>
                {d ? t('discover.lb.showN', { count: d.total }) : t('discover.lb.done')}
              </button>
            </>
          }
        >
          <div className="grid grid-cols-1 gap-2.5 [&_label]:min-h-11 [&_select]:h-11">{filterControls}</div>
        </BottomSheet>
      )}
      <DiscoverNav />
      <header className="mb-5 animate-fade-up">
        <h1 className="page-title">{t('discover.lb.discover')}</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-400">
          {fmt(status.counts?.cultivars ?? 0, 0)} Sorten von {fmt(status.counts?.breeders ?? 0, 0)} Breedern – auf deinem Server indexiert, Suchanfragen verlassen deine Instanz nicht.
        </p>
      </header>

      <div className="z-10 -mx-1 mb-4 rounded-2xl lg:sticky lg:top-[3.4rem] border border-white/[0.06] bg-ink-950/90 p-2 backdrop-blur-xl lg:top-[3.4rem]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-500" />
          <input
            type="search"
            className="input-base h-11 pl-9 pr-9 text-[15px] [&::-webkit-search-cancel-button]:hidden"
            placeholder={t('discover.lb.searchPh')}
            aria-label={t('discover.lb.searchAria')}
            value={text}
            onChange={(e) => setText(e.target.value)}
            enterKeyHint="search"
          />
          {text && (
            <button type="button" className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-ink-400 hover:bg-white/[0.06] hover:text-ink-100" aria-label={t('discover.lb.clear')} onClick={() => setText('')}>
              <X className="size-4" />
            </button>
          )}
        </div>
        <button
          type="button"
          className="mt-2 flex w-full items-center justify-between rounded-lg border border-white/[0.06] px-3 py-2 text-[13px] text-ink-200 sm:hidden"
          aria-haspopup="dialog"
          onClick={() => setFiltersOpen(true)}
        >
          <span className="flex items-center gap-2">
            <SlidersHorizontal className="size-4 text-ink-400" /> {t('discover.lb.filters')}
            {activeFilters > 0 && <span className="rounded-full bg-leaf-500/15 px-1.5 text-[11px] text-leaf-300">{activeFilters} aktiv</span>}
          </span>
          <ChevronDown className="size-4 text-ink-400" />
        </button>
        <div id="katalog-filter" className="mt-2 hidden gap-2 sm:grid sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-8">
          {filterControls}
        </div>
      </div>

      {!query && !active && (settings.recentCultivars.length > 0 || favBreeders.ids.length > 0) && (
        <div className="mb-5 grid gap-3 lg:grid-cols-2">
          {settings.recentCultivars.length > 0 && (
            <section className="card p-3.5" aria-label={t('discover.lb.recent')}>
              <h2 className="flex items-center gap-2 text-[12px] font-medium text-ink-300">
                <Clock className="size-3.5 text-ink-500" /> {t('discover.lb.recent')}
              </h2>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {settings.recentCultivars.slice(0, 8).map((r) => (
                  <li key={r.id}>
                    <a href={href(`discover/cultivar/${r.id}`)} className="inline-flex max-w-[16rem] items-center gap-1 truncate rounded-full border border-white/[0.07] px-2.5 py-1 text-[12px] text-ink-200 hover:border-white/[0.16]">
                      <span className="truncate">{r.name}</span>
                      <span className="truncate text-ink-500">· {r.breeder}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {favBreeders.ids.length > 0 && (
            <section className="card p-3.5" aria-label={t('discover.lb.savedBreeders')}>
              <h2 className="flex items-center gap-2 text-[12px] font-medium text-ink-300">
                <Bookmark className="size-3.5 text-ink-500" /> {t('discover.lb.savedBreeders')}
              </h2>
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {favBreeders.ids.slice(0, 12).map((id) => (
                  <li key={id}>
                    <a href={href(`discover/breeders/${id}`)} className="inline-flex rounded-full border border-white/[0.07] px-2.5 py-1 text-[12px] text-ink-200 hover:border-white/[0.16]">
                      {id}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2" aria-live="polite">
        <p className="text-[13px] text-ink-300">
          {res.loading && !d ? (
            <span className="inline-flex items-center gap-2">
              <Loader2 className="size-4 animate-spin" /> {t('discover.lb.searching')}
            </span>
          ) : d ? (
            <>
              <span className="font-semibold tabular text-ink-50">{fmt(d.total, 0)}</span> {t('discover.lb.strainsWord', { count: d.total })}
              {query ? <> {t('discover.lb.forQ', { q: query })}</> : active ? ` ${t('discover.lb.withFilters')}` : ` ${t('discover.lb.inCatalog')}`}
              {res.loading && <Loader2 className="ml-2 inline size-3.5 animate-spin text-ink-500" />}
            </>
          ) : null}
        </p>
        {(query || active > 0) && (
          <button type="button" className="btn-ghost h-8 px-2.5 text-[12px]" onClick={reset}>
            <RotateCcw className="size-3.5" /> {t('discover.lb.resetShort')}
          </button>
        )}
      </div>

      {params.parent && (
        <p className="mb-3 inline-flex items-center gap-2 rounded-full border border-leaf-500/25 bg-leaf-500/10 px-3 py-1 text-[12px] text-leaf-200">
          Elternsorte: {params.parent.replace(/-/g, ' ')}
          <button type="button" aria-label={t('discover.lb.removeParent')} onClick={() => set({ parent: undefined })} className="text-leaf-300 hover:text-leaf-100">
            <X className="size-3.5" />
          </button>
        </p>
      )}

      {query && d && d.total > 0 && (
        <ul className="mb-4 flex flex-wrap gap-1.5" aria-label={t('discover.lb.tiers')}>
          {TIERS.filter((tv) => d.groups[tv]).map((tv) => (
            <li key={tv} className="rounded-full border border-white/[0.07] bg-white/[0.02] px-2.5 py-1 text-[11px] text-ink-300">
              {MATCH_LABEL[tv]}: <span className="tabular text-ink-100">{fmt(d.groups[tv] ?? 0, 0)}</span>
            </li>
          ))}
        </ul>
      )}

      {res.error && (
        <Callout tone="danger" title={t('discover.lb.unreachable')}>
          {res.error}
        </Callout>
      )}

      {!res.error && d && d.total === 0 && (
        <EmptyState
          icon={<Sprout />}
          title={t('discover.lb.none')}
          text={query ? t('discover.lb.noneQuery') : t('discover.lb.noneFilter')}
          action={
            <button type="button" className="btn-ghost" onClick={reset}>
              {t('discover.lb.reset')}
            </button>
          }
        />
      )}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {items.map((s, i) => (
          <StrainCard key={s.key} strain={s} priority={i < 4} matchLabel={query && d?.items[i]?.match ? MATCH_LABEL[d.items[i]!.match!] : undefined} />
        ))}
        {res.loading && !d && Array.from({ length: 8 }, (_, i) => <StrainCardSkeleton key={i} />)}
      </div>

      {d && d.page < d.totalPages && (
        <div className="mt-5 flex flex-col items-center gap-1.5">
          <button type="button" className="btn-ghost" onClick={loadMore} disabled={res.more}>
            {res.more ? <Loader2 className="size-4 animate-spin" /> : null} Weitere {Math.min(PER_PAGE, d.total - items.length)} laden
          </button>
          <p className="text-[11px] text-ink-500 tabular">
            {fmt(items.length, 0)} von {fmt(d.total, 0)} angezeigt
          </p>
        </div>
      )}

      <div className="mt-8 grid gap-3 lg:grid-cols-2">
        <DatasetNotice status={status} />
        <div className="card p-4 text-[12px] text-ink-400">
          <p className="flex items-center gap-2 font-medium text-ink-200">
            <Database className="size-4 text-ink-500" /> {t('discover.lb.live')}
          </p>
          <p className="mt-1">{t('discover.lb.liveHint')}</p>
          <a href={href(`discover/live${query ? `?q=${encodeURIComponent(query)}` : ''}`)} className="mt-2 inline-flex text-leaf-300 hover:underline">
            {query ? t('discover.lb.searchApi', { q: query }) : t('discover.lb.openApi')}
          </a>
        </div>
      </div>
    </div>
  );
}
