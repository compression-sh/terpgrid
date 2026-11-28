import { GitCompare, Leaf, Loader2, Plus, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { catalogErrorText, useCompare, MAX_COMPARE } from '../../app/catalog';
import { useData } from '../../app/DataProvider';
import { href } from '../../app/router';
import { EvidenceBadge, NoData, TYPE_META, TypeBadge, rangeText } from '../../components/discover/Badges';
import { DiscoverNav } from '../../components/discover/DiscoverNav';
import { StrainVisual } from '../../components/discover/StrainVisual';
import { TerpeneChips } from '../../components/discover/TerpeneChips';
import { PhotoImg } from '../../components/photos/PhotoImg';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { Segmented } from '../../components/ui/Segmented';
import { matchTerpene } from '../../lib/catalog/terpenes';
import { catalog } from '../../lib/catalog/service';
import { strainLink } from '../../lib/catalog/links';
import { type LibSampleSummary, library, toCatalogStrain } from '../../lib/catalog/library';
import { SAMPLE_TERPENES } from '../../lib/catalog/samples';
import type { CatalogImage, CatalogStrain, EvidenceState, TypeClass, ValueRange } from '../../lib/catalog/types';
import type { Strain } from '../../lib/db/types';
import { CLAIM_SOURCE_LABEL } from '../../lib/grow/labels';
import { t, intlLocale } from '../../i18n';

/** Gemeinsames Vergleichsmodell für Online- und eigene Sorten. */
interface CompareItem {
  key: string;
  name: string;
  breeder?: string;
  genetics?: string;
  type?: string;
  typeClass: TypeClass;
  thc?: ValueRange;
  cbd?: ValueRange;
  thcNote?: string;
  cbdNote?: string;
  terpenes: string[];
  aroma: string[];
  image?: CatalogImage;
  photoId?: string;
  evidence: Partial<Record<string, EvidenceState>>;
  source: string;
  link: string;
  /** Öffentliche Laborproben gleichnamiger Produkte (nur Katalogsorten, keine Breeder-Zuordnung) */
  samples?: LibSampleSummary;
}

function fromCatalog(s: CatalogStrain): CompareItem {
  return {
    key: s.key,
    name: s.name,
    breeder: s.breeder,
    genetics: s.genetics,
    type: s.type,
    typeClass: s.typeClass,
    thc: s.thc,
    cbd: s.cbd,
    terpenes: s.terpenes,
    aroma: s.aroma,
    image: s.image,
    evidence: s.evidence,
    source: s.provider === 'cisp' ? t('discover.cs.cisp') : 'StrainAPI',
    link: strainLink(s),
  };
}

function fromMine(s: Strain): CompareItem {
  const v = (x?: { value: number }) => (x ? ({ value: x.value, unit: '%' } as ValueRange) : undefined);
  return {
    key: `mine:${s.id}`,
    name: s.name,
    breeder: s.breeder,
    genetics: s.genetics,
    type: s.reportedType,
    typeClass: s.reportedType ?? 'unknown',
    thc: v(s.thc),
    cbd: v(s.cbd),
    thcNote: s.thc ? CLAIM_SOURCE_LABEL[s.thc.source] : undefined,
    cbdNote: s.cbd ? CLAIM_SOURCE_LABEL[s.cbd.source] : undefined,
    terpenes: s.terpenes.map((tv) => tv.name),
    aroma: s.aromas,
    photoId: s.coverPhotoId,
    evidence: {},
    source: s.external ? t('discover.cs.mineLinked') : t('discover.cs.mine'),
    link: `strains/${s.id}`,
  };
}

function useCompareItems(keys: string[]) {
  const { data } = useData();
  const [online, setOnline] = useState<Record<string, CatalogStrain | { error: string }>>({});
  const [samples, setSamples] = useState<Record<string, LibSampleSummary | undefined>>({});
  useEffect(() => {
    const c = new AbortController();
    for (const k of keys) {
      if (online[k]) continue;
      if (k.startsWith('cisp:')) {
        library
          .cultivar(k.slice(5), c.signal)
          .then((r) => {
            setSamples((x) => ({ ...x, [k]: r.samples }));
            setOnline((o) => ({ ...o, [k]: toCatalogStrain(r.cultivar) }));
          })
          .catch((e) => setOnline((o) => ({ ...o, [k]: { error: catalogErrorText(e) } })));
        continue;
      }
      if (!k.startsWith('strainapi:')) continue;
      catalog
        .detail(k.slice('strainapi:'.length), c.signal)
        .then((r) => setOnline((o) => ({ ...o, [k]: r.strain })))
        .catch((e) => setOnline((o) => ({ ...o, [k]: { error: catalogErrorText(e) } })));
    }
    return () => c.abort();
  }, [keys.join('|')]); // eslint-disable-line react-hooks/exhaustive-deps
  return keys.map((k) => {
    if (k.startsWith('mine:')) {
      const s = data.strains.find((x) => x.id === k.slice(5));
      return s ? { key: k, item: fromMine(s) } : { key: k, error: t('discover.cs.gone') };
    }
    const o = online[k];
    if (!o) return { key: k, loading: true as const };
    if ('error' in o) return { key: k, error: o.error };
    return { key: k, item: { ...fromCatalog(o), samples: samples[k] } };
  });
}

function AddDialog({ onClose }: { onClose: () => void }) {
  const compare = useCompare();
  const { data } = useData();
  const [tab, setTab] = useState<'online' | 'mine'>('online');
  const [q, setQ] = useState('');
  const [items, setItems] = useState<CatalogStrain[]>([]);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (tab !== 'online' || !q.trim()) return setItems([]);
    const c = new AbortController();
    setLoading(true);
    const tv = window.setTimeout(() => catalog.search(q, 1, 12, c.signal).then((p) => setItems(p.items)).catch(() => setItems([])).finally(() => setLoading(false)), 300);
    return () => {
      window.clearTimeout(tv);
      c.abort();
    };
  }, [q, tab]);
  const mine = data.strains.filter((s) => !s.external && s.name.toLowerCase().includes(q.toLowerCase()));
  const Row = ({ k, name, sub }: { k: string; name: string; sub?: string }) => (
    <li>
      <button type="button" onClick={() => compare.toggle(k)} className="flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left hover:bg-white/[0.04]">
        <span className="min-w-0">
          <span className="block truncate text-[13px] text-ink-100">{name}</span>
          <span className="block truncate text-[11px] text-ink-500">{sub}</span>
        </span>
        <span className={`shrink-0 text-xs ${compare.has(k) ? 'text-sky-300' : 'text-ink-500'}`}>{compare.has(k) ? t('discover.cs.selected') : t('discover.cs.add')}</span>
      </button>
    </li>
  );
  return (
    <Modal open onClose={onClose} title={t('discover.cs.pickTitle')} subtitle={t('discover.cs.picked', { n: compare.keys.length, max: MAX_COMPARE })} size="md" footer={<button type="button" className="btn-primary" onClick={onClose}>{t('discover.cs.done')}</button>}>
      <div className="space-y-3">
        <Segmented value={tab} onChange={setTab} options={[{ value: 'online', label: t('discover.cs.online') }, { value: 'mine', label: t('discover.cs.own') }]} />
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-500" />
          <input className="input-base pl-9" placeholder={t('discover.cs.searchPh')} value={q} onChange={(e) => setQ(e.target.value)} aria-label={t('discover.cs.searchAria')} autoFocus />
          {loading && <Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-leaf-400" />}
        </div>
        <ul className="max-h-80 overflow-y-auto">
          {tab === 'online'
            ? items.map((s) => <Row key={s.key} k={s.key} name={s.name} sub={[s.breeder, s.genetics].filter(Boolean).join(' · ')} />)
            : mine.map((s) => <Row key={s.id} k={`mine:${s.id}`} name={s.name} sub={s.breeder ?? t('discover.cs.ownEntry')} />)}
        </ul>
        {tab === 'mine' && <p className="hint">{t('discover.cs.linkedHint')}</p>}
      </div>
    </Modal>
  );
}

function RangeBars({ items, field }: { items: CompareItem[]; field: 'thc' | 'cbd' }) {
  const highest = Math.max(0, ...items.map((i) => i[field]?.max ?? i[field]?.value ?? i[field]?.min ?? 0));
  const max = Math.max(field === 'thc' ? 35 : 25, Math.ceil(highest / 5) * 5);
  return (
    <div className="space-y-2.5">
      {items.map((it) => {
        const r = it[field];
        // „bis X“ (nur Obergrenze) wird als Spanne ab 0 dargestellt und abgeschwächt.
        const upperOnly = r !== undefined && r.min === undefined && r.value === undefined && r.max !== undefined;
        const lo = upperOnly ? 0 : (r?.min ?? r?.value ?? r?.max);
        const hi = r?.max ?? r?.value ?? r?.min;
        return (
          <div key={it.key} className="grid grid-cols-[minmax(0,8rem)_1fr_5.5rem] items-center gap-3">
            <span className="truncate text-[12px] text-ink-300">{it.name}</span>
            <div className="relative h-2 rounded-full bg-ink-700">
              {lo !== undefined && hi !== undefined && (
                <div className="absolute inset-y-0 rounded-full" style={{ left: `${Math.min(100, (lo / max) * 100)}%`, width: `${Math.max(1.5, Math.min(100 - (lo / max) * 100, ((hi - lo) / max) * 100))}%`, background: field === 'thc' ? '#5fe39a' : '#38bdf8', opacity: upperOnly ? 0.35 : 1 }} title={upperOnly ? t('discover.cs.onlyMax') : undefined} />
              )}
            </div>
            <span className={`text-right font-mono text-[12px] ${r ? 'text-ink-100' : 'text-ink-600'}`}>{rangeText(r) ?? t('discover.cs.na')}</span>
          </div>
        );
      })}
      <div className="grid grid-cols-[minmax(0,8rem)_1fr_5.5rem] gap-3 text-[9px] text-ink-600">
        <span />
        <span className="flex justify-between font-mono">
          <span>0</span>
          <span>{max} %</span>
        </span>
      </div>
    </div>
  );
}

export function CompareStudio() {
  const compare = useCompare();
  const resolved = useCompareItems(compare.keys);
  const items = resolved.map((r) => ('item' in r ? r.item : undefined)).filter((x): x is CompareItem => !!x);
  const [adding, setAdding] = useState(false);
  const [diffOnly, setDiffOnly] = useState(false);

  const allTerps = useMemo(() => {
    const sets = items.map((i) => new Set(i.terpenes.map((tv) => matchTerpene(tv)?.id ?? tv.toLowerCase())));
    const common = sets.length ? [...sets[0]!].filter((tv) => sets.every((s) => s.has(tv))) : [];
    return new Set(common);
  }, [items]);

  type Row = { label: string; render: (i: CompareItem) => React.ReactNode; value: (i: CompareItem) => string };
  const rows: Row[] = [
    { label: 'Breeder', render: (i) => i.breeder ?? <NoData />, value: (i) => (i.breeder ?? '').toLowerCase() },
    { get label() { return t('discover.cs.type'); }, render: (i) => <TypeBadge type={i.typeClass} label={i.type} />, value: (i) => i.typeClass },
    {
      get label() { return t('discover.cs.genetics'); },
      render: (i) =>
        i.genetics ? (
          <span>
            {i.genetics} <EvidenceBadge state={i.evidence.genetics} />
          </span>
        ) : (
          <NoData />
        ),
      value: (i) => (i.genetics ?? '').toLowerCase(),
    },
    {
      label: 'THC',
      render: (i) =>
        i.thc ? (
          <span className="font-mono">
            {rangeText(i.thc)} <EvidenceBadge state={i.evidence.thc} />
            {i.thcNote && <span className="ml-1 font-sans text-[10px] text-ink-500">{i.thcNote}</span>}
          </span>
        ) : (
          <NoData />
        ),
      value: (i) => rangeText(i.thc) ?? '',
    },
    {
      label: 'CBD',
      render: (i) =>
        i.cbd ? (
          <span className="font-mono">
            {rangeText(i.cbd)} <EvidenceBadge state={i.evidence.cbd} />
            {i.cbdNote && <span className="ml-1 font-sans text-[10px] text-ink-500">{i.cbdNote}</span>}
          </span>
        ) : (
          <NoData />
        ),
      value: (i) => rangeText(i.cbd) ?? '',
    },
    {
      get label() { return t('discover.cs.terps'); },
      render: (i) =>
        i.terpenes.length ? (
          <div className="flex flex-wrap gap-1">
            {i.terpenes.map((tv) => {
              const shared = allTerps.has(matchTerpene(tv)?.id ?? tv.toLowerCase());
              return (
                <span key={tv} className={`rounded-full px-2 py-0.5 text-[11px] ${shared && items.length > 1 ? 'bg-leaf-500/15 text-leaf-200' : 'bg-white/[0.04] text-ink-300'}`} title={shared ? t('discover.cs.all') : undefined}>
                  {matchTerpene(tv)?.name ?? tv}
                </span>
              );
            })}
          </div>
        ) : (
          <NoData />
        ),
      value: (i) => i.terpenes.map((tv) => matchTerpene(tv)?.id ?? tv).sort().join(','),
    },
    {
      get label() { return t('discover.cs.samples'); },
      render: (i) =>
        i.samples ? (
          <span className="text-[12px] text-ink-300">
            <span className="font-mono tabular text-ink-100">{i.samples.samples.toLocaleString(intlLocale())}</span> Proben
            {i.samples.stats.thc_total && (
              <>
                {' '}
                · Gesamt-THC Median <span className="font-mono tabular text-ink-100">{i.samples.stats.thc_total.median.toLocaleString(intlLocale(), { maximumFractionDigits: 1 })} %</span>
              </>
            )}
            <span className="block text-[10.5px] text-amber-200/80">{t('discover.cs.noBreeder')}{i.samples.sameNameBreeders > 1 ? t('discover.cs.nameAt', { n: i.samples.sameNameBreeders }) : ''}</span>
          </span>
        ) : (
          <NoData />
        ),
      value: (i) => (i.samples ? String(i.samples.stats.thc_total?.median ?? '') : ''),
    },
    {
      get label() { return t('discover.cs.sampleTerps'); },
      render: (i) => {
        const top = i.samples
          ? SAMPLE_TERPENES.map((tv) => ({ tv, st: i.samples!.stats[tv.column] }))
              .filter((x) => x.st && x.st.median > 0)
              .sort((a, b) => b.st!.median - a.st!.median)
              .slice(0, 3)
          : [];
        return top.length ? (
          <span className="text-[12px] text-ink-300">
            {top.map((x) => `${x.tv.label}${x.tv.isomerSum ? ' (Σ)' : ''} ${x.st!.median.toLocaleString(intlLocale(), { maximumFractionDigits: 2 })} %`).join(' · ')}
          </span>
        ) : (
          <NoData />
        );
      },
      value: (i) => (i.samples ? SAMPLE_TERPENES.map((tv) => i.samples!.stats[tv.column]?.median ?? '').join(',') : ''),
    },
    { get label() { return t('discover.cs.aroma'); }, render: (i) => (i.aroma.length ? <span className="text-ink-300">{i.aroma.join(', ')}</span> : <NoData />), value: (i) => i.aroma.map((a) => a.toLowerCase()).sort().join(',') },
    {
      get label() { return t('discover.cs.source'); },
      render: (i) => (
        <a href={href(i.link)} className="text-[12px] text-leaf-300 hover:underline">
          {i.source}
        </a>
      ),
      value: (i) => i.source,
    },
  ];
  const differs = (r: Row) => new Set(items.map(r.value)).size > 1;
  const shownRows = diffOnly ? rows.filter(differs) : rows;
  const cols = `minmax(7.5rem,9rem) repeat(${Math.max(1, resolved.length)}, minmax(11rem, 1fr))`;

  return (
    <div>
      <DiscoverNav />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between animate-fade-up">
        <div>
          <h1 className="page-title mt-2">{t('discover.cs.title')}</h1>
          <p className="mt-1 text-sm text-ink-400">{t('discover.cs.subtitle')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {items.length > 1 && (
            <button type="button" className={`btn-ghost ${diffOnly ? 'border-amber-400/30 text-amber-200' : ''}`} aria-pressed={diffOnly} onClick={() => setDiffOnly((d) => !d)}>
              {t('discover.cs.diffOnly')}
            </button>
          )}
          <button type="button" className="btn-primary" onClick={() => setAdding(true)} disabled={compare.keys.length >= MAX_COMPARE}>
            <Plus className="size-4" /> {t('discover.cs.strain')}
          </button>
        </div>
      </div>

      {compare.keys.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<GitCompare />}
            title={t('discover.cs.empty')}
            text={t('discover.cs.emptyText')}
            action={
              <>
                <button type="button" className="btn-primary" onClick={() => setAdding(true)}>
                  <Plus className="size-4" /> {t('discover.cs.pick')}
                </button>
                <a className="btn-ghost" href={href('discover')}>
                  {t('discover.cs.toDiscover')}
                </a>
              </>
            }
          />
        </div>
      ) : (
        <div className="space-y-5">
          <div className="card overflow-x-auto">
            <div className="min-w-fit">
              <div className="grid gap-3 border-b border-white/[0.05] p-4" style={{ gridTemplateColumns: cols }}>
                <div />
                {resolved.map((r) => (
                  <div key={r.key} className="relative min-w-0">
                    <button type="button" onClick={() => compare.remove(r.key)} aria-label={t('discover.cs.remove')} className="absolute right-1.5 top-1.5 z-10 grid size-7 place-items-center rounded-full bg-black/60 text-ink-200 backdrop-blur hover:bg-black/80">
                      <X className="size-3.5" />
                    </button>
                    {'item' in r && r.item ? (
                      <a href={href(r.item.link)} className="block">
                        {r.item.photoId ? <PhotoImg photoId={r.item.photoId} alt={r.item.name} className="aspect-[4/3] w-full rounded-xl" /> : <StrainVisual image={r.item.image} name={r.item.name} className="aspect-[4/3] w-full rounded-xl" />}
                        <div className="mt-2 truncate text-[14px] font-semibold text-ink-50">{r.item.name}</div>
                        <div className="flex items-center gap-1 text-[11px] text-ink-500">
                          {r.key.startsWith('mine:') && <Leaf className="size-3" />}
                          {r.item.source}
                        </div>
                      </a>
                    ) : 'error' in r ? (
                      <div className="grid aspect-[4/3] place-items-center rounded-xl border border-dashed border-white/[0.1] p-3 text-center text-[12px] text-ink-500">{r.error}</div>
                    ) : (
                      <div className="aspect-[4/3] animate-pulse rounded-xl bg-ink-800" />
                    )}
                  </div>
                ))}
              </div>
              {shownRows.map((row) => {
                const diff = items.length > 1 && differs(row);
                return (
                  <div key={row.label} className={`grid gap-3 border-b border-white/[0.04] px-4 py-3 last:border-0 ${diff && diffOnly === false ? 'bg-amber-400/[0.025]' : ''}`} style={{ gridTemplateColumns: cols }}>
                    <div className="flex items-start gap-1.5 text-[12px] text-ink-500">
                      {row.label}
                      {diff && <span className="mt-1 size-1.5 shrink-0 rounded-full bg-amber-300/70" title={t('discover.cs.differs')} />}
                    </div>
                    {resolved.map((r) => (
                      <div key={r.key} className="min-w-0 text-[13px] text-ink-200">
                        {'item' in r && r.item ? row.render(r.item) : <span className="text-ink-600">–</span>}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>
          </div>

          {items.length > 0 && (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              <Card title={t('discover.cs.thcRanges')} subtitle={t('discover.cs.scale')}>
                <RangeBars items={items} field="thc" />
              </Card>
              <Card title={t('discover.cs.cbdRanges')} subtitle={t('discover.cs.scale')}>
                <RangeBars items={items} field="cbd" />
              </Card>
            </div>
          )}
          {items.length > 1 && (
            <Card title={t('discover.cs.common')} subtitle={t('discover.cs.commonSub')}>
              {allTerps.size ? <TerpeneChips names={[...allTerps]} max={10} /> : <p className="hint">{t('discover.cs.noCommon')}</p>}
              <p className="hint mt-3">{t('discover.cs.noRadar')}</p>
            </Card>
          )}
          <p className="text-[11px] text-ink-600">
            {t('discover.cs.footer', { origins: Object.values(CLAIM_SOURCE_LABEL).join(', '), types: Object.values(TYPE_META).map((tv) => tv.label).join(', ') })}
          </p>
        </div>
      )}
      {adding && <AddDialog onClose={() => setAdding(false)} />}
    </div>
  );
}
