import { ArrowLeft, Bookmark, BookOpenText, CloudOff, Dna, ExternalLink, GitCompare, Link2, Loader2, Microscope, RefreshCw, Sprout } from 'lucide-react';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { seedFromCatalog, useCompare, useFavoriteToggle, useLinkedStrains, useStrainDetail } from '../../app/catalog';
import { useData } from '../../app/DataProvider';
import { errorText, useToast } from '../../app/Toasts';
import { href } from '../../app/router';
import { EvidenceBadge, NoData, RangeMeter, TypeBadge, rangeText } from '../../components/discover/Badges';
import { ConnectDialog } from '../../components/discover/ConnectDialog';
import { DiscoverNav } from '../../components/discover/DiscoverNav';
import { ResearchPanel, useResearch } from '../../components/discover/ResearchPanel';
import { StrainVisual } from '../../components/discover/StrainVisual';
import { JournalFormModal } from '../../components/forms/PersonalForms';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { namesIn, parseGenetics } from '../../lib/catalog/genetics';
import { matchTerpene, terpeneLabel } from '../../lib/catalog/terpenes';
import type { CatalogStrain, EvidenceState } from '../../lib/catalog/types';
import { fmtDate, fmtDateTime, nowLocal } from '../../lib/dates';
import { ensureStrainForExternal, externalKey } from '../../lib/db/repo';
import { fmt } from '../../lib/format';
import { t } from '../../i18n';

function Section({ title, evidence, children }: { title: string; evidence?: EvidenceState; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-ink-500">{title}</h3>
        <EvidenceBadge state={evidence} />
      </div>
      {children}
    </div>
  );
}

function Facts({ s }: { s: CatalogStrain }) {
  const d = s.detail;
  const rows: { label: string; value?: string; ev?: EvidenceState }[] = [
    { get label() { return t('discover.sp.seed'); }, value: s.seedType, ev: s.evidence.seed_type },
    { get label() { return t('discover.sp.ratio'); }, value: s.indicaPercent !== undefined || s.sativaPercent !== undefined ? `${s.indicaPercent ?? '?'} % / ${s.sativaPercent ?? '?'} %` : undefined, ev: s.evidence.indica_sativa_ratio },
    { get label() { return t('discover.sp.flowering'); }, value: s.flowering && (s.flowering.minDays || s.flowering.maxDays) ? t('discover.sp.days', { range: `${s.flowering.minDays ?? '?'}–${s.flowering.maxDays ?? '?'}` }) : undefined, ev: s.evidence.flowering_time },
    { get label() { return t('discover.sp.structure'); }, value: d?.plantStructure, ev: s.evidence.plant_structure },
    { get label() { return t('discover.sp.yield'); }, value: d?.yield, ev: s.evidence.yield },
    { get label() { return t('discover.sp.outdoor'); }, value: d?.outdoorHarvest, ev: s.evidence.outdoor_harvest },
  ];
  return (
    <dl className="divide-y divide-white/[0.05]">
      {rows.map((r) => (
        <div key={r.label} className="grid grid-cols-[9rem_1fr] gap-3 py-2.5 first:pt-0 last:pb-0 sm:grid-cols-[11rem_1fr]">
          <dt className="text-[12px] text-ink-500">{r.label}</dt>
          <dd className="flex flex-wrap items-center gap-2 text-[13px] text-ink-200">
            {r.value ?? <NoData />}
            {r.value && <EvidenceBadge state={r.ev} />}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function StrainProfile({ slug }: { slug: string }) {
  const { strain: s, loading, error, errorKind, fromCache, fetchedAt, retry } = useStrainDetail(slug);
  const { data } = useData();
  const linked = useLinkedStrains();
  const toggleFav = useFavoriteToggle();
  const compare = useCompare();
  const toast = useToast();
  const research = useResearch();
  const [connect, setConnect] = useState<'plant' | 'grow' | null>(null);
  const [journalFor, setJournalFor] = useState<string | null>(null);

  if (loading && !s) {
    return (
      <div>
        <DiscoverNav />
        <div className="grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]" aria-busy="true">
          <div className="aspect-square animate-pulse rounded-3xl bg-ink-800" />
          <div className="space-y-4">
            <div className="h-10 w-2/3 animate-pulse rounded-lg bg-ink-800" />
            <div className="h-4 w-1/3 animate-pulse rounded bg-ink-800/70" />
            <div className="h-32 animate-pulse rounded-2xl bg-ink-800/50" />
          </div>
        </div>
      </div>
    );
  }
  if (!s) {
    return (
      <div>
        <DiscoverNav />
        <div className="card">
          <EmptyState
            icon={<CloudOff />}
            title={errorKind === 'not_found' ? t('discover.sp.notFound') : t('discover.sp.loadFail')}
            text={error}
            action={
              <>
                {errorKind !== 'not_found' && (
                  <button type="button" className="btn-primary" onClick={retry}>
                    <RefreshCw className="size-4" /> {t('discover.sp.retry')}
                  </button>
                )}
                <a href={href('discover')} className="btn-ghost">
                  {t('discover.sp.toOverview')}
                </a>
              </>
            }
          />
        </div>
      </div>
    );
  }

  const mine = linked.get(externalKey(s.provider, s.id));
  const fav = !!mine?.favorite;
  const inCompare = compare.has(s.key);
  const genetics = parseGenetics(s.genetics);
  const plants = mine ? data.plants.filter((p) => p.strainId === mine.id) : [];
  const journal = mine ? data.journal.filter((j) => j.strainId === mine.id) : [];
  const labReports = mine ? data.labReports.filter((r) => r.strainId === mine.id && r.terpenes.length > 0) : [];
  const latestLab = [...labReports].sort((a, b) => (b.testDate ?? '').localeCompare(a.testDate ?? ''))[0];
  const descriptionBlocks = s.detail?.blocks ?? [];
  const derived = s.detail?.description && descriptionBlocks.length === 0;

  async function openJournal() {
    try {
      const m = await ensureStrainForExternal(seedFromCatalog(s!));
      setJournalFor(m.id);
    } catch (e) {
      toast(errorText(e), { tone: 'error' });
    }
  }

  return (
    <div>
      <DiscoverNav />
      <a href={href('discover')} className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-ink-400 hover:text-ink-100">
        <ArrowLeft className="size-3.5" /> {t('discover.sp.discover')}
      </a>

      {/* Hero */}
      <section className="mb-6 grid gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-end animate-fade-up">
        <figure className="relative overflow-hidden rounded-3xl border border-white/[0.06]">
          <StrainVisual image={s.image} name={s.name} eager className="aspect-square w-full" />
          {s.image && (
            <figcaption className="absolute bottom-2 left-2 right-2 truncate rounded-md bg-black/55 px-2 py-1 text-[10px] text-ink-300 backdrop-blur">
              Bild: <a href={s.image.creditUrl} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer" className="underline">{s.image.credit}</a> · Rechte beim jeweiligen Rechteinhaber
            </figcaption>
          )}
        </figure>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <TypeBadge type={s.typeClass} label={s.type} />
            <EvidenceBadge state={s.evidence.type} />
            {fromCache && (
              <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/20 px-2 py-0.5 text-[10px] text-amber-300">
                <CloudOff className="size-3" /> zwischengespeichert
              </span>
            )}
          </div>
          <h1 className="page-title mt-3">{s.name}</h1>
          {research.profile && research.profile.aliases.length > 1 && <p className="mt-1.5 text-[13px] text-ink-500">auch: {research.profile.aliases.filter((a) => a.toLowerCase() !== s.name.toLowerCase()).slice(0, 4).join(', ')}</p>}
          <p className="mt-2 flex flex-wrap items-center gap-2 text-[15px] text-ink-300">
            {s.breeder ?? <span className="text-ink-500">{t('discover.sp.noBreeder')}</span>}
            {s.breeder && <EvidenceBadge state={s.evidence.breeder} />}
          </p>
          {s.excerpt && <p className="mt-4 max-w-2xl text-[14px] leading-relaxed text-ink-300">{s.excerpt}</p>}
          <div className="mt-5 flex flex-wrap gap-2">
            <button type="button" onClick={() => toggleFav(s)} aria-pressed={fav} className={fav ? 'btn border border-leaf-500/30 bg-leaf-500/10 text-leaf-200' : 'btn-primary'}>
              <Bookmark className={`size-4 ${fav ? 'fill-current' : ''}`} /> {fav ? t('discover.sp.fav') : t('discover.sp.remember')}
            </button>
            <button type="button" className={`btn-ghost ${inCompare ? 'border-sky-400/30 text-sky-200' : ''}`} aria-pressed={inCompare} onClick={() => compare.toggle(s.key)}>
              <GitCompare className="size-4" /> {inCompare ? t('discover.sp.inCompare') : t('discover.sp.compare')}
            </button>
            <a href={href(`discover/genetics/${s.id}`)} className="btn-ghost">
              <Dna className="size-4" /> {t('discover.sp.genetics')}
            </a>
            <button type="button" className="btn-ghost" onClick={() => setConnect('plant')}>
              <Link2 className="size-4" /> {t('discover.sp.link')}
            </button>
            <button type="button" className="btn-ghost" onClick={openJournal}>
              <BookOpenText className="size-4" /> {t('discover.sp.journal')}
            </button>
          </div>
          <div className="mt-5 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-500">
            <a href={s.attribution.recordUrl ?? s.attribution.url} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer" className="inline-flex items-center gap-1 hover:text-ink-200">
              Data provided by StrainAPI <ExternalLink className="size-3" />
            </a>
            {s.updatedAt && <span>aktualisiert laut Quelle {fmtDate(s.updatedAt.slice(0, 10))}</span>}
            {fetchedAt && <span>abgerufen {fmtDateTime(nowLocal(new Date(fetchedAt)))}</span>}
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="min-w-0 space-y-5">
          <Card title={t('discover.sp.cann')} subtitle={t('discover.sp.cannSub')}>
            <div className="grid gap-5 sm:grid-cols-2">
              {(['thc', 'cbd'] as const).map((k) => {
                const r = s[k];
                return (
                  <Section key={k} title={k.toUpperCase()} evidence={s.evidence[k]}>
                    {r ? (
                      <>
                        <div className="font-mono text-2xl font-semibold tabular text-ink-50">{rangeText(r)}</div>
                        <div className="mt-2">
                          <RangeMeter range={r} max={k === 'thc' ? 35 : 25} color={k === 'thc' ? '#5fe39a' : '#38bdf8'} label={k.toUpperCase()} />
                        </div>
                      </>
                    ) : (
                      <NoData />
                    )}
                  </Section>
                );
              })}
            </div>
            <div className="mt-5 border-t border-white/[0.05] pt-4">
              <Section title={t('discover.sp.moreCann')}>
                {research.profile ? <p className="text-[13px] text-ink-400">{t('discover.sp.moreCannText')}</p> : <NoData />}
              </Section>
            </div>
          </Card>

          <Card title={t('discover.sp.terps')} subtitle={latestLab ? t('discover.sp.terpsLab') : t('discover.sp.terpsSource')}>
            {latestLab ? (
              <div>
                <div className="h-56" role="img" aria-label={t('discover.sp.terpConc')}>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={[...latestLab.terpenes].sort((a, b) => b.value - a.value).map((tv) => ({ name: terpeneLabel(tv.name), value: tv.value, color: matchTerpene(tv.name)?.color ?? '#8c9a95' }))} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 8 }}>
                      <CartesianGrid horizontal={false} />
                      <XAxis type="number" tickLine={false} axisLine={false} unit={` ${latestLab.unit}`} />
                      <YAxis type="category" dataKey="name" width={96} tickLine={false} axisLine={false} />
                      <Tooltip cursor={{ fill: 'rgba(255,255,255,0.03)' }} contentStyle={{ background: '#0e1211', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, fontSize: 12 }} formatter={(v: number) => [`${fmt(v)} ${latestLab.unit}`, t('discover.sp.content')]} />
                      <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}>
                        {latestLab.terpenes.map((tv) => (
                          <Cell key={tv.name} fill={matchTerpene(tv.name)?.color ?? '#8c9a95'} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="hint mt-2">
                  {t('discover.sp.fromReport', { title: latestLab.title })}{latestLab.testDate && t('discover.sp.ofDate', { date: fmtDate(latestLab.testDate) })} ({latestLab.origin === 'document' ? t('discover.sp.oDoc') : latestLab.origin === 'manual' ? t('discover.sp.oManual') : t('discover.sp.oUnverified')}).{' '}
                  <a href={href('lab-reports')} className="underline">{t('discover.sp.labReports')}</a>
                </p>
              </div>
            ) : s.terpenes.length > 0 ? (
              <ol className="space-y-2">
                {s.terpenes.map((tv, i) => {
                  const info = matchTerpene(tv);
                  return (
                    <li key={tv} className="flex items-center gap-3">
                      <span className="w-5 font-mono text-[11px] text-ink-600">{i + 1}.</span>
                      <span className="size-2.5 rounded-full" style={{ background: info?.color ?? '#5f6d68' }} />
                      {info ? (
                        <a href={href(`discover/terpenes/${info.id}`)} className="text-[13px] text-ink-100 hover:text-leaf-200">
                          {info.name}
                        </a>
                      ) : (
                        <span className="text-[13px] text-ink-200">{terpeneLabel(tv)}</span>
                      )}
                      {info && <span className="truncate text-[11px] text-ink-500">{info.aroma.slice(0, 2).join(', ')}</span>}
                    </li>
                  );
                })}
              </ol>
            ) : (
              <NoData />
            )}
            <div className="mt-3 flex items-center gap-2">
              <EvidenceBadge state={s.evidence.terpenes} />
              <span className="text-[11px] text-ink-500">{t('discover.sp.order')}</span>
            </div>
          </Card>

          <Card
            title={t('discover.sp.genetics')}
            subtitle={t('discover.sp.lineage')}
            actions={
              <a href={href(`discover/genetics/${s.id}`)} className="btn-ghost py-1.5 text-xs">
                <Dna className="size-3.5" /> {t('discover.sp.explorer')}
              </a>
            }
          >
            <Section title={t('discover.sp.cross')} evidence={s.evidence.genetics}>
              {s.genetics ? <p className="text-[14px] text-ink-100">{s.genetics}</p> : <NoData />}
            </Section>
            {genetics && genetics.parents.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {genetics.parents.flatMap(namesIn).map((n) => (
                  <a key={n} href={href(`discover?q=${encodeURIComponent(n)}`)} className="rounded-full border border-white/[0.08] px-2.5 py-1 text-[12px] text-ink-200 hover:border-leaf-500/30 hover:text-leaf-200">
                    {n}
                  </a>
                ))}
              </div>
            )}
            {genetics?.flags.includes('disputed') && <p className="mt-3 text-[12px] text-amber-300/90">{t('discover.sp.disputed')}</p>}
            {genetics?.flags.includes('unparsed') && s.genetics && <p className="mt-3 text-[12px] text-ink-500">{t('discover.sp.noParents')}</p>}
          </Card>

          {(descriptionBlocks.length > 0 || derived) && (
            <Card title={t('discover.sp.desc')} subtitle={t('discover.sp.descSub')}>
              <div className="max-h-[32rem] space-y-3 overflow-y-auto pr-1 text-[13px] leading-relaxed text-ink-300">
                {derived ? (
                  <p>{s.detail!.description}</p>
                ) : (
                  descriptionBlocks.map((b, i) =>
                    b.kind === 'heading' ? (
                      <h4 key={i} className="pt-2 text-[13px] font-semibold text-ink-100">
                        {b.text}
                      </h4>
                    ) : b.kind === 'list' ? (
                      <ul key={i} className="list-disc space-y-1 pl-5">
                        {b.items!.map((it, j) => (
                          <li key={j}>{it}</li>
                        ))}
                      </ul>
                    ) : (
                      <p key={i}>{b.text}</p>
                    ),
                  )
                )}
              </div>
            </Card>
          )}
        </div>

        <div className="min-w-0 space-y-5">
          <Card title={t('discover.sp.aromaTaste')}>
            <div className="space-y-4">
              <Section title={t('discover.sp.aroma')} evidence={s.evidence.aroma}>
                {s.aroma.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {s.aroma.map((a) => (
                      <span key={a} className="rounded-full bg-white/[0.04] px-2.5 py-1 text-[12px] text-ink-200">
                        {a}
                      </span>
                    ))}
                  </div>
                ) : (
                  <NoData />
                )}
              </Section>
              <Section title={t('discover.sp.taste')} evidence={s.evidence.flavor}>
                {s.flavor.length ? (
                  <div className="flex flex-wrap gap-1.5">
                    {s.flavor.map((a) => (
                      <span key={a} className="rounded-full bg-white/[0.04] px-2.5 py-1 text-[12px] text-ink-200">
                        {a}
                      </span>
                    ))}
                  </div>
                ) : (
                  <NoData />
                )}
              </Section>
            </div>
          </Card>

          <Card title={t('discover.sp.botany')} subtitle={t('discover.sp.botanySub')}>
            <Facts s={s} />
          </Card>

          <Card title={t('discover.sp.reported')} subtitle={t('discover.sp.reportedSub')}>
            {s.detail?.effects ? (
              <div className="space-y-3">
                {(['mental', 'body'] as const).map((k) =>
                  s.detail!.effects![k].length ? (
                    <Section key={k} title={k === 'mental' ? t('discover.sp.mental') : t('discover.sp.physical')} evidence={s.evidence[`${k}_effects`]}>
                      <div className="flex flex-wrap gap-1.5">
                        {s.detail!.effects![k].map((e) => (
                          <span key={e} className="rounded-full border border-dashed border-white/[0.1] px-2.5 py-1 text-[12px] text-ink-300">
                            {e}
                          </span>
                        ))}
                      </div>
                    </Section>
                  ) : null,
                )}
                <p className="hint">{t('discover.sp.individual')}</p>
              </div>
            ) : (
              <NoData />
            )}
          </Card>

          <Card title={t('discover.sp.personal')} icon={<Sprout className="size-4" />}>
            {mine ? (
              <div className="space-y-3 text-[13px]">
                <a href={href(`strains/${mine.id}`)} className="flex items-center justify-between rounded-lg border border-white/[0.06] px-3 py-2 hover:border-white/[0.14]">
                  <span className="text-ink-100">{t('discover.sp.openMine')}</span>
                  <span className="text-[11px] text-ink-500">{fav ? t('discover.sp.fav') : 'gespeichert'}</span>
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
                  <p className="text-ink-500">{t('discover.sp.noPlants')}</p>
                )}
                {journal.length > 0 && <p className="text-ink-400">{t('discover.sp.journalN', { count: journal.length })}</p>}
              </div>
            ) : (
              <p className="text-[13px] text-ink-500">{t('discover.sp.notMine')}</p>
            )}
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn-ghost py-1.5 text-xs" onClick={() => setConnect('grow')}>
                <Sprout className="size-3.5" /> {t('discover.sp.assign')}
              </button>
            </div>
          </Card>

          <Card title={t('discover.sp.research')} subtitle={t('discover.sp.researchSub')} icon={<Microscope className="size-4" />}>
            <ResearchPanel name={s.name} research={research} />
          </Card>
        </div>
      </div>

      {connect && <ConnectDialog strain={s} initialMode={connect} onClose={() => setConnect(null)} />}
      {journalFor && <JournalFormModal open onClose={() => setJournalFor(null)} strainId={journalFor} />}
      {loading && <Loader2 className="fixed bottom-24 right-6 size-5 animate-spin text-leaf-400" aria-label={t('discover.sp.refreshing')} />}
    </div>
  );
}
