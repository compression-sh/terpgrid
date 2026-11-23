import { Bookmark, CloudOff, Database, Info, Loader2, RefreshCw, Search, SlidersHorizontal, WifiOff, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLinkedStrains, useStrainSearch } from '../../app/catalog';
import { useData } from '../../app/DataProvider';
import { href, setQuery, useRoute } from '../../app/router';
import { TYPE_META } from '../../components/discover/Badges';
import { DiscoverNav } from '../../components/discover/DiscoverNav';
import { StrainCard, StrainCardSkeleton } from '../../components/discover/StrainCard';
import { Callout } from '../../components/ui/Callout';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { TERPENES, matchTerpene } from '../../lib/catalog/terpenes';
import type { CatalogStrain, TypeClass } from '../../lib/catalog/types';
import { fmtDateTime, nowLocal } from '../../lib/dates';
import { parseLocaleNumber } from '../../lib/calc/validation';

type SortKey = 'source' | 'name' | 'thc' | 'cbd' | 'breeder';
const SORTS: { id: SortKey; label: string }[] = [
  { id: 'source', label: 'Reihenfolge der Quelle' },
  { id: 'name', label: 'Name A–Z' },
  { id: 'thc', label: 'THC (Obergrenze, absteigend)' },
  { id: 'cbd', label: 'CBD (Obergrenze, absteigend)' },
  { id: 'breeder', label: 'Breeder A–Z' },
];

export interface DiscoverFilters {
  type: TypeClass | '';
  breeder: string;
  genetics: string;
  terp: string;
  thcMin?: number;
  thcMax?: number;
  cbdMin?: number;
  cbdMax?: number;
  fav: boolean;
}

const num = (v: string | null): number | undefined => {
  if (v === null || v === '') return undefined;
  const n = parseLocaleNumber(v);
  return Number.isFinite(n) ? n : undefined;
};

/** Obergrenze bzw. Einzelwert einer Spanne (für Sortierung/Filter). */
const hi = (r?: CatalogStrain['thc']) => r?.max ?? r?.value ?? r?.min;
const lo = (r?: CatalogStrain['thc']) => r?.min ?? r?.value ?? r?.max;

/** Filtert lokal – Aufrufer muss kenntlich machen, ob die Menge vollständig ist. */
export function applyFilters(items: CatalogStrain[], f: DiscoverFilters, favKeys: Set<string>): CatalogStrain[] {
  const terp = f.terp ? (matchTerpene(f.terp)?.id ?? f.terp.toLowerCase()) : '';
  return items.filter((s) => {
    if (f.type && s.typeClass !== f.type) return false;
    if (f.breeder && !(s.breeder ?? '').toLowerCase().includes(f.breeder.toLowerCase())) return false;
    if (f.genetics && !(s.genetics ?? '').toLowerCase().includes(f.genetics.toLowerCase())) return false;
    if (terp && !s.terpenes.some((t) => (matchTerpene(t)?.id ?? t.toLowerCase()) === terp)) return false;
    if (f.fav && !favKeys.has(s.key)) return false;
    // Spannen-Filter: Sorte muss Werte haben und sich mit dem gewünschten Bereich überschneiden.
    if (f.thcMin !== undefined || f.thcMax !== undefined) {
      const a = lo(s.thc);
      const b = hi(s.thc);
      if (a === undefined || b === undefined) return false;
      if (f.thcMin !== undefined && b < f.thcMin) return false;
      if (f.thcMax !== undefined && a > f.thcMax) return false;
    }
    if (f.cbdMin !== undefined || f.cbdMax !== undefined) {
      const a = lo(s.cbd);
      const b = hi(s.cbd);
      if (a === undefined || b === undefined) return false;
      if (f.cbdMin !== undefined && b < f.cbdMin) return false;
      if (f.cbdMax !== undefined && a > f.cbdMax) return false;
    }
    return true;
  });
}

export function sortStrains(items: CatalogStrain[], sort: SortKey): CatalogStrain[] {
  if (sort === 'source') return items;
  const copy = [...items];
  const missingLast = (a?: number, b?: number) => (a === undefined && b === undefined ? 0 : a === undefined ? 1 : b === undefined ? -1 : b - a);
  if (sort === 'name') copy.sort((a, b) => a.name.localeCompare(b.name, 'de'));
  if (sort === 'breeder') copy.sort((a, b) => (a.breeder ? (b.breeder ? a.breeder.localeCompare(b.breeder, 'de') : -1) : b.breeder ? 1 : 0));
  if (sort === 'thc') copy.sort((a, b) => missingLast(hi(a.thc), hi(b.thc)));
  if (sort === 'cbd') copy.sort((a, b) => missingLast(hi(a.cbd), hi(b.cbd)));
  return copy;
}

function FilterFields({ f, set, breeders }: { f: DiscoverFilters; set: (p: Record<string, string | undefined>) => void; breeders: string[] }) {
  const field = 'input-base py-1.5 text-[13px]';
  return (
    <>
      <label className="space-y-1">
        <span className="text-[11px] font-medium text-ink-400">Typ</span>
        <select className={field} value={f.type} onChange={(e) => set({ type: e.target.value || undefined })}>
          <option value="">Alle Typen</option>
          {(['indica', 'sativa', 'hybrid', 'unknown'] as TypeClass[]).map((t) => (
            <option key={t} value={t}>
              {TYPE_META[t].label}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1">
        <span className="text-[11px] font-medium text-ink-400">Terpen</span>
        <select className={field} value={f.terp} onChange={(e) => set({ terp: e.target.value || undefined })}>
          <option value="">Alle Terpene</option>
          {TERPENES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1">
        <span className="text-[11px] font-medium text-ink-400">Breeder</span>
        <input className={field} list="dc-breeders" placeholder="enthält …" value={f.breeder} onChange={(e) => set({ breeder: e.target.value || undefined })} />
        <datalist id="dc-breeders">
          {breeders.map((b) => (
            <option key={b} value={b} />
          ))}
        </datalist>
      </label>
      <label className="space-y-1">
        <span className="text-[11px] font-medium text-ink-400">Genetik enthält</span>
        <input className={field} placeholder="z. B. Gelato" value={f.genetics} onChange={(e) => set({ genetics: e.target.value || undefined })} />
      </label>
      <fieldset className="space-y-1">
        <legend className="text-[11px] font-medium text-ink-400">THC %</legend>
        <div className="flex items-center gap-1.5">
          <input className={`${field} w-full`} inputMode="decimal" placeholder="min" aria-label="THC minimal" value={f.thcMin ?? ''} onChange={(e) => set({ thcMin: e.target.value || undefined })} />
          <span className="text-ink-600">–</span>
          <input className={`${field} w-full`} inputMode="decimal" placeholder="max" aria-label="THC maximal" value={f.thcMax ?? ''} onChange={(e) => set({ thcMax: e.target.value || undefined })} />
        </div>
      </fieldset>
      <fieldset className="space-y-1">
        <legend className="text-[11px] font-medium text-ink-400">CBD %</legend>
        <div className="flex items-center gap-1.5">
          <input className={`${field} w-full`} inputMode="decimal" placeholder="min" aria-label="CBD minimal" value={f.cbdMin ?? ''} onChange={(e) => set({ cbdMin: e.target.value || undefined })} />
          <span className="text-ink-600">–</span>
          <input className={`${field} w-full`} inputMode="decimal" placeholder="max" aria-label="CBD maximal" value={f.cbdMax ?? ''} onChange={(e) => set({ cbdMax: e.target.value || undefined })} />
        </div>
      </fieldset>
    </>
  );
}

export function DiscoverPage() {
  const route = useRoute();
  const { settings, updateSettings } = useData();
  const q = route.query;
  const linked = useLinkedStrains();
  const [text, setText] = useState(q.get('q') ?? '');
  const [drawer, setDrawer] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  // URL ↔ Suchfeld (Suchzustand ist verlinkbar)
  useEffect(() => {
    const t = window.setTimeout(() => {
      if ((q.get('q') ?? '') !== text.trim()) setQuery(route, { q: text.trim() || undefined });
    }, 350);
    return () => window.clearTimeout(t);
  }, [text]);
  useEffect(() => {
    const urlQ = q.get('q') ?? '';
    if (urlQ !== text.trim()) setText(urlQ);
  }, [q.get('q')]);

  const search = useStrainSearch(q.get('q') ?? '', 0);
  const f: DiscoverFilters = {
    type: (['indica', 'sativa', 'hybrid', 'unknown'].includes(q.get('type') ?? '') ? q.get('type') : '') as TypeClass | '',
    breeder: q.get('breeder') ?? '',
    genetics: q.get('genetics') ?? '',
    terp: q.get('terp') ?? '',
    thcMin: num(q.get('thcMin')),
    thcMax: num(q.get('thcMax')),
    cbdMin: num(q.get('cbdMin')),
    cbdMax: num(q.get('cbdMax')),
    fav: q.get('fav') === '1',
  };
  const sort = (SORTS.some((s) => s.id === q.get('sort')) ? q.get('sort') : 'source') as SortKey;
  const set = (p: Record<string, string | undefined>) => setQuery(route, p);
  const filterKeys = ['type', 'breeder', 'genetics', 'terp', 'thcMin', 'thcMax', 'cbdMin', 'cbdMax', 'fav'];
  const activeFilters = filterKeys.filter((k) => q.get(k)).length;
  const resetAll = () => {
    setText('');
    set(Object.fromEntries([...filterKeys, 'q', 'sort'].map((k) => [k, undefined])));
  };

  const favKeys = useMemo(() => new Set([...linked.entries()].filter(([, s]) => s.favorite).map(([k]) => k)), [linked]);
  const breeders = useMemo(() => [...new Set(search.items.map((i) => i.breeder).filter((b): b is string => !!b))].sort((a, b) => a.localeCompare(b, 'de')), [search.items]);
  const results = useMemo(() => sortStrains(applyFilters(search.items, f, favKeys), sort), [search.items, JSON.stringify(f), favKeys, sort]);
  const localOnly = activeFilters > 0 || sort !== 'source';
  const requestsForAll = Math.ceil(search.total / 100);

  // Endloses Nachladen nur ohne lokale Filter (sonst wäre die Trefferzahl irreführend)
  useEffect(() => {
    const el = sentinel.current;
    if (!el || localOnly || search.complete || search.loading || search.error) return;
    const io = new IntersectionObserver(([e]) => e?.isIntersecting && search.loadMore(), { rootMargin: '600px' });
    io.observe(el);
    return () => io.disconnect();
  }, [localOnly, search.complete, search.loading, search.error, search.loadMore]);

  return (
    <div>
      <DiscoverNav />
      {/* Kopfbereich */}
      <section className="relative mb-6 overflow-hidden rounded-3xl border border-white/[0.06] bg-[radial-gradient(900px_300px_at_15%_-20%,rgb(52_199_123/0.10),transparent_60%),radial-gradient(600px_260px_at_100%_120%,rgb(52_199_123/0.05),transparent_60%)] px-5 py-7 sm:px-8 sm:py-10 animate-fade-up">
        <svg aria-hidden className="pointer-events-none absolute -right-10 -top-10 hidden h-64 w-64 text-leaf-400/[0.07] sm:block" viewBox="0 0 200 200" fill="none" stroke="currentColor" strokeWidth="0.7">
          {Array.from({ length: 7 }, (_, i) => (
            <path key={i} transform={`translate(100 120) rotate(${-60 + i * 20})`} d="M0 0 C 14 -25, 8 -60, 0 -80 C -8 -60, -14 -25, 0 0 Z M0 0 L0 -76" />
          ))}
        </svg>
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-leaf-400/90">Online-Sortenkatalog</p>
        <h1 className="mt-2 max-w-2xl text-3xl font-semibold tracking-tight text-ink-50 sm:text-[40px] sm:leading-[1.1]">Sorten entdecken.</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-ink-400">Dokumentierte Sorten mit Genetik, Cannabinoid-Spannen und Terpenen – jede Angabe mit Quelle und Evidenzstatus.</p>
        <div className="relative mt-6 max-w-2xl">
          <Search className="pointer-events-none absolute left-4 top-1/2 size-5 -translate-y-1/2 text-ink-500" />
          <input
            type="search"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Sorte, Breeder oder Kreuzung suchen …"
            aria-label="Sorten suchen"
            className="h-13 w-full rounded-2xl border border-white/[0.1] bg-ink-900/90 pl-12 pr-24 text-[15px] text-ink-50 shadow-[0_12px_40px_-20px_rgb(0_0_0/0.8)] outline-none transition-colors placeholder:text-ink-500 hover:border-white/[0.16] focus:border-leaf-500/50 focus:ring-4 focus:ring-leaf-500/10"
          />
          <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-1.5">
            {search.loading && <Loader2 className="size-4 animate-spin text-leaf-400" aria-label="Lädt" />}
            {text && (
              <button type="button" onClick={() => setText('')} aria-label="Suche leeren" className="grid size-7 place-items-center rounded-lg text-ink-400 hover:bg-white/[0.06] hover:text-ink-100">
                <X className="size-4" />
              </button>
            )}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-ink-500">
          <span className="flex items-center gap-1.5">
            <Database className="size-3.5" />
            {search.total ? `${search.total.toLocaleString('de-DE')} ${q.get('q') ? 'Treffer' : 'Sorten'}` : '–'}
          </span>
          <a href="https://www.strainapi.com/" target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer" className="hover:text-ink-300">
            Data provided by StrainAPI ↗
          </a>
          {search.fetchedAt && <span>Stand {fmtDateTime(nowLocal(new Date(search.fetchedAt)))}</span>}
          {search.fromCache && (
            <span className="flex items-center gap-1 text-amber-300/90">
              <CloudOff className="size-3.5" /> zwischengespeichert
            </span>
          )}
        </div>
      </section>

      {!settings.discoverNoticeSeen && (
        <div className="mb-5 flex gap-3 rounded-2xl border border-sky-400/15 bg-sky-400/[0.05] p-4 text-[13px] leading-relaxed text-sky-100 animate-fade-up">
          <Info className="mt-0.5 size-4 shrink-0 text-sky-300" />
          <div className="min-w-0 flex-1">
            <strong className="font-semibold">Online-Daten.</strong> Dieser Bereich lädt Sortendaten und Bilder von StrainAPI. Der Anbieter sieht dabei deine IP-Adresse und Suchbegriffe – nicht deine
            Growlogs, Fotos, dein Journal oder deine Sammlung. Antworten werden lokal zwischengespeichert. Online-Abrufe lassen sich in den{' '}
            <a href={href('settings')} className="underline">
              Einstellungen
            </a>{' '}
            abschalten.
          </div>
          <button type="button" className="btn-ghost h-fit p-1.5" aria-label="Hinweis schließen" onClick={() => updateSettings({ discoverNoticeSeen: true })}>
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Filterleiste */}
      <div className="mb-4 flex items-center justify-between gap-3 lg:hidden">
        <button type="button" className="btn-ghost" onClick={() => setDrawer(true)}>
          <SlidersHorizontal className="size-4" /> Filter{activeFilters > 0 && <span className="rounded-full bg-leaf-500/20 px-1.5 text-[11px] text-leaf-200">{activeFilters}</span>}
        </button>
        <button type="button" aria-pressed={f.fav} className={`btn-ghost ${f.fav ? 'border-leaf-500/30 text-leaf-200' : ''}`} onClick={() => set({ fav: f.fav ? undefined : '1' })}>
          <Bookmark className={`size-4 ${f.fav ? 'fill-current' : ''}`} /> Favoriten
        </button>
      </div>
      <div className="card mb-4 hidden grid-cols-[repeat(6,minmax(0,1fr))_auto] items-end gap-3 p-3.5 lg:grid">
        <FilterFields f={f} set={set} breeders={breeders} />
        <button type="button" aria-pressed={f.fav} className={`btn-ghost h-[34px] ${f.fav ? 'border-leaf-500/30 text-leaf-200' : ''}`} onClick={() => set({ fav: f.fav ? undefined : '1' })} title="Nur Favoriten">
          <Bookmark className={`size-4 ${f.fav ? 'fill-current' : ''}`} />
        </button>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-400">
          {localOnly ? (
            <span>
              <span className="font-mono text-ink-100">{results.length}</span> von {search.items.length} geladenen {search.complete ? '(vollständig)' : `– insgesamt ${search.total.toLocaleString('de-DE')}`}
            </span>
          ) : (
            <span>
              <span className="font-mono text-ink-100">{search.items.length}</span> von {search.total.toLocaleString('de-DE')} angezeigt
            </span>
          )}
          {(activeFilters > 0 || q.get('q') || sort !== 'source') && (
            <button type="button" className="text-leaf-300 hover:underline" onClick={resetAll}>
              Alles zurücksetzen
            </button>
          )}
        </div>
        <label className="flex items-center gap-2 text-[12px] text-ink-400">
          Sortierung
          <select className="input-base w-auto py-1.5 text-[12px]" value={sort} onChange={(e) => set({ sort: e.target.value === 'source' ? undefined : e.target.value })}>
            {SORTS.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {localOnly && !search.complete && !search.loading && search.items.length > 0 && (
        <div className="mb-5">
          <Callout tone="warn" title="Filter und Sortierung gelten nur für bereits geladene Sorten">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span>
                Die Quelle unterstützt diese Filter nicht serverseitig. Für ein vollständiges Ergebnis alle {search.total.toLocaleString('de-DE')} {q.get('q') ? 'Treffer' : 'Sorten'} laden ({requestsForAll}{' '}
                {requestsForAll === 1 ? 'Anfrage' : 'Anfragen'}, werden zwischengespeichert).
              </span>
              <button type="button" className="btn-ghost shrink-0" onClick={search.loadAll} disabled={search.loadingMore}>
                {search.loadingMore ? <Loader2 className="size-4 animate-spin" /> : <Database className="size-4" />}
                {search.progress ? `${search.progress.loaded}/${search.progress.total}` : 'Alle laden'}
              </button>
            </div>
          </Callout>
        </div>
      )}
      {localOnly && search.complete && search.items.length > 0 && <p className="mb-4 text-[12px] text-leaf-300/80">✓ Filter auf alle {search.items.length} {q.get('q') ? 'Treffer' : 'Sorten'} der Quelle angewendet.</p>}

      {search.error && search.items.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={search.errorKind === 'offline' ? <WifiOff /> : <CloudOff />}
            title={search.errorKind === 'rate_limited' ? 'Anfragelimit erreicht' : search.errorKind === 'offline' ? 'Keine Verbindung zur Datenquelle' : 'Daten konnten nicht geladen werden'}
            text={
              <>
                {search.error}
                {search.errorKind === 'offline' && ' Gespeicherte Favoriten findest du unter „Meine Sorten“.'}
              </>
            }
            action={
              <>
                <button type="button" className="btn-primary" onClick={search.retry}>
                  <RefreshCw className="size-4" /> Erneut versuchen
                </button>
                <a href={href('strains')} className="btn-ghost">
                  Meine Sorten
                </a>
              </>
            }
          />
        </div>
      ) : search.loading && search.items.length === 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy="true" aria-label="Sorten werden geladen">
          {Array.from({ length: 8 }, (_, i) => (
            <StrainCardSkeleton key={i} />
          ))}
        </div>
      ) : results.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Search />}
            title={f.fav && favKeys.size === 0 ? 'Noch keine Favoriten' : 'Keine passenden Sorten'}
            text={
              f.fav && favKeys.size === 0
                ? 'Mit dem Lesezeichen-Symbol gemerkte Sorten erscheinen hier und unter „Meine Sorten“.'
                : localOnly && !search.complete
                  ? 'In den geladenen Sorten gibt es keine Treffer. Alle laden, um den gesamten Katalog zu durchsuchen.'
                  : 'Suchbegriff oder Filter anpassen.'
            }
            action={
              <button type="button" className="btn-ghost" onClick={resetAll}>
                Zurücksetzen
              </button>
            }
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {results.map((s, i) => (
              <StrainCard key={s.key} strain={s} priority={i < 4} />
            ))}
          </div>
          <div ref={sentinel} className="h-1" />
          <div className="mt-6 flex flex-col items-center gap-2">
            {search.error && <p className="text-[12px] text-rose-300">{search.error}</p>}
            {!search.complete && !localOnly && (
              <button type="button" className="btn-ghost" onClick={search.loadMore} disabled={search.loadingMore}>
                {search.loadingMore ? <Loader2 className="size-4 animate-spin" /> : null} Weitere laden
              </button>
            )}
            {search.complete && <p className="text-[12px] text-ink-500">Alle {search.items.length} Einträge geladen.</p>}
            <p className="max-w-xl text-center text-[11px] leading-relaxed text-ink-600">
              Sortenbilder und -daten: StrainAPI. Bildrechte liegen bei den jeweiligen Rechteinhabern; TERPGRID speichert Bilder nicht dauerhaft. Angaben zu THC/CBD sind Spannen laut Quelle,
              keine Messung deiner Probe.
            </p>
          </div>
        </>
      )}

      <Modal
        open={drawer}
        onClose={() => setDrawer(false)}
        title="Filter"
        size="sm"
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={resetAll}>
              Zurücksetzen
            </button>
            <button type="button" className="btn-primary" onClick={() => setDrawer(false)}>
              {results.length} anzeigen
            </button>
          </>
        }
      >
        <div className="grid gap-4">
          <FilterFields f={f} set={set} breeders={breeders} />
          <p className="hint">Filter werden auf die geladenen Sorten angewendet ({search.items.length} von {search.total}).</p>
        </div>
      </Modal>
    </div>
  );
}
