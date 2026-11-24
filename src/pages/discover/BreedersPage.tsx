import { ArrowLeft, Bookmark, Building2, Handshake, Loader2, Search, Store, Users, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../app/DataProvider';
import { useAsync, useFavoriteBreeders } from '../../app/library';
import { href, setQuery, useRoute } from '../../app/router';
import { DatasetNotice } from '../../components/discover/DatasetNotice';
import { DiscoverNav } from '../../components/discover/DiscoverNav';
import { StrainCard } from '../../components/discover/StrainCard';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { type LibBreeder, type LibSearchResult, library, toCatalogStrain } from '../../lib/catalog/library';
import { fmt } from '../../lib/format';
import { errorText } from '../../app/Toasts';

const LETTERS = ['#', ...'abcdefghijklmnopqrstuvwxyz'];

function BreederCard({ b, fav, onFav }: { b: LibBreeder; fav: boolean; onFav: () => void }) {
  return (
    <li className="group relative flex items-start gap-3 rounded-2xl border border-white/[0.06] bg-ink-900/60 p-3.5 transition-colors hover:border-white/[0.14]">
      <div className="grid size-10 shrink-0 place-items-center rounded-xl border border-white/[0.06] bg-white/[0.03] font-mono text-[13px] font-semibold uppercase text-leaf-300" aria-hidden>
        {b.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2) || '–'}
      </div>
      <div className="min-w-0 flex-1">
        <a href={href(`discover/breeders/${b.id}`)} className="block truncate text-[14px] font-semibold text-ink-50 after:absolute after:inset-0 after:content-['']">
          {b.name}
        </a>
        <p className="mt-0.5 text-[12px] text-ink-400 tabular">
          {fmt(b.cultivarCount, 0)} {b.cultivarCount === 1 ? 'Sorte' : 'Sorten'} · {fmt(b.listingCount, 0)} Angebote
        </p>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {b.isSeedBank && <span className="rounded border border-white/[0.08] px-1.5 text-[10px] text-ink-400">auch Seedbank</span>}
          {b.collabMembers.length > 0 && <span className="rounded border border-white/[0.08] px-1.5 text-[10px] text-ink-400">Kooperation</span>}
        </div>
      </div>
      <button
        type="button"
        onClick={onFav}
        aria-pressed={fav}
        aria-label={fav ? `${b.name} nicht mehr merken` : `${b.name} merken`}
        className={`relative z-10 grid size-8 shrink-0 place-items-center rounded-lg ${fav ? 'bg-leaf-500/10 text-leaf-300' : 'text-ink-500 hover:bg-white/[0.05] hover:text-ink-200'}`}
      >
        <Bookmark className={`size-4 ${fav ? 'fill-current' : ''}`} />
      </button>
    </li>
  );
}

export function BreedersPage() {
  const route = useRoute();
  const q = route.query;
  const fav = useFavoriteBreeders();
  const [text, setText] = useState(q.get('q') ?? '');
  const letter = q.get('letter') ?? '';
  const sort = q.get('sort') === 'name' ? 'name' : 'cultivars';
  const kind = q.get('kind') === 'seedbank' || q.get('kind') === 'collab' ? (q.get('kind') as 'seedbank' | 'collab') : undefined;
  const onlyFav = q.get('fav') === '1';
  const [page, setPage] = useState(1);
  const [items, setItems] = useState<LibBreeder[]>([]);
  useEffect(() => {
    const t = window.setTimeout(() => {
      if ((q.get('q') ?? '') !== text.trim()) setQuery(route, { q: text.trim() || undefined, letter: undefined });
    }, 250);
    return () => window.clearTimeout(t);
  }, [text]); // eslint-disable-line react-hooks/exhaustive-deps
  const query = (q.get('q') ?? '').trim();
  useEffect(() => setPage(1), [query, letter, sort, kind]);
  const res = useAsync((signal) => library.breeders({ q: query || undefined, letter: letter || undefined, sort, kind, page, perPage: onlyFav ? 200 : 60 }, signal), [query, letter, sort, kind, page, onlyFav]);
  useEffect(() => {
    if (!res.data) return;
    setItems((prev) => (res.data!.page === 1 ? res.data!.items : [...prev, ...res.data!.items.filter((b) => !prev.some((p) => p.id === b.id))]));
  }, [res.data]);
  const shown = onlyFav ? items.filter((b) => fav.has(b.id)) : items;
  const set = (p: Record<string, string | undefined>) => setQuery(route, p);

  return (
    <div>
      <DiscoverNav />
      <header className="mb-5 animate-fade-up">
        <p className="eyebrow">Breeder-Verzeichnis</p>
        <h1 className="mt-1 text-[28px] font-semibold tracking-tight text-ink-50 sm:text-[32px]">Breeder</h1>
        <p className="mt-1 max-w-2xl text-sm text-ink-400">Alle Breeder im lokalen Katalog mit ihren gelisteten Sorten. Schreibvarianten (z. B. Groß-/Kleinschreibung) sind zusammengeführt; Kooperationen bleiben eigene Einträge.</p>
      </header>

      <div className="mb-3 flex flex-col gap-2 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-500" />
          <input type="search" className="input-base h-10 pl-9 pr-9 [&::-webkit-search-cancel-button]:hidden" placeholder="Breeder suchen …" aria-label="Breeder suchen" value={text} onChange={(e) => setText(e.target.value)} />
          {text && (
            <button type="button" className="absolute right-2 top-1/2 grid size-7 -translate-y-1/2 place-items-center rounded-md text-ink-400 hover:bg-white/[0.06]" aria-label="Suche leeren" onClick={() => setText('')}>
              <X className="size-4" />
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-2 sm:flex">
          <select className="input-base h-10 text-[13px]" aria-label="Art" value={kind ?? ''} onChange={(e) => set({ kind: e.target.value || undefined })}>
            <option value="">Alle</option>
            <option value="seedbank">Auch Seedbank</option>
            <option value="collab">Kooperationen</option>
          </select>
          <select className="input-base h-10 text-[13px]" aria-label="Sortierung" value={sort} onChange={(e) => set({ sort: e.target.value === 'cultivars' ? undefined : e.target.value })}>
            <option value="cultivars">Meiste Sorten</option>
            <option value="name">A–Z</option>
          </select>
          <label className="flex h-10 items-center gap-2 rounded-lg border border-white/[0.06] px-2.5 text-[12px] text-ink-300">
            <input type="checkbox" className="accent-leaf-500" checked={onlyFav} onChange={(e) => set({ fav: e.target.checked ? '1' : undefined })} /> Gemerkt
          </label>
        </div>
      </div>

      <nav aria-label="Alphabet" className="mb-4 flex flex-wrap gap-1">
        <button type="button" onClick={() => set({ letter: undefined })} className={`h-8 min-w-8 rounded-md px-2 text-[12px] ${!letter ? 'bg-white/[0.08] text-ink-50' : 'text-ink-400 hover:bg-white/[0.04]'}`}>
          Alle
        </button>
        {LETTERS.map((l) => {
          const n = res.data?.letters[l] ?? 0;
          return (
            <button
              key={l}
              type="button"
              disabled={!n}
              aria-pressed={letter === l}
              onClick={() => {
                setText('');
                set({ letter: l, q: undefined });
              }}
              className={`h-8 min-w-8 rounded-md px-1.5 text-[12px] uppercase tabular disabled:opacity-25 ${letter === l ? 'bg-leaf-500/15 text-leaf-200' : 'text-ink-400 hover:bg-white/[0.04]'}`}
              title={`${n} Breeder`}
            >
              {l}
            </button>
          );
        })}
      </nav>

      <p className="mb-3 text-[13px] text-ink-300" aria-live="polite">
        {res.data ? (
          <>
            <span className="font-semibold tabular text-ink-50">{fmt(onlyFav ? shown.length : res.data.total, 0)}</span> Breeder{onlyFav ? ' gemerkt (in dieser Auswahl)' : ''}
            {res.loading && <Loader2 className="ml-2 inline size-3.5 animate-spin" />}
          </>
        ) : res.error ? null : (
          <Loader2 className="size-4 animate-spin" />
        )}
      </p>
      {res.error && <p className="text-[13px] text-rose-300">{res.error}</p>}
      {res.data && shown.length === 0 && <EmptyState icon={<Users />} title="Keine Breeder gefunden" text={onlyFav ? 'Du hast in dieser Auswahl noch keine Breeder gemerkt.' : 'Anderen Suchbegriff oder Buchstaben wählen.'} />}
      <ul className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {shown.map((b) => (
          <BreederCard key={b.id} b={b} fav={fav.has(b.id)} onFav={() => fav.toggle(b.id)} />
        ))}
      </ul>
      {res.data && !onlyFav && res.data.page < res.data.totalPages && (
        <div className="mt-5 flex justify-center">
          <button type="button" className="btn-ghost" onClick={() => setPage((p) => p + 1)} disabled={res.loading}>
            {res.loading && <Loader2 className="size-4 animate-spin" />} Weitere laden ({fmt(items.length, 0)} von {fmt(res.data.total, 0)})
          </button>
        </div>
      )}
    </div>
  );
}

const TYPE_ROWS = [
  { key: 'indica', label: 'Indica-dominant', color: '#a78bfa' },
  { key: 'balanced', label: 'Ausgewogen', color: '#5fe39a' },
  { key: 'sativa', label: 'Sativa-dominant', color: '#fbbf24' },
] as const;

export function BreederProfile({ id }: { id: string }) {
  const { data: d, loading, error, notFound } = useAsync((signal) => library.breeder(id, signal), [id]);
  const fav = useFavoriteBreeders();
  const { data } = useData();
  const [sort, setSort] = useState<'name' | 'thc' | 'listings'>('listings');
  const [auto, setAuto] = useState<'' | '1' | '0'>('');
  const [list, setList] = useState<{ data?: LibSearchResult; loading: boolean; error?: string }>({ loading: true });
  useEffect(() => {
    const c = new AbortController();
    setList((s) => ({ ...s, loading: true }));
    library
      .search({ breeder: id, sort, auto: auto || undefined, perPage: 48 }, c.signal)
      .then((r) => setList({ data: r, loading: false }))
      .catch((e) => !c.signal.aborted && setList({ loading: false, error: errorText(e) }));
    return () => c.abort();
  }, [id, sort, auto]);
  const more = () => {
    const r = list.data;
    if (!r || r.page >= r.totalPages) return;
    setList((s) => ({ ...s, loading: true }));
    library
      .search({ breeder: id, sort, auto: auto || undefined, perPage: 48, page: r.page + 1 })
      .then((n) => setList((s) => ({ loading: false, data: s.data ? { ...n, items: [...s.data.items, ...n.items] } : n })))
      .catch((e) => setList((s) => ({ ...s, loading: false, error: errorText(e) })));
  };
  const cards = useMemo(() => (list.data?.items ?? []).map(toCatalogStrain), [list.data]);
  const mineCount = useMemo(() => (d ? data.strains.filter((s) => s.external?.provider === 'cisp' && s.external.id.startsWith(`${d.breeder.id}--`)).length : 0), [d, data.strains]);

  if (!d) {
    return (
      <div>
        <DiscoverNav />
        {loading ? <div className="h-40 animate-pulse rounded-3xl bg-ink-800" aria-busy="true" /> : <EmptyState title={notFound ? 'Breeder nicht im Katalog' : 'Profil konnte nicht geladen werden'} text={notFound ? undefined : error} action={<a href={href('discover/breeders')} className="btn-ghost">Zum Verzeichnis</a>} />}
      </div>
    );
  }
  const b = d.breeder;
  const s = d.stats;
  const typed = (s.indica ?? 0) + (s.sativa ?? 0) + (s.balanced ?? 0);
  const isFav = fav.has(b.id);

  return (
    <div>
      <DiscoverNav />
      <a href={href('discover/breeders')} className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-ink-400 hover:text-ink-100">
        <ArrowLeft className="size-3.5" /> Breeder-Verzeichnis
      </a>
      <header className="mb-6 flex flex-col gap-4 rounded-3xl border border-white/[0.06] bg-gradient-to-br from-ink-900 to-ink-950 p-5 sm:flex-row sm:items-center sm:p-6 animate-fade-up">
        <div className="grid size-16 shrink-0 place-items-center rounded-2xl border border-white/[0.08] bg-white/[0.03] font-mono text-xl font-semibold uppercase text-leaf-300" aria-hidden>
          {b.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 2)}
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="break-words text-2xl font-semibold tracking-tight text-ink-50 sm:text-[32px]">{b.name}</h1>
          {b.variants.length > 0 && <p className="mt-1 text-[12px] text-ink-500">Weitere Schreibweisen in der Quelle: {b.variants.join(', ')}</p>}
          <div className="mt-2 flex flex-wrap gap-1.5">
            {b.isSeedBank && (
              <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] px-2 py-0.5 text-[11px] text-ink-300">
                <Store className="size-3" /> verkauft auch selbst (Seedbank)
              </span>
            )}
            {b.collabMembers.length > 0 && (
              <span className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] px-2 py-0.5 text-[11px] text-ink-300">
                <Handshake className="size-3" /> Kooperation: {b.collabMembers.join(' × ')}
              </span>
            )}
          </div>
        </div>
        <button type="button" onClick={() => fav.toggle(b.id)} aria-pressed={isFav} className={isFav ? 'btn border border-leaf-500/30 bg-leaf-500/10 text-leaf-200' : 'btn-primary'}>
          <Bookmark className={`size-4 ${isFav ? 'fill-current' : ''}`} /> {isFav ? 'Gemerkt' : 'Breeder merken'}
        </button>
      </header>

      <div className="mb-6 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {[
          ['Sorten', s.n],
          ['Seedbank-Angebote', b.listingCount],
          ['davon Autoflowering', s.auto],
          ['mit Abstammung', s.lineage],
        ].map(([l, v]) => (
          <div key={l as string} className="rounded-2xl border border-white/[0.06] bg-ink-900/60 px-3.5 py-3">
            <p className="text-[10px] uppercase tracking-wider text-ink-500">{l}</p>
            <p className="mt-1 font-mono text-xl tabular text-ink-50">{fmt(Number(v ?? 0), 0)}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,8fr)_minmax(0,4fr)]">
        <section className="min-w-0" aria-label="Sorten">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-semibold text-ink-100">
              Sorten <span className="font-normal text-ink-500 tabular">({fmt(list.data?.total ?? s.n ?? 0, 0)})</span>
            </h2>
            <div className="flex gap-2">
              <select className="input-base h-9 py-1 text-[12px]" aria-label="Blüteverhalten" value={auto} onChange={(e) => setAuto(e.target.value as '' | '1' | '0')}>
                <option value="">Alle</option>
                <option value="1">Autoflowering</option>
                <option value="0">Photoperiodisch</option>
              </select>
              <select className="input-base h-9 py-1 text-[12px]" aria-label="Sortierung" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)}>
                <option value="listings">Meiste Angebote</option>
                <option value="name">Name A–Z</option>
                <option value="thc">THC-Angabe</option>
              </select>
            </div>
          </div>
          {list.error && <p className="text-[13px] text-rose-300">{list.error}</p>}
          <div className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 xl:grid-cols-3">
            {cards.map((c) => (
              <StrainCard key={c.key} strain={c} />
            ))}
          </div>
          {list.data && list.data.page < list.data.totalPages && (
            <div className="mt-4 flex justify-center">
              <button type="button" className="btn-ghost" disabled={list.loading} onClick={more}>
                {list.loading && <Loader2 className="size-4 animate-spin" />} Weitere laden ({fmt(cards.length, 0)} von {fmt(list.data.total, 0)})
              </button>
            </div>
          )}
        </section>

        <aside className="min-w-0 space-y-5">
          <Card title="Über diesen Breeder" icon={<Building2 className="size-4" />}>
            <p className="text-[13px] text-ink-400">Der Datensatz enthält keine Firmengeschichte, Herkunft oder Website. TERPGRID ergänzt solche Angaben nicht ohne Quelle.</p>
            {mineCount > 0 && <p className="mt-2 text-[13px] text-ink-300">{mineCount} Sorte(n) dieses Breeders in deinen Sorten.</p>}
          </Card>
          {typed > 0 && (
            <Card title="Typen laut Angaben" subtitle={`${fmt(typed, 0)} von ${fmt(s.n ?? 0, 0)} Sorten mit Typangabe`}>
              <div className="flex h-2.5 overflow-hidden rounded-full bg-ink-700" role="img" aria-label={TYPE_ROWS.map((t) => `${t.label}: ${s[t.key] ?? 0}`).join(', ')}>
                {TYPE_ROWS.map((t) => (
                  <div key={t.key} style={{ width: `${((s[t.key] ?? 0) / typed) * 100}%`, background: t.color }} />
                ))}
              </div>
              <ul className="mt-2 space-y-0.5 text-[12px] text-ink-400">
                {TYPE_ROWS.map((t) => (
                  <li key={t.key} className="flex justify-between">
                    <span className="flex items-center gap-1.5">
                      <span className="size-2 rounded-full" style={{ background: t.color }} /> {t.label}
                    </span>
                    <span className="tabular">{fmt(s[t.key] ?? 0, 0)}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {d.topParents.length > 0 && (
            <Card title="Häufige Elternsorten" subtitle="Nach Nennungen in den Sorten dieses Breeders">
              <ul className="flex flex-wrap gap-1.5">
                {d.topParents.map((p) => (
                  <li key={p.slug}>
                    <a href={href(`discover?parent=${encodeURIComponent(p.slug)}`)} className="inline-flex items-center gap-1 rounded-full border border-white/[0.07] px-2.5 py-1 text-[12px] text-ink-200 hover:border-white/[0.16]">
                      {p.slug.replace(/-/g, ' ')} <span className="tabular text-ink-500">{p.count}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {b.seedBanks.length > 0 && (
            <Card title="Gelistet bei" subtitle="Seedbanks im Datensatz" icon={<Store className="size-4" />}>
              <p className="text-[13px] text-ink-300">{b.seedBanks.join(' · ')}</p>
            </Card>
          )}
          {d.collaborations.length > 0 && (
            <Card title="Kooperationen" icon={<Handshake className="size-4" />}>
              <ul className="space-y-1 text-[13px]">
                {d.collaborations.map((c) => (
                  <li key={c.id}>
                    <a href={href(`discover/breeders/${c.id}`)} className="text-leaf-300 hover:underline">
                      {c.name}
                    </a>{' '}
                    <span className="text-ink-500">· {c.cultivarCount} Sorten</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
          <DatasetNotice status={{ attribution: d.attribution }} compact />
        </aside>
      </div>
    </div>
  );
}
