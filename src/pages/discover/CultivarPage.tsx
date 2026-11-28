import { AlertTriangle, ArrowLeft, Bookmark, BookOpenText, CloudOff, Dna, ExternalLink, GitCompare, GitFork, Link2, Sprout, Store } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { seedFromCatalog, useCompare, useFavoriteToggle, useLinkedStrains } from '../../app/catalog';
import { useData } from '../../app/DataProvider';
import { useAsync, useRememberCultivar } from '../../app/library';
import { href } from '../../app/router';
import { errorText, useToast } from '../../app/Toasts';
import { NoData, RangeMeter, TypeBadge, rangeText } from '../../components/discover/Badges';
import { CatalogFactsRow } from '../../components/discover/CatalogFacts';
import { EvidenceTag } from '../../components/discover/EvidenceTag';
import { SamplesCard } from '../../components/discover/SamplesCard';
import { TerpeneCard } from '../../components/discover/TerpeneCard';
import { ConnectDialog } from '../../components/discover/ConnectDialog';
import { DatasetNotice } from '../../components/discover/DatasetNotice';
import { DiscoverNav } from '../../components/discover/DiscoverNav';
import { AbstractPlaceholder } from '../../components/discover/StrainVisual';
import { JournalFormModal } from '../../components/forms/PersonalForms';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { GENETICS_LABEL, type LibClaim, type LibCultivar, type LibListing, type LibRange, type LibValues, library, listingEvidence, toCatalogStrain } from '../../lib/catalog/library';
import { fmtDate } from '../../lib/dates';
import { ensureStrainForExternal, externalKey } from '../../lib/db/repo';
import { fmt } from '../../lib/format';
import { t } from '../../i18n';

const FIELD_LABEL: Record<string, string> = {
  thc: 'THC',
  cbd: 'CBD',
  get flowering() { return t('discover.cv.flowering'); },
  get heightIndoorCm() { return t('discover.cv.hIn'); },
  get heightOutdoorCm() { return t('discover.cv.hOut'); },
  get yieldIndoorGm2() { return t('discover.cv.yIn'); },
  get yieldOutdoorGPlant() { return t('discover.cv.yOut'); },
  get indica() { return t('discover.cv.ratio'); },
  get geneticsType() { return t('discover.cv.type'); },
  get parents() { return t('discover.cv.lineage'); },
};

function span(r: LibRange | undefined, unit: string): string | undefined {
  if (!r) return undefined;
  if (r.min !== undefined && r.max !== undefined) return r.min === r.max ? `${fmt(r.min)} ${unit}` : `${fmt(r.min)}–${fmt(r.max)} ${unit}`;
  if (r.min !== undefined) return t('discover.cv.from', { v: fmt(r.min), unit });
  if (r.max !== undefined) return t('discover.cv.upTo', { v: fmt(r.max), unit });
  return undefined;
}

function Fact({ label, value, conflict }: { label: string; value?: string; conflict?: boolean }) {
  return (
    <div className="rounded-xl border border-white/[0.05] bg-white/[0.015] px-3 py-2.5">
      <dt className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-ink-500">
        {label}
        {conflict && (
          <span title={t('discover.cv.conflictTitle')} className="text-amber-300">
            <AlertTriangle className="size-3" aria-label={t('discover.cv.conflict')} />
          </span>
        )}
      </dt>
      <dd className={`mt-0.5 font-mono text-[14px] tabular ${value ? 'text-ink-100' : 'text-ink-600'}`}>{value ?? t('discover.cv.na')}</dd>
    </div>
  );
}

function ListingRow({ l }: { l: LibListing }) {
  const v = l.values;
  const bits = [span(v.thc, '% THC'), span(v.cbd, '% CBD'), span(v.flowering, t('discover.cv.days')), v.parents?.length ? v.parents.map((p) => p.name).join(' × ') : undefined].filter(Boolean);
  return (
    <li className="rounded-xl border border-white/[0.05] px-3 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="min-w-0 text-[13px] font-medium text-ink-100">
          <Store className="mr-1.5 inline size-3.5 text-ink-500" />
          {l.seedBank}
        </p>
        <a href={l.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer" className="inline-flex items-center gap-1 text-[11px] text-leaf-300 hover:underline">
          {t('discover.cv.source')} <ExternalLink className="size-3" />
        </a>
      </div>
      <p className="mt-0.5 truncate text-[11px] text-ink-500">
        {t('discover.cv.label', { name: l.nameOriginal })}{l.scrapedAt ? t('discover.cv.scraped', { date: fmtDate(l.scrapedAt) }) : ''}
      </p>
      {bits.length > 0 && <p className="mt-1 text-[12px] text-ink-300">{bits.join(' · ')}</p>}
      {l.rejected.length > 0 && <p className="mt-1 text-[11px] text-amber-300/80">{t('discover.cv.rejected')} {[...new Set(l.rejected.map((r) => FIELD_LABEL[r.replace(/_(min|max)$/, '').replace(/_days$/, '')] ?? r))].join(', ')}</p>}
    </li>
  );
}

/** Kompakte Sortenliste; lange Listen (z. B. Nachkommen) zeigen zuerst {preview} Einträge (6.0.1). */
function MiniList({ items, preview = 8 }: { items: LibCultivar[]; preview?: number }) {
  const [all, setAll] = useState(false);
  const shown = all ? items : items.slice(0, preview);
  return (
    <>
      <ul className="divide-y divide-white/[0.04]">
        {shown.map((c) => (
          <li key={c.id}>
            <a href={href(`discover/cultivar/${c.id}`)} className="flex items-center justify-between gap-3 py-2 text-[13px] hover:text-ink-50">
              <span className="min-w-0 truncate text-ink-200">
                {c.name}
                {c.version ? ` (${c.version})` : ''}
                {c.auto && <span className="ml-1.5 text-[10px] text-ink-500">Auto</span>}
              </span>
              <span className="shrink-0 truncate text-[11px] text-ink-500">{c.breeder.name}</span>
            </a>
          </li>
        ))}
      </ul>
      {items.length > preview && (
        <button type="button" className="mt-2 text-[12.5px] text-ink-300 underline-offset-2 hover:text-ink-50 hover:underline" aria-expanded={all} onClick={() => setAll((v) => !v)}>
          {all ? t('discover.cv.showLess') : t('discover.cv.showAll', { n: items.length })}
        </button>
      )}
    </>
  );
}

export function CultivarPage({ id }: { id: string }) {
  const { data: d, loading, error, notFound, retry } = useAsync((signal) => library.cultivar(id, signal), [id]);
  const { data } = useData();
  const linked = useLinkedStrains();
  const toggleFav = useFavoriteToggle();
  const compare = useCompare();
  const toast = useToast();
  const remember = useRememberCultivar();
  const [connect, setConnect] = useState<'plant' | 'grow' | null>(null);
  const [journalFor, setJournalFor] = useState<string | null>(null);
  const strain = useMemo(() => {
    if (!d) return undefined;
    const s = toCatalogStrain(d.cultivar);
    // Datenlage berücksichtigt freigegebene Datenbank-Angaben (mit eigener Belegart auf der Seite)
    const has = (f: string) => (d.claims ?? []).some((k) => k.field === f);
    if (s.facts) s.facts = { ...s.facts, thc: s.facts.thc || has('thc'), cbd: s.facts.cbd || has('cbd'), terpenes: s.facts.terpenes || has('terpenes'), sources: s.facts.sources + new Set((d.claims ?? []).map((k) => k.provider)).size };
    return s;
  }, [d]);

  useEffect(() => {
    if (d) remember({ id: d.cultivar.id, name: d.cultivar.name, breeder: d.cultivar.breeder.name });
  }, [d?.cultivar.id]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!d || !strain) {
    return (
      <div>
        <DiscoverNav />
        {loading ? (
          <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" aria-busy="true">
            <div className="aspect-[4/3] animate-pulse rounded-3xl bg-ink-800" />
            <div className="space-y-4">
              <div className="h-10 w-2/3 animate-pulse rounded-lg bg-ink-800" />
              <div className="h-32 animate-pulse rounded-2xl bg-ink-800/50" />
            </div>
          </div>
        ) : (
          <div className="card">
            <EmptyState
              icon={<CloudOff />}
              title={notFound ? t('discover.cv.notFound') : t('discover.cv.loadFail')}
              text={notFound ? t('discover.cv.removed') : error}
              action={
                <>
                  {!notFound && (
                    <button type="button" className="btn-primary" onClick={retry}>
                      {t('discover.cv.retry')}
                    </button>
                  )}
                  <a href={href('discover')} className="btn-ghost">
                    {t('discover.cv.toCatalog')}
                  </a>
                </>
              }
            />
          </div>
        )}
      </div>
    );
  }

  const c = d.cultivar;
  const v = c.values;
  const mine = linked.get(externalKey('cisp', c.id));
  const fav = !!mine?.favorite;
  const inCompare = compare.has(strain.key);
  const plants = mine ? data.plants.filter((p) => p.strainId === mine.id) : [];
  const conflict = (f: string) => c.conflicts.includes(f);
  const claimOf = (f: LibClaim['field']) => d.claims?.find((k) => k.field === f);
  const ev = (...keys: (keyof LibValues)[]) => listingEvidence(d, keys);
  const labForMine = mine ? data.labReports.filter((r) => r.strainId === mine.id) : [];

  async function openJournal() {
    try {
      const m = await ensureStrainForExternal(seedFromCatalog(strain!));
      setJournalFor(m.id);
    } catch (e) {
      toast(errorText(e), { tone: 'error' });
    }
  }

  return (
    <div>
      <DiscoverNav />
      <nav aria-label={t('discover.cv.crumbs')} className="mb-4 flex min-w-0 items-center gap-1.5 text-[12px] text-ink-400">
        <a href={href('discover')} className="inline-flex min-h-6 items-center gap-1 hover:text-ink-100">
          <ArrowLeft className="size-3.5" /> {t('discover.cv.catalog')}
        </a>
        <span className="text-ink-600">/</span>
        <a href={href(`discover/breeders/${c.breeder.id}`)} className="inline-flex min-h-6 min-w-0 items-center hover:text-ink-100">
          <span className="truncate">{c.breeder.name}</span>
        </a>
      </nav>

      <section className="mb-6 grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-end animate-fade-up">
        <figure className="relative overflow-hidden rounded-3xl border border-white/[0.06]">
          <AbstractPlaceholder seed={c.id} className="aspect-[4/3] w-full" />
          <figcaption className="absolute bottom-2 left-2 right-2 rounded-md bg-black/55 px-2 py-1 text-[10px] text-ink-300 backdrop-blur">{t('discover.cv.placeholder')}</figcaption>
        </figure>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge type={strain.typeClass} label={strain.type} />
            {c.seedTypes.map((tv) => (
              <span key={tv} className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[11px] text-ink-300">
                {tv}
              </span>
            ))}
            {v.generation && <span className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[11px] text-ink-300">{v.generation}</span>}
          </div>
          <h1 className="page-title mt-3 break-words">
            {c.name}
            {c.version && <span className="text-ink-400"> ({c.version})</span>}
          </h1>
          <p className="mt-2 text-[15px] text-ink-300">
            von{' '}
            <a href={href(`discover/breeders/${c.breeder.id}`)} className="text-leaf-300 hover:underline">
              {c.breeder.name}
            </a>
          </p>
          {c.aliases.length > 0 && <p className="mt-1 text-[12px] text-ink-500">{t('discover.cv.namesAt')} {c.aliases.slice(0, 5).join(' · ')}</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={() => toggleFav(strain)} aria-pressed={fav} className={fav ? 'btn border border-leaf-500/30 bg-leaf-500/10 text-leaf-200' : 'btn-primary'}>
              <Bookmark className={`size-4 ${fav ? 'fill-current' : ''}`} /> {fav ? t('discover.cv.fav') : t('discover.cv.remember')}
            </button>
            <button type="button" className={`btn-ghost ${inCompare ? 'border-sky-400/30 text-sky-200' : ''}`} aria-pressed={inCompare} onClick={() => compare.toggle(strain.key)}>
              <GitCompare className="size-4" /> {inCompare ? t('discover.cv.inCompare') : t('discover.cv.compare')}
            </button>
            {c.parents.length > 0 && (
              <a href={href(`discover/genetics/c/${c.id}`)} className="btn-ghost">
                <Dna className="size-4" /> {t('discover.cv.graph')}
              </a>
            )}
            <button type="button" className="btn-ghost" onClick={() => setConnect('plant')}>
              <Link2 className="size-4" /> {t('discover.cv.link')}
            </button>
            <button type="button" className="btn-ghost" onClick={openJournal}>
              <BookOpenText className="size-4" /> {t('discover.cv.journal')}
            </button>
          </div>
          {strain.facts && (
            <div className="mt-4">
              <p className="mb-1 text-[11px] uppercase tracking-wider text-ink-500">{t('discover.cv.data')}</p>
              <CatalogFactsRow facts={strain.facts} />
            </div>
          )}
          <p className="mt-3 text-[11px] text-ink-500">
            {t('discover.cv.dataFrom', { count: c.listingCount, list: c.seedBanks.join(', ') })}
          </p>
        </div>
      </section>

      {c.conflicts.length > 0 && (
        <div className="mb-5 flex items-start gap-2 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] px-3.5 py-2.5 text-[12px] text-amber-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            Widersprüchliche Angaben zwischen Seedbanks bei: {c.conflicts.map((f) => FIELD_LABEL[f] ?? f).join(', ')}. Angezeigt wird die Gesamtspanne; die Einzelangaben stehen unten bei den Angeboten.
          </p>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="min-w-0 space-y-5">
          <Card title={t('discover.cv.cann')} subtitle={t('discover.cv.cannSub')}>
            {c.thc || c.cbd ? (
              <div className="grid gap-5 sm:grid-cols-2">
                {(['thc', 'cbd'] as const).map((k) => (
                  <div key={k}>
                    <div className="flex items-baseline justify-between">
                      <span className="text-[12px] font-medium uppercase tracking-wider text-ink-400">{k.toUpperCase()}</span>
                      <span className="font-mono text-lg tabular text-ink-50">{rangeText(strain[k]) ?? <span className="text-sm text-ink-600">{t('discover.cv.na')}</span>}</span>
                    </div>
                    <div className="mt-2">
                      <RangeMeter range={strain[k]} max={k === 'thc' ? 35 : 25} color={k === 'thc' ? '#5fe39a' : '#7dd3fc'} label={k.toUpperCase()} />
                    </div>
                    {conflict(k) && <p className="mt-1 text-[11px] text-amber-300/80">{t('discover.cv.disagree')}</p>}
                  </div>
                ))}
              </div>
            ) : (
              <NoData />
            )}
            {(c.thc || c.cbd) && <p className="mt-3"><EvidenceTag kind={c.conflicts.includes('thc') || c.conflicts.includes('cbd') ? 'conflict' : ev('thc', 'cbd')} source="CI-Strains-Pro" /></p>}
            {(claimOf('thc') || claimOf('cbd')) && (
              <div className="mt-3 rounded-xl border border-white/[0.06] px-3 py-2 text-[12px] text-ink-300">
                <p className="mb-1 flex flex-wrap items-center gap-2">
                  Weitere Quelle <EvidenceTag kind="database" source={(claimOf('thc') ?? claimOf('cbd'))!.providerName} />
                </p>
                {(['thc', 'cbd'] as const).map((k) => {
                  const cl = claimOf(k);
                  const r = cl?.value as { min?: number; max?: number } | undefined;
                  return r ? (
                    <p key={k} className="font-mono">
                      {k.toUpperCase()} {r.min === r.max ? `${fmt(r.min ?? 0)} %` : `${fmt(r.min ?? 0)}–${fmt(r.max ?? 0)} %`}
                    </p>
                  ) : null;
                })}
              </div>
            )}
            <p className="hint mt-3">{t('discover.cv.shopNote')}</p>
          </Card>

          <Card title={t('discover.cv.botany')} subtitle={t('discover.cv.bySeedbanks')}>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Fact label={t('discover.cv.type')} value={v.geneticsType ? GENETICS_LABEL[v.geneticsType] : undefined} conflict={conflict('geneticsType')} />
              <Fact label={t('discover.cv.indSat')} value={v.indica !== undefined ? `${fmt(v.indica, 0)} / ${fmt(v.sativa ?? 0, 0)} %` : undefined} conflict={conflict('indica')} />
              <Fact label={t('discover.cv.flowering')} value={span(v.flowering, t('discover.cv.days'))} conflict={conflict('flowering')} />
              <Fact label={t('discover.cv.hIn')} value={span(v.heightIndoorCm, 'cm')} conflict={conflict('heightIndoorCm')} />
              <Fact label={t('discover.cv.hOut')} value={span(v.heightOutdoorCm, 'cm')} conflict={conflict('heightOutdoorCm')} />
              <Fact label={t('discover.cv.yIn')} value={span(v.yieldIndoorGm2, 'g/m²')} conflict={conflict('yieldIndoorGm2')} />
              <Fact label={t('discover.cv.yOut')} value={span(v.yieldOutdoorGPlant, t('discover.cv.gPlant'))} conflict={conflict('yieldOutdoorGPlant')} />
              <Fact label={t('discover.cv.harvestOut')} value={v.harvest} />
            </dl>
          </Card>

          <Card title={t('discover.cv.lineage')} subtitle={t('discover.cv.parentsSub')} icon={<Dna className="size-4" />}>
            {c.parents.length ? (
              <div className="space-y-3">
                <p className="text-[15px] text-ink-100">
                  {c.parents.map((p, i) => (
                    <span key={`${p.slug}-${i}`} className={p.unknown ? 'text-ink-400' : undefined}>
                      {i > 0 && <span className="px-2 text-ink-500">×</span>}
                      {p.unknown ? t('discover.cv.unknownP', { name: p.name }) : p.name}
                    </span>
                  ))}
                </p>
                {conflict('parents') && <p className="text-[12px] text-amber-300/80">{t('discover.cv.diffParents')}</p>}
                <ul className="space-y-2">
                  {d.parentMatches.map((pm) => {
                    const name = c.parents.find((p) => p.slug === pm.slug)?.name ?? pm.slug;
                    return (
                      <li key={pm.slug} className="rounded-xl border border-white/[0.05] px-3 py-2 text-[12px]">
                        <p className="font-medium text-ink-200">{name}</p>
                        {pm.matches.length === 0 ? (
                          <p className="text-ink-500">{t('discover.cv.notOwn')}</p>
                        ) : (
                          <p className="mt-0.5 text-ink-400">
                            {pm.matches.length > 1 && <span className="mr-1 rounded border border-amber-400/25 px-1 text-[10px] text-amber-300">mehrdeutig</span>}
                            {pm.matches.map((m, i) => (
                              <span key={m.id}>
                                {i > 0 && ', '}
                                <a href={href(`discover/cultivar/${m.id}`)} className="text-leaf-300 hover:underline">
                                  {m.breeder}
                                  {m.auto ? ' (Auto)' : ''}
                                </a>
                              </span>
                            ))}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
                <p className="hint">{t('discover.cv.noMerge')}</p>
                {v.parentsFrom === 'text' && <p className="hint">{t('discover.cv.fromText', { text: v.lineageText ?? '' })}</p>}
              </div>
            ) : (
              <NoData text={t('discover.cv.noLineage')} />
            )}
          </Card>

          {(v.lineageText || claimOf('genetics')) && (
            <Card title={t('discover.cv.lineageText')} subtitle={t('discover.cv.lineageTextSub')}>
              <ul className="space-y-1.5 text-[13px] text-ink-200">
                {v.lineageText && (
                  <li className="flex flex-wrap items-center gap-2">
                    „{v.lineageText}“ <EvidenceTag kind={ev('lineageText')} source="CI-Strains-Pro" />
                  </li>
                )}
                {claimOf('genetics') && (
                  <li className="flex flex-wrap items-center gap-2">
                    „{String(claimOf('genetics')!.value)}“ <EvidenceTag kind="database" source={claimOf('genetics')!.providerName} />
                  </li>
                )}
              </ul>
            </Card>
          )}

          <Card title={t('discover.cv.listings')} subtitle={t('discover.cv.listingsSub')} icon={<Store className="size-4" />}>
            <ul className="space-y-2">
              {d.listings.map((l) => (
                <ListingRow key={l.id} l={l} />
              ))}
            </ul>
          </Card>
        </div>

        <div className="min-w-0 space-y-5">
          <TerpeneCard detail={d} labReports={labForMine} hasSamples={!!d.samples?.terpeneSamples} />
          {d.samples && <SamplesCard s={d.samples} cultivarName={[d.cultivar.name, d.cultivar.version].filter(Boolean).join(' ')} ownReports={labForMine} />}

          {claimOf('description') && (
            <Card title={t('discover.cv.desc')} subtitle={t('discover.cv.descSub')}>
              <p className="text-[13px] leading-relaxed text-ink-300">{String(claimOf('description')!.value)}</p>
              <p className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-ink-500">
                <EvidenceTag kind="database" source={claimOf('description')!.providerName} />
                {claimOf('description')!.sourceUrl && (
                  <a href={claimOf('description')!.sourceUrl!} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer" className="text-leaf-300 hover:underline">
                    {t('discover.cv.source')}
                  </a>
                )}
              </p>
            </Card>
          )}

          <Card title={t('discover.cv.aroma')} subtitle={t('discover.cv.aromaSub')}>
            {(v.flavors?.length ?? 0) > 0 && (
              <div className="mb-3">
                <p className="mb-1.5 flex items-center gap-2 text-[11px] uppercase tracking-wider text-ink-500">
                  Aroma <EvidenceTag kind={ev('flavors')} />
                </p>
                <p className="text-[13px] text-ink-300">{v.flavors!.join(', ')}</p>
              </div>
            )}
            {claimOf('aroma') && (
              <div className="mb-3">
                <p className="mb-1.5 flex items-center gap-2 text-[11px] uppercase tracking-wider text-ink-500">
                  Aroma <EvidenceTag kind="database" source={claimOf('aroma')!.providerName} />
                </p>
                <p className="text-[13px] text-ink-300">{(claimOf('aroma')!.value as string[]).join(', ')}</p>
              </div>
            )}
            {(v.effects?.length ?? 0) > 0 && (
              <div>
                <p className="mb-1.5 text-[11px] uppercase tracking-wider text-ink-500">{t('discover.cv.effects')}</p>
                <p className="text-[13px] text-ink-300">{v.effects!.join(', ')}</p>
                <p className="hint mt-1">{t('discover.cv.effectsNote')}</p>
              </div>
            )}
            {!v.flavors?.length && !claimOf('aroma') && !v.effects?.length && <NoData text={t('discover.cv.noAroma')} />}
          </Card>

          <Card title={t('discover.cv.personal')} icon={<Sprout className="size-4" />}>
            {mine ? (
              <div className="space-y-2 text-[13px]">
                <a href={href(`strains/${mine.id}`)} className="flex items-center justify-between rounded-lg border border-white/[0.06] px-3 py-2 hover:border-white/[0.14]">
                  <span className="text-ink-100">{t('discover.cv.openMine')}</span>
                  <span className="text-[11px] text-ink-500">{fav ? t('discover.cv.fav') : 'gespeichert'}</span>
                </a>
                {plants.length > 0 ? (
                  <ul className="space-y-1">
                    {plants.map((p) => (
                      <li key={p.id}>
                        <a href={href(`grows/${p.growId}/plants/${p.id}`)} className="text-leaf-300 hover:underline">
                          {p.name}
                        </a>
                        <span className="text-ink-500"> · {data.grows.find((g) => g.id === p.growId)?.name}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-ink-500">{t('discover.cv.noPlants')}</p>
                )}
              </div>
            ) : (
              <p className="text-[13px] text-ink-500">{t('discover.cv.notMine')}</p>
            )}
            <button type="button" className="btn-ghost mt-3 py-1.5 text-xs" onClick={() => setConnect('grow')}>
              <Sprout className="size-3.5" /> {t('discover.cv.assign')}
            </button>
          </Card>

          {d.sameName.length > 0 && (
            <Card title={t('discover.cv.otherBreeders', { name: c.name })} subtitle={t('discover.cv.independent')}>
              <MiniList items={d.sameName} />
            </Card>
          )}

          {(d.siblings?.length ?? 0) > 0 && (
            <Card title={t('discover.cv.sameParents')} subtitle={t('discover.cv.sameParentsSub')}>
              <MiniList items={d.siblings!} />
            </Card>
          )}

          {(d.breederMore?.length ?? 0) > 0 && (
            <Card
              title={t('discover.cv.moreFrom', { name: c.breeder.name })}
              actions={
                <a href={href(`discover/breeders/${c.breeder.id}`)} className="btn-ghost py-1.5 text-xs">
                  {t('discover.cv.all')}
                </a>
              }
            >
              <MiniList items={d.breederMore!} />
            </Card>
          )}

          <Card title={t('discover.cv.offspring')} subtitle={d.childCount ? t('discover.cv.children', { n: d.childCount, name: c.name }) : undefined} icon={<GitFork className="size-4" />}>
            {d.children.length ? (
              <>
                <MiniList items={d.children} />
                {d.childCount > d.children.length && <p className="hint mt-2">{t('discover.cv.showsTop', { n: d.children.length })}</p>}
              </>
            ) : (
              <NoData text={t('discover.cv.noChildren')} />
            )}
          </Card>

          <DatasetNotice status={{ attribution: d.attribution, version: d.dataset?.version, importedAt: d.dataset?.importedAt }} />
          {[...new Map((d.claims ?? []).map((k) => [k.provider, k])).values()].map((k) => (
            <p key={k.provider} className="card p-4 text-[12px] leading-relaxed text-ink-400">
              Data provided by{' '}
              <a href={k.providerUrl} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer" className="text-leaf-300 hover:underline">
                {k.providerName}
              </a>
              . Zwischengespeichert gemäß den Nutzungsbedingungen der Quelle, abgerufen am {fmtDate(String(k.retrievedAt).slice(0, 10))}; Angaben einer Sortendatenbank, nicht laborbestätigt.
            </p>
          ))}
        </div>
      </div>

      {connect && <ConnectDialog strain={strain} initialMode={connect} onClose={() => setConnect(null)} />}
      {journalFor && <JournalFormModal open onClose={() => setJournalFor(null)} strainId={journalFor} />}
    </div>
  );
}
