import { AlertTriangle, ArrowLeft, BadgeCheck, ExternalLink, FlaskRound, Layers, Search, Sprout } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useData } from '../../app/DataProvider';
import { useAsync, useLibraryStatus } from '../../app/library';
import { href } from '../../app/router';
import { DiscoverNav } from '../../components/discover/DiscoverNav';
import { EvidenceTag } from '../../components/discover/EvidenceTag';
import { MoleculeView } from '../../components/discover/MoleculeView';
import { Card } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { type LibMeasuredTerpene, library } from '../../lib/catalog/library';
import {
  AROMA_FAMILIES,
  type AromaFamily,
  CHEM_META,
  TERPENES,
  TERPENE_GROUPS,
  type TerpeneGroup,
  type TerpeneInfo,
  matchTerpene,
  matchTerpeneGroup,
  terpeneById,
  terpeneChem,
  terpeneGroupById,
} from '../../lib/catalog/terpenes';
import { fmtDate } from '../../lib/dates';
import { fmt } from '../../lib/format';
import { toPercent } from '../../lib/lab';
import { t, intlLocale } from '../../i18n';

const ext = { target: '_blank', rel: 'noopener noreferrer nofollow', referrerPolicy: 'no-referrer' } as const;
const isPubchem = (url: string) => url.includes('pubchem.ncbi.nlm.nih.gov');
/** Literaturbelege für ein Vorkommen in Cannabis: nur Quellen, deren Volltext für diesen Atlas geprüft wurde */
const cannabisSources = (tp: TerpeneInfo) => tp.sources.filter((s) => !isPubchem(s.url) && s.label.includes('Volltext geprüft'));
const groupsOf = (id: string) => TERPENE_GROUPS.filter((g) => g.members.includes(id));

/**
 * Terpen-Rad: äußerer Ring = Aromafamilien, innere Punkte = Terpene, verbunden mit den Familien,
 * die ihrer belegten Geruchsbeschreibung entsprechen. Gestrichelt = keine Geruchsbeschreibung belegt.
 */
function TerpeneWheel({ items, active, onSelect }: { items: TerpeneInfo[]; active?: string; onSelect: (id: string) => void }) {
  const [hover, setHover] = useState<AromaFamily | null>(null);
  const cx = 180;
  const cy = 180;
  const n = AROMA_FAMILIES.length;
  const famAngle = (i: number) => (i / n) * Math.PI * 2 - Math.PI / 2;
  const step = (Math.PI * 2) / n;
  const arc = (r0: number, r1: number, a0: number, a1: number) => {
    const p = (r: number, a: number) => `${(cx + r * Math.cos(a)).toFixed(1)} ${(cy + r * Math.sin(a)).toFixed(1)}`;
    return `M ${p(r1, a0)} A ${r1} ${r1} 0 0 1 ${p(r1, a1)} L ${p(r0, a1)} A ${r0} ${r0} 0 0 0 ${p(r0, a0)} Z`;
  };
  const pos = items.map((tp, i) => {
    const a = (i / items.length) * Math.PI * 2 - Math.PI / 2;
    return { tp, x: cx + 92 * Math.cos(a), y: cy + 92 * Math.sin(a) };
  });
  const act = active ? terpeneById(active) : undefined;
  return (
    <svg viewBox="0 0 360 360" className="mx-auto w-full max-w-[380px]" role="group" aria-label={t('atlas.wheelAria')}>
      {AROMA_FAMILIES.map((f, i) => {
        const a0 = famAngle(i) + 0.02;
        const a1 = famAngle(i + 1) - 0.02;
        const mid = (a0 + a1) / 2;
        const on = hover === f.id || act?.families.includes(f.id);
        return (
          <g key={f.id} onMouseEnter={() => setHover(f.id)} onMouseLeave={() => setHover(null)}>
            <path d={arc(132, 172, a0, a1)} fill={f.color} fillOpacity={on ? 0.55 : 0.16} stroke={f.color} strokeOpacity={0.4} />
            <text x={cx + 152 * Math.cos(mid)} y={cy + 152 * Math.sin(mid)} fill="#dfe7e3" fontSize="11" textAnchor="middle" dominantBaseline="middle" fontFamily="Inter Variable, sans-serif">
              {f.id}
            </text>
          </g>
        );
      })}
      {pos.map(({ tp, x, y }) =>
        tp.families.map((fam) => {
          const fi = AROMA_FAMILIES.findIndex((f) => f.id === fam);
          const mid = famAngle(fi) + step / 2;
          const show = active === tp.id || hover === fam;
          return <line key={`${tp.id}-${fam}`} x1={x} y1={y} x2={cx + 130 * Math.cos(mid)} y2={cy + 130 * Math.sin(mid)} stroke={tp.color} strokeOpacity={show ? 0.85 : 0.09} strokeWidth={show ? 1.4 : 1} />;
        }),
      )}
      {pos.map(({ tp, x, y }) => (
        <g
          key={tp.id}
          role="button"
          tabIndex={0}
          aria-pressed={active === tp.id}
          aria-label={`${tp.name}${tp.families.length ? '' : t('atlas.noSmellSuffix')}`}
          onClick={() => onSelect(tp.id)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onSelect(tp.id))}
          className="cursor-pointer outline-none [&:focus-visible_circle]:stroke-white"
        >
          <title>{tp.name}</title>
          <circle cx={x} cy={y} r={active === tp.id ? 10 : 7.5} fill="#0a0d0c" stroke={tp.color} strokeWidth={active === tp.id ? 2.5 : 1.6} strokeDasharray={tp.families.length ? undefined : '2 2'} />
        </g>
      ))}
      <circle cx={cx} cy={cy} r={58} fill="#0e1211" stroke="rgb(255 255 255 / 0.08)" />
      <text x={cx} y={cy - 6} fill={act?.color ?? '#8c9a95'} fontSize={act ? 12 : 10} fontWeight={act ? 600 : 400} textAnchor="middle" fontFamily="Inter Variable, sans-serif">
        {act ? act.name.replace(/ \(.*\)$/, '') : 'Aroma-'}
      </text>
      <text x={cx} y={cy + 10} fill="#8c9a95" fontSize="10" textAnchor="middle" fontFamily="Inter Variable, sans-serif">
        {act ? (act.families.join(' · ') || t('atlas.noValue')) : 'familien'}
      </text>
    </svg>
  );
}

/** Kennzahlen-Kachel der chemischen Identität */
function Fact({ k, v, mono = true, note, className = '' }: { k: string; v: string; mono?: boolean; note?: string; className?: string }) {
  return (
    <div className={`min-w-0 ${className} rounded-xl border border-white/[0.06] bg-ink-950/50 px-3 py-2.5`}>
      <dt className="text-[10px] uppercase tracking-wider text-ink-500">{k}</dt>
      <dd className={`mt-0.5 break-words text-[13.5px] text-ink-50 ${mono ? 'font-mono' : ''}`}>{v}</dd>
      {note && <dd className="mt-0.5 text-[10.5px] leading-snug text-ink-500">{note}</dd>}
    </div>
  );
}

/** Sorten des lokalen Katalogs, deren Quellen das Terpen NENNEN (paginiert) */
function CatalogMentions({ id, label }: { id: string; label: string }) {
  const lib = useLibraryStatus();
  const [page, setPage] = useState(1);
  const res = useAsync((signal) => (lib ? library.terpeneCultivars(id, page, signal) : Promise.resolve(null)), [id, page, !!lib]);
  const measuredRef = useRef<LibMeasuredTerpene | undefined>(undefined);
  if (lib === null) return <p className="hint">{t('atlas.serverOnly')}</p>;
  const d = res.data;
  // Messwerte kommen nur mit Seite 1 – beim Blättern behalten
  if (d && d.page === 1) measuredRef.current = d.measured;
  const measured = measuredRef.current;
  if (res.loading && !d) return <p className="hint">{t('atlas.loading')}</p>;
  if (res.error) return <p className="hint text-rose-300">{res.error}</p>;
  if (!d || d.total === 0)
    return (
      <div className="space-y-4">
        {measured && <MeasuredSamples m={measured} label={label} />}
        <p className="text-[13px] text-ink-300">{t('atlas.noneNames', { label })}</p>
      </div>
    );
  return (
    <div className="space-y-3">
      {measured && <MeasuredSamples m={measured} label={label} />}
      <p className="text-[13px] text-ink-300">
        <span className="font-mono text-ink-50">{d.total.toLocaleString(intlLocale())}</span> {t('atlas.mentions', { label })}
      </p>
      <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {d.items.map((c) => (
          <li key={c.id}>
            <a href={href(`discover/cultivar/${c.id}`)} className="block rounded-xl border border-white/[0.06] px-3 py-2 hover:border-white/[0.14]">
              <div className="truncate text-[13px] font-medium text-ink-100">
                {c.name}
                {c.version ? ` (${c.version})` : ''}
              </div>
              <div className="mt-0.5 flex items-center justify-between gap-2">
                <span className="truncate text-[11px] text-ink-500">{c.breeder.name}</span>
                <EvidenceTag kind={c.terpeneSource === 'database' ? 'database' : 'seedbank'} />
              </div>
            </a>
          </li>
        ))}
      </ul>
      {d.totalPages > 1 && (
        <nav className="flex items-center justify-between text-[12px]" aria-label={t('atlas.pages')}>
          <button type="button" className="btn-ghost py-1 text-xs" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
            {t('atlas.back')}
          </button>
          <span className="tabular text-ink-500">
            Seite {d.page} von {d.totalPages}
          </span>
          <button type="button" className="btn-ghost py-1 text-xs" disabled={page >= d.totalPages} onClick={() => setPage((p) => p + 1)}>
            {t('atlas.next')}
          </button>
        </nav>
      )}
    </div>
  );
}

/** Messwerte in öffentlichen Laborproben – je Probe gemessen, keine Sortenprofile. */
function MeasuredSamples({ m, label }: { m: LibMeasuredTerpene; label: string }) {
  const max = Math.max(...m.topNames.map((n) => n.median), 0.0001);
  return (
    <section aria-label={t('atlas.samples')} className="rounded-xl border border-teal-400/15 bg-teal-400/[0.03] p-3">
      <div className="mb-2 flex flex-wrap items-center gap-1.5">
        <EvidenceTag kind="science" source="Smith et al. 2022" />
        {m.isomerSum && <span className="rounded-full border border-amber-400/25 px-1.5 py-px text-[10.5px] text-amber-200">{m.isomerSum}</span>}
      </div>
      <p className="text-[13px] text-ink-300">
        {t('atlas.inA')} <span className="font-mono text-ink-50">{m.samples.toLocaleString(intlLocale())}</span> {t('atlas.inB')}{' '}
        <span className="font-mono text-ink-50">{Math.round((m.detected / m.samples) * 100)} %</span>
        {m.median !== null && (
          <>
            {t('atlas.medianAll')} <span className="font-mono text-ink-50">{m.median.toLocaleString(intlLocale(), { maximumFractionDigits: 3 })} %</span>
          </>
        )}
        .
      </p>
      {m.topNames.length > 0 && (
        <>
          <h4 className="mb-1.5 mt-3 text-[12px] font-semibold text-ink-200">{t('atlas.topProducts', { label })}</h4>
          <ul className="space-y-1">
            {m.topNames.map((n) => (
              <li key={n.nameKey} className="grid grid-cols-[minmax(0,9rem)_minmax(0,1fr)_auto] items-center gap-2 text-[12px]">
                <a href={href(`discover?q=${encodeURIComponent(n.nameKey.replace(/-/g, ' '))}&samples=1`)} className="inline-flex min-h-6 min-w-0 items-center hover:underline"><span className="truncate text-ink-200">
                  {n.nameKey.replace(/-/g, ' ')}</span>
                </a>
                <span className="h-1.5 rounded-full bg-ink-700" aria-hidden>
                  <span className="block h-full rounded-full bg-teal-400/70" style={{ width: `${(n.median / max) * 100}%` }} />
                </span>
                <span className="whitespace-nowrap font-mono text-[11px] tabular text-ink-300">
                  {n.median.toLocaleString(intlLocale(), { maximumFractionDigits: 3 })} % · n={n.samples}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
      <p className="mt-2 text-[11px] leading-relaxed text-ink-500">
        {t('atlas.samplesNote', { citation: m.source.citation, license: m.source.license })}
      </p>
    </section>
  );
}

function SourceList({ sources }: { sources: TerpeneInfo['sources'] }) {
  return (
    <ul className="space-y-2.5">
      {sources.map((s) => (
        <li key={s.url}>
          <a href={s.url} {...ext} className="group flex gap-1.5 text-[12px] leading-relaxed text-ink-300 hover:text-ink-100">
            <span>{s.label}</span>
            <ExternalLink className="mt-0.5 size-3 shrink-0 text-ink-500 group-hover:text-ink-300" />
          </a>
        </li>
      ))}
    </ul>
  );
}

function TerpeneDetail({ tp }: { tp: TerpeneInfo }) {
  const { data } = useData();
  const chem = terpeneChem(tp.id);
  const lit = cannabisSources(tp);
  const groups = groupsOf(tp.id);
  const mine = data.strains.filter((s) => s.terpenes.some((x) => matchTerpene(x.name)?.id === tp.id));
  const labs = data.labReports
    .map((r) => ({ r, v: r.terpenes.find((x) => matchTerpene(x.name)?.id === tp.id) }))
    .filter((x): x is { r: (typeof data.labReports)[number]; v: { name: string; value: number } } => !!x.v);
  const isomers = TERPENES.filter((o) => o.id !== tp.id && o.formula === tp.formula).slice(0, 8);

  return (
    <div className="space-y-5">
      <a href={href('discover/terpenes')} className="inline-flex items-center gap-1.5 text-[12px] text-ink-400 hover:text-ink-100">
        <ArrowLeft className="size-3.5" /> {t('atlas.atlas')}
      </a>
      <section className="relative overflow-hidden rounded-3xl border border-white/[0.06] p-6 sm:p-8" style={{ background: `radial-gradient(600px 240px at 0% 0%, ${tp.color}22, transparent 70%)` }}>
        <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_260px] md:items-center">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.14em]" style={{ color: tp.color }}>
              {tp.className}
            </div>
            <h1 className="page-title mt-2">{tp.name}</h1>
            <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-ink-300">{tp.summary}</p>
            {lit.length === 0 && (
              <p className="mt-3 inline-flex items-start gap-2 rounded-lg border border-amber-400/20 bg-amber-400/[0.06] px-3 py-2 text-[12px] text-amber-100">
                <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> {t('atlas.notInSources')}
              </p>
            )}
          </div>
          {chem && (
            <figure className="rounded-2xl border border-white/[0.06] bg-ink-950/60 p-3">
              <div className="aspect-[4/3]">
                <MoleculeView chem={chem} color={tp.color} size="lg" label={tp.name} />
              </div>
              <figcaption className="mt-1 text-center text-[10.5px] text-ink-500">{t('atlas.structure')}</figcaption>
            </figure>
          )}
        </div>
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
        <div className="min-w-0 space-y-5">
          <Card title={t('atlas.identity')} subtitle={t('atlas.perPubchem', { date: fmtDate(CHEM_META.retrieved) })} icon={<BadgeCheck className="size-4" />}>
            {chem ? (
              <dl className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                <Fact k={t('atlas.formula')} v={tp.formula} />
                <Fact k={t('atlas.cmp.mass')} v={`${tp.molarMass.toLocaleString(intlLocale())} g/mol`} />
                <Fact k={t('atlas.cid')} v={String(chem.cid)} />
                <Fact k={t('atlas.cmp.cas')} v={chem.cas ?? '–'} note={chem.casListed > 1 ? t('atlas.casFirst', { n: chem.casListed }) : undefined} />
                <Fact className="col-span-2" k={t('atlas.entry')} v={chem.title} mono={false} note={t('atlas.entryNote')} />
                <Fact className="col-span-2 sm:col-span-3" k={t('atlas.iupac')} v={chem.iupac} />
                <Fact className="col-span-2 sm:col-span-3" k="InChIKey" v={chem.inchikey} />
              </dl>
            ) : (
              <p className="hint">{t('atlas.noPubchem')}</p>
            )}
            {chem && (
              <a href={`https://pubchem.ncbi.nlm.nih.gov/compound/${chem.cid}`} {...ext} className="mt-3 inline-flex items-center gap-1 text-[12px] text-leaf-300 hover:underline">
                Eintrag bei PubChem öffnen <ExternalLink className="size-3" />
              </a>
            )}
          </Card>

          <Card title={t('atlas.inCatalog')} subtitle={t('atlas.inCatalogSub')}>
            <CatalogMentions id={tp.id} label={tp.name} />
            {groups.length > 0 && (
              <p className="hint mt-3">
                Nennungen ohne Isomerangabe stehen gesondert unter{' '}
                {groups.map((g, i) => (
                  <span key={g.id}>
                    {i > 0 && ', '}
                    <a className="text-leaf-300 hover:underline" href={href(`discover/terpenes/${g.id}`)}>
                      {g.name}
                    </a>
                  </span>
                ))}
                .
              </p>
            )}
          </Card>

          <Card title={t('atlas.yourData')} subtitle={t('atlas.yourDataSub')} icon={<FlaskRound className="size-4" />}>
            {labs.length === 0 && mine.length === 0 ? (
              <p className="hint">{t('atlas.noOwn', { name: tp.name })}</p>
            ) : (
              <div className="space-y-3">
                {labs.length > 0 && (
                  <ul className="space-y-1.5">
                    {labs.map(({ r, v }) => (
                      <li key={r.id} className="flex flex-wrap justify-between gap-2 text-[13px]">
                        <a href={href('lab-reports')} className="text-ink-100 hover:text-leaf-200">
                          {r.title}
                          {r.testDate && <span className="text-ink-500"> · {fmtDate(r.testDate)}</span>}
                        </a>
                        <span className="flex items-center gap-2 font-mono text-ink-300">
                          {fmt(v.value)} {r.unit}
                          {r.unit !== '%' && toPercent(v.value, r.unit) !== undefined && <span className="text-[11px] text-ink-500">≙ {fmt(toPercent(v.value, r.unit)!)} %</span>}
                          <EvidenceTag kind="lab" />
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {mine.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {mine.map((s) => (
                      <a key={s.id} href={href(`strains/${s.id}`)} className="inline-flex items-center gap-1 rounded-full border border-white/[0.08] px-2.5 py-1 text-[12px] text-ink-200 hover:border-white/20">
                        <Sprout className="size-3" /> {s.name}
                      </a>
                    ))}
                  </div>
                )}
                <p className="hint">{t('atlas.perSample')}</p>
              </div>
            )}
          </Card>
        </div>

        <div className="min-w-0 space-y-5">
          <Card title={t('atlas.cmp.smell')} subtitle={t('atlas.smellSub')}>
            {tp.aroma.length > 0 && (
              <div className="mb-3 flex flex-wrap gap-1.5">
                {tp.aroma.map((a) => (
                  <span key={a} className="rounded-full px-2.5 py-1 text-[12px]" style={{ background: `${tp.color}1f`, color: tp.color }}>
                    {a}
                  </span>
                ))}
              </div>
            )}
            {chem && chem.odor.length > 0 ? (
              <ul className="space-y-2">
                {chem.odor.map((o) => (
                  <li key={o.text} className="text-[12.5px] leading-relaxed text-ink-300">
                    „{o.text}“ <span className="text-[11px] text-ink-500">– PubChem, {o.section}{o.source ? ` (${o.source})` : ''}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-[12.5px] text-ink-400">
                {tp.aroma.length ? t('atlas.smellKeywords') : t('atlas.noSmellPubchem')}
              </p>
            )}
          </Card>

          <Card title={t('atlas.occurrence')} subtitle={t('atlas.occurrenceSub')}>
            {lit.length ? (
              <SourceList sources={lit} />
            ) : (
              <p className="text-[12.5px] text-ink-400">{t('atlas.notInChecked')}</p>
            )}
            {tp.occurrences.length > 0 && (
              <>
                <p className="mb-1.5 mt-4 text-[11px] uppercase tracking-wider text-ink-500">{t('atlas.otherPlants')}</p>
                <p className="text-[12.5px] text-ink-300">{tp.occurrences.join(', ')}</p>
              </>
            )}
          </Card>

          {(groups.length > 0 || isomers.length > 0) && (
            <Card title={t('atlas.isomers')} icon={<Layers className="size-4" />}>
              {groups.map((g) => (
                <p key={g.id} className="mb-2 text-[12.5px] text-ink-300">
                  <a className="text-leaf-300 hover:underline" href={href(`discover/terpenes/${g.id}`)}>
                    {g.name}
                  </a>{' '}
                  – {g.note}
                </p>
              ))}
              {isomers.length > 0 && (
                <>
                  <p className="mb-1.5 text-[11px] uppercase tracking-wider text-ink-500">{t('atlas.sameFormula')} {tp.formula}</p>
                  <div className="flex flex-wrap gap-1.5">
                    {isomers.map((o) => (
                      <a key={o.id} href={href(`discover/terpenes/${o.id}`)} className="rounded-full border border-white/[0.08] px-2.5 py-1 text-[12px] text-ink-200 hover:border-white/20">
                        {o.name}
                      </a>
                    ))}
                  </div>
                </>
              )}
            </Card>
          )}

          <Card title={t('atlas.allSources')}>
            <SourceList sources={tp.sources} />
          </Card>
          <p className="text-[11px] leading-relaxed text-ink-500">{t('atlas.noHealth')}</p>
        </div>
      </div>
    </div>
  );
}

function GroupDetail({ g }: { g: TerpeneGroup }) {
  return (
    <div className="space-y-5">
      <a href={href('discover/terpenes')} className="inline-flex items-center gap-1.5 text-[12px] text-ink-400 hover:text-ink-100">
        <ArrowLeft className="size-3.5" /> {t('atlas.atlas')}
      </a>
      <section className="rounded-3xl border border-white/[0.06] p-6 sm:p-8">
        <div className="text-[11px] uppercase tracking-[0.14em] text-ink-400">{t('atlas.collective')}</div>
        <h1 className="page-title mt-2">{g.name}</h1>
        <p className="mt-3 max-w-2xl text-[14px] leading-relaxed text-ink-300">
          {g.note} TERPGRID ordnet solche Nennungen bewusst keinem bestimmten Isomer zu – die Quelle gibt nicht an, welches gemeint ist.
        </p>
        {g.members.length > 0 && (
          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {g.members.map((id) => {
              const tp = terpeneById(id)!;
              const c = terpeneChem(id);
              return (
                <a key={id} href={href(`discover/terpenes/${id}`)} className="rounded-2xl border border-white/[0.06] bg-ink-900/70 p-3 hover:border-white/[0.14]">
                  {c && (
                    <div className="aspect-[4/3]">
                      <MoleculeView chem={c} color={tp.color} size="sm" label={tp.name} />
                    </div>
                  )}
                  <div className="mt-1 text-[13px] font-medium text-ink-100">{tp.name}</div>
                </a>
              );
            })}
          </div>
        )}
      </section>
      <Card title={t('atlas.withMention')} subtitle={t('atlas.withMentionSub')}>
        <CatalogMentions id={g.id} label={t('atlas.quoted', { name: g.name.replace(' (Isomer nicht angegeben)', '') })} />
      </Card>
    </div>
  );
}

const CLASSES = [...new Set(TERPENES.map((tp) => tp.className))];
/** Gliederung: Monoterpene C10 (2 Isopren-Einheiten), Sesquiterpene C15 (3 Einheiten); Terpenoide tragen Sauerstoff */
const TAXONOMY: { title: string; hint: string; classes: TerpeneInfo['className'][] }[] = [
  { get title() { return t('atlas.cl.mono'); }, get hint() { return t('atlas.cl.monoH'); }, classes: ['Monoterpen', 'Aromatischer Monoterpen-Kohlenwasserstoff'] },
  { get title() { return t('atlas.cl.monoid'); }, get hint() { return t('atlas.cl.monoidH'); }, classes: ['Monoterpenoid (Alkohol)', 'Monoterpenoid (Ether)', 'Monoterpenoid (Keton)'] },
  { get title() { return t('atlas.cl.sesq'); }, get hint() { return t('atlas.cl.sesqH'); }, classes: ['Sesquiterpen'] },
  { get title() { return t('atlas.cl.sesqid'); }, get hint() { return t('atlas.cl.sesqidH'); }, classes: ['Sesquiterpenoid (Alkohol)', 'Sesquiterpenoid (Epoxid)'] },
];

export function TerpeneAtlas({ terpeneId }: { terpeneId?: string }) {
  const { data } = useData();
  const lib = useLibraryStatus();
  const index = useAsync((signal) => (lib ? library.terpeneIndex(signal) : Promise.resolve(null)), [!!lib]);
  const [focus, setFocus] = useState<string>();
  const [fam, setFam] = useState<AromaFamily | ''>('');
  const [cls, setCls] = useState('');
  const [q, setQ] = useState('');
  const [evidence, setEvidence] = useState<'' | 'lit' | 'none'>('');
  const [compare, setCompare] = useState<string[]>(['myrcene', 'limonene']);

  const filtered = useMemo(() => {
    const k = q.trim().toLowerCase();
    return TERPENES.filter(
      (tp) =>
        (!fam || tp.families.includes(fam)) &&
        (!cls || tp.className === cls) &&
        (!evidence || (evidence === 'lit') === cannabisSources(tp).length > 0) &&
        (!k || [tp.name, tp.id, ...tp.aliases].some((a) => a.toLowerCase().includes(k))),
    );
  }, [fam, cls, q, evidence]);

  if (terpeneId) {
    // Alte Links „…/pinene“ meinten α-Pinen; „pinene“ allein ist jetzt der Sammelname
    const tp = terpeneById(terpeneId);
    const g = terpeneGroupById(terpeneId) ?? (!tp ? matchTerpeneGroup(terpeneId) : undefined);
    return (
      <div>
        <DiscoverNav />
        {tp ? (
          <TerpeneDetail key={tp.id} tp={tp} />
        ) : g ? (
          <GroupDetail g={g} />
        ) : (
          <EmptyState
            title={t('atlas.notFound')}
            action={
              <a className="btn-primary" href={href('discover/terpenes')}>
                {t('atlas.toAtlas')}
              </a>
            }
          />
        )}
      </div>
    );
  }

  const labReports = data.labReports.filter((r) => r.terpenes.length > 0);
  const compared = compare.map((id) => terpeneById(id)).filter((tp): tp is TerpeneInfo => !!tp);
  const counts = new Map((index.data?.terpenes ?? []).map((r) => [r.id, r]));
  const ranked = (index.data?.terpenes ?? []).filter((r) => r.cisp + r.database > 0).slice(0, 16);
  const maxCount = Math.max(1, ...ranked.map((r) => r.cisp + r.database));
  const nameOf = (id: string, fallback: string[]) => terpeneById(id)?.name ?? terpeneGroupById(id)?.name ?? (id.startsWith('unbekannt:') ? t('atlas.notInAtlas', { name: fallback[0] ?? '' }) : id);
  const withLit = TERPENES.filter((tp) => cannabisSources(tp).length > 0).length;

  return (
    <div>
      <DiscoverNav />
      <div className="mb-6 animate-fade-up">
        <h1 className="page-title">{t('atlas.atlas')}</h1>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-400">
          {t('atlas.intro', { n: TERPENES.length, date: fmtDate(CHEM_META.retrieved), lit: withLit })} {t('atlas.subtitle')}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <Card title={t('atlas.wheel')} subtitle={t('atlas.wheelSub')}>
          <TerpeneWheel items={TERPENES} active={focus} onSelect={(id) => setFocus(id === focus ? undefined : id)} />
          {focus && terpeneById(focus) && (
            <div className="mt-3 flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] px-3 py-2">
              <div className="min-w-0">
                <div className="text-[13px] font-medium text-ink-50">{terpeneById(focus)!.name}</div>
                <div className="truncate text-[11px] text-ink-500">{terpeneById(focus)!.aroma.join(', ') || t('atlas.noSmellDoc')}</div>
              </div>
              <a href={href(`discover/terpenes/${focus}`)} className="btn-ghost shrink-0 py-1.5 text-xs">
                {t('atlas.details')}
              </a>
            </div>
          )}
          <p className="hint mt-3">{t('atlas.dashed')}</p>
        </Card>

        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="relative min-w-[12rem] flex-1">
              <span className="sr-only">{t('atlas.search')}</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-500" />
              <input className="input-base pl-9" placeholder={t('atlas.searchPh')} value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <select aria-label={t('atlas.family')} className="input-base w-auto max-w-full" value={fam} onChange={(e) => setFam(e.target.value as AromaFamily | '')}>
              <option value="">{t('atlas.allFamilies')}</option>
              {AROMA_FAMILIES.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.id}
                </option>
              ))}
            </select>
            <select aria-label={t('atlas.class')} className="input-base w-auto max-w-full" value={cls} onChange={(e) => setCls(e.target.value)}>
              <option value="">{t('atlas.allClasses')}</option>
              {CLASSES.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
            <select aria-label={t('atlas.evidence')} className="input-base w-auto max-w-full" value={evidence} onChange={(e) => setEvidence(e.target.value as '' | 'lit' | 'none')}>
              <option value="">{t('atlas.allEvidence')}</option>
              <option value="lit">{t('atlas.docCannabis')}</option>
              <option value="none">{t('atlas.notDocShort')}</option>
            </select>
          </div>
          <p className="text-[12px] text-ink-500" aria-live="polite">
            {t('atlas.filteredN', { a: filtered.length, b: TERPENES.length })}
          </p>
          {filtered.length === 0 ? (
            <EmptyState compact title={t('atlas.noHits')} text={t('atlas.noHitsText')} />
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {filtered.map((tp) => {
                const c = terpeneChem(tp.id);
                const n = counts.get(tp.id);
                return (
                  <a key={tp.id} href={href(`discover/terpenes/${tp.id}`)} className="group flex gap-3 overflow-hidden rounded-2xl border border-white/[0.06] bg-ink-900/70 p-3 transition-colors hover:border-white/[0.14]">
                    {c && (
                      <div className="h-16 w-20 shrink-0 rounded-lg bg-ink-950/60 p-1">
                        <MoleculeView chem={c} color={tp.color} size="sm" label={tp.name} />
                      </div>
                    )}
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-2">
                        <h3 className="truncate text-[14px] font-semibold text-ink-50">{tp.name}</h3>
                        <span className="font-mono text-[10.5px] text-ink-500">{tp.formula}</span>
                      </div>
                      <p className="truncate text-[11px] text-ink-500">{tp.className}</p>
                      <p className="mt-1 truncate text-[11.5px]" style={{ color: tp.color }}>
                        {tp.aroma.slice(0, 3).join(' · ') || <span className="text-ink-500">{t('atlas.noSmell')}</span>}
                      </p>
                      <p className="mt-0.5 text-[10.5px] text-ink-500">
                        {cannabisSources(tp).length ? t('atlas.inCannabis') : t('atlas.notInCannabis')}
                        {n ? t('atlas.catMentions', { n: n.cisp + n.database }) : ''}
                      </p>
                    </div>
                  </a>
                );
              })}
            </div>
          )}
          <div className="flex flex-wrap gap-1.5 pt-1">
            <span className="text-[11px] text-ink-500">{t('atlas.collectives')}</span>
            {TERPENE_GROUPS.map((g) => (
              <a key={g.id} href={href(`discover/terpenes/${g.id}`)} className="rounded-full border border-dashed border-white/[0.12] inline-flex min-h-6 items-center px-2 py-0.5 text-[11px] text-ink-300 hover:border-white/25">
                {g.name.replace(' (Isomer nicht angegeben)', '')}
              </a>
            ))}
          </div>
        </div>
      </div>

      <Card title={t('atlas.systematics')} subtitle={t('atlas.systematicsSub')} className="mt-5">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {TAXONOMY.map((grp) => (
            <section key={grp.title} aria-label={grp.title}>
              <h3 className="text-[13px] font-semibold text-ink-100">{grp.title}</h3>
              <p className="text-[11px] text-ink-500">{grp.hint}</p>
              {grp.classes.map((cl) => {
                const items = TERPENES.filter((tp) => tp.className === cl);
                if (!items.length) return null;
                return (
                  <div key={cl} className="mt-2.5">
                    <p className="text-[10.5px] uppercase tracking-wider text-ink-500">
                      {cl.replace(/^(Mono|Sesqui)terpen(oid)? ?/, '').replace(/[()]/g, '') || 'Kohlenwasserstoff'} · {items.length}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {items.map((tp) => (
                        <a key={tp.id} href={href(`discover/terpenes/${tp.id}`)} className="rounded-full border border-white/[0.08] inline-flex min-h-6 items-center px-2 py-0.5 text-[11.5px] text-ink-200 hover:border-white/20" style={{ boxShadow: `inset 3px 0 0 ${tp.color}` }}>
                          {tp.name}
                        </a>
                      ))}
                    </div>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
      </Card>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title={t('atlas.compare')} subtitle={t('atlas.compareSub')}>
          <label className="mb-3 block">
            <span className="sr-only">{t('atlas.addAria')}</span>
            <select
              className="input-base"
              value=""
              onChange={(e) => e.target.value && setCompare((c) => (c.includes(e.target.value) ? c : c.length >= 3 ? [...c.slice(1), e.target.value] : [...c, e.target.value]))}
            >
              <option value="">{t('atlas.addPh')}</option>
              {TERPENES.filter((tp) => !compare.includes(tp.id)).map((tp) => (
                <option key={tp.id} value={tp.id}>
                  {tp.name}
                </option>
              ))}
            </select>
          </label>
          {compared.length < 2 ? (
            <p className="hint">{t('atlas.needTwo')}</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[420px] table-fixed text-left text-[12px]">
                <thead>
                  <tr className="text-ink-500">
                    <th className="w-24 py-1.5 pr-3 font-medium" />
                    {compared.map((tp) => (
                      <th key={tp.id} className="py-1.5 pr-3 align-top font-semibold" style={{ color: tp.color }}>
                        <div className="flex items-start justify-between gap-1">
                          {tp.name}
                          <button type="button" aria-label={t('atlas.remove', { name: tp.name })} className="-m-1 inline-grid size-6 shrink-0 place-items-center rounded text-ink-500 hover:text-ink-100" onClick={() => setCompare((c) => c.filter((x) => x !== tp.id))}>
                            ×
                          </button>
                        </div>
                        {terpeneChem(tp.id) && (
                          <div className="mt-1 h-16">
                            <MoleculeView chem={terpeneChem(tp.id)!} color={tp.color} size="sm" label={tp.name} />
                          </div>
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="text-ink-200">
                  {(
                    [
                      [t('atlas.cmp.class'), (tp: TerpeneInfo) => tp.className],
                      [t('atlas.cmp.formula'), (tp: TerpeneInfo) => tp.formula],
                      [t('atlas.cmp.mass'), (tp: TerpeneInfo) => `${tp.molarMass.toLocaleString(intlLocale())} g/mol`],
                      [t('atlas.cmp.cas'), (tp: TerpeneInfo) => tp.cas || '–'],
                      [t('atlas.cmp.smell'), (tp: TerpeneInfo) => tp.aroma.join(', ') || t('atlas.notDoc')],
                      [t('atlas.cmp.cannabis'), (tp: TerpeneInfo) => (cannabisSources(tp).length ? t('atlas.doc') : t('atlas.notDoc'))],
                      [t('atlas.cmp.catalog'), (tp: TerpeneInfo) => (counts.get(tp.id) ? t('atlas.nMentions', { n: counts.get(tp.id)!.cisp + counts.get(tp.id)!.database }) : '–')],
                    ] as const
                  ).map(([label, get]) => (
                    <tr key={label} className="border-t border-white/[0.05] align-top">
                      <td className="py-2 pr-3 text-ink-500">{label}</td>
                      {compared.map((tp) => (
                        <td key={tp.id} className="break-words py-2 pr-3">
                          {get(tp)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <Card title={t('atlas.catMentionsTitle')} subtitle={t('atlas.catMentionsSub')}>
          {lib === null ? (
            <p className="hint">{t('atlas.serverOnly')}</p>
          ) : !index.data ? (
            <p className="hint">{index.error ?? t('atlas.loading')}</p>
          ) : (
            <>
              <ul className="space-y-1.5" aria-label={t('atlas.perTerp')}>
                {ranked.map((r) => {
                  const tp = terpeneById(r.id);
                  const total = r.cisp + r.database;
                  const linkable = tp || terpeneGroupById(r.id);
                  return (
                    <li key={r.id} className="grid grid-cols-[9.5rem_minmax(0,1fr)_3.5rem] items-center gap-2 text-[12px]">
                      {linkable ? (
                        <a href={href(`discover/terpenes/${r.id}`)} className="truncate text-ink-200 hover:text-leaf-200">
                          {nameOf(r.id, r.names)}
                        </a>
                      ) : (
                        <span className="truncate text-ink-400">{nameOf(r.id, r.names)}</span>
                      )}
                      <span className="h-2 rounded-full bg-ink-700" aria-hidden>
                        <span className="block h-full rounded-full" style={{ width: `${(total / maxCount) * 100}%`, background: tp?.color ?? '#6b7a75', opacity: tp ? 0.85 : 0.5 }} />
                      </span>
                      <span className="text-right font-mono tabular text-ink-300">{total.toLocaleString(intlLocale())}</span>
                    </li>
                  );
                })}
              </ul>
              <p className="hint mt-3">
                {t('atlas.basis', { n: index.data.cultivarsWithTerpenes })}
              </p>
            </>
          )}
        </Card>
      </div>

      <Card title={t('atlas.measured')} subtitle={t('atlas.measuredSub')} className="mt-5">
        {labReports.length === 0 ? (
          <EmptyState
            compact
            icon={<FlaskRound />}
            title={t('atlas.noQuant')}
            text={t('atlas.noQuantText')}
            action={
              <a href={href('lab-reports')} className="btn-ghost">
                {t('atlas.addReport')}
              </a>
            }
          />
        ) : (
          <ul className="space-y-4">
            {labReports.map((r) => {
              const rows = r.terpenes.map((x) => ({ ...x, pct: toPercent(x.value, r.unit) ?? 0, info: matchTerpene(x.name) })).sort((a, b) => b.pct - a.pct);
              const total = rows.reduce((s, x) => s + x.pct, 0);
              return (
                <li key={r.id}>
                  <div className="mb-1.5 flex flex-wrap justify-between gap-2 text-[12px]">
                    <span className="text-ink-100">
                      {r.title}
                      {r.labName && <span className="text-ink-500"> · {r.labName}</span>}
                      {r.testDate && <span className="text-ink-500"> · {fmtDate(r.testDate)}</span>}
                    </span>
                    <span className="font-mono text-ink-400">
                      Σ {fmt(total)} % {r.unit !== '%' && <span className="text-[10.5px]">(aus {r.unit} umgerechnet)</span>}
                    </span>
                  </div>
                  <div className="flex h-3 overflow-hidden rounded-full bg-ink-700">
                    {rows.map((x) => (
                      <div key={x.name} title={`${x.info?.name ?? x.name}: ${fmt(x.value)} ${r.unit}`} style={{ width: `${(x.pct / Math.max(total, 0.0001)) * 100}%`, background: x.info?.color ?? '#5f6d68' }} />
                    ))}
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-400">
                    {rows.map((x) => (
                      <span key={x.name} className="flex items-center gap-1">
                        <span className="size-2 rounded-sm" style={{ background: x.info?.color ?? '#5f6d68' }} />
                        {x.info ? (
                          <a href={href(`discover/terpenes/${x.info.id}`)} className="hover:text-ink-100">
                            {x.info.name}
                          </a>
                        ) : (
                          x.name
                        )}{' '}
                        {fmt(x.value)} {r.unit}
                      </span>
                    ))}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
