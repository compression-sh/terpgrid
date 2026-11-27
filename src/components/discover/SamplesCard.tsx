import { Microscope } from 'lucide-react';
import { href } from '../../app/router';
import type { LibSampleStat, LibSampleSummary } from '../../lib/catalog/library';
import { REGION_LABEL, SAMPLE_CANNABINOIDS, SAMPLE_TERPENES, ownReportPercent } from '../../lib/catalog/samples';
import type { LabReport } from '../../lib/db/types';
import { fmt } from '../../lib/format';
import { Card } from '../ui/Card';
import { EvidenceTag } from './EvidenceTag';
import { t } from '../../i18n';

const pct = (v: number) => `${fmt(v, v < 0.1 ? 3 : 2)} %`;

/**
 * Öffentliche Laborproben GLEICHNAMIGER Handelsprodukte (Smith et al. 2022).
 * Bewusst kein „Sortenprofil“: Verteilung über Proben ohne Breeder-Zuordnung, mit n je Wert.
 * Eigene (private) Laborberichte werden nur im Browser daneben gestellt.
 */
export function SamplesCard({ s, cultivarName, ownReports }: { s: LibSampleSummary; cultivarName: string; ownReports: LabReport[] }) {
  const own = ownReports[0] ? { report: ownReports[0], ...ownReportPercent(ownReports[0]) } : undefined;
  const cannabinoids = SAMPLE_CANNABINOIDS.map((c) => ({ ...c, st: s.stats[c.key] })).filter((c): c is typeof c & { st: LibSampleStat } => !!c.st && (c.key === 'thc_total' || c.key === 'cbd_total' || c.st.detected > 0));
  const terpenes = SAMPLE_TERPENES.map((tp) => ({ ...tp, st: s.stats[tp.column] }))
    .filter((tp): tp is typeof tp & { st: LibSampleStat } => !!tp.st)
    .sort((a, b) => b.st.median - a.st.median || b.st.p75 - a.st.p75);
  const scale = Math.max(...terpenes.map((tp) => tp.st.p75), 0.0001);
  const total = s.stats.total_terpenes;
  const regions = Object.entries(s.regions).sort((a, b) => b[1] - a[1]);
  return (
    <Card title={t('discover.sm.title')} subtitle={t('discover.sm.subtitle')} icon={<Microscope className="size-4" />}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          <EvidenceTag kind="science" source="Smith et al. 2022" />
          <EvidenceTag kind="name-only" />
        </div>
        <p className="text-[12.5px] leading-relaxed text-ink-300">
          {t('discover.sm.intro', { count: s.samples, n: fmt(s.samples, 0), name: cultivarName })}
          {s.terpeneSamples > 0 ? t('discover.sm.withTerp', { n: fmt(s.terpeneSamples, 0) }) : ''}. {t('discover.sm.unknownOrigin')}
          {s.sameNameBreeders > 1 && ` ${t('discover.sm.sameName', { n: s.sameNameBreeders })}`} {t('discover.sm.describes')}
        </p>

        {cannabinoids.length > 0 && (
          <section aria-label={t('discover.sm.cannAria')}>
            <h3 className="mb-1.5 text-[12px] font-semibold text-ink-200">{t('discover.sm.cannTitle')}</h3>
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t('discover.sm.tableAria')}>
              <table className="w-full min-w-[22rem] text-left text-[12px]">
                <thead className="text-[11px] text-ink-500">
                  <tr>
                    <th className="py-1 pr-2 font-medium">{t('discover.sm.value')}</th>
                    <th className="py-1 pr-2 text-right font-medium">{t('discover.sm.median')}</th>
                    <th className="py-1 pr-2 text-right font-medium">{t('discover.sm.iqr')}</th>
                    <th className="py-1 pr-2 text-right font-medium">{t('discover.sm.samples')}</th>
                    {own && Object.keys(own.cannabinoids).length > 0 && <th className="py-1 text-right font-medium">{t('discover.sm.yours')}</th>}
                  </tr>
                </thead>
                <tbody className="font-mono tabular text-ink-100">
                  {cannabinoids.map((c) => (
                    <tr key={c.key} className="border-t border-white/[0.04]">
                      <td className="py-1 pr-2 font-sans text-ink-200">{c.label}</td>
                      <td className="py-1 pr-2 text-right">{pct(c.st.median)}</td>
                      <td className="py-1 pr-2 text-right text-ink-300">
                        {fmt(c.st.p25, 1)}–{fmt(c.st.p75, 1)} %
                      </td>
                      <td className="py-1 pr-2 text-right text-ink-400">{fmt(c.st.n, 0)}</td>
                      {own && Object.keys(own.cannabinoids).length > 0 && <td className="py-1 text-right text-leaf-200">{own.cannabinoids[c.key] !== undefined ? pct(own.cannabinoids[c.key]!) : '–'}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {terpenes.length > 0 ? (
          <section aria-label={t('discover.sm.terpAria')}>
            <h3 className="mb-1 text-[12px] font-semibold text-ink-200">{t('discover.sm.terpTitle')}</h3>
            <p className="mb-2 text-[11px] text-ink-500">{t('discover.sm.legend')}</p>
            <ul className="space-y-1.5">
              {terpenes.map((tp) => (
                <li key={tp.column} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_auto] items-center gap-2 text-[12px]">
                  <a href={href(`discover/terpenes/${tp.atlasId}`)} className="truncate text-ink-200 hover:underline" title={tp.isomerSum}>
                    {tp.label}
                    {tp.isomerSum && <span className="text-ink-500"> (Σ)</span>}
                  </a>
                  <span className="relative h-2 rounded-full bg-ink-700" role="img" aria-label={t('discover.sm.barAria', { label: tp.label, median: pct(tp.st.median), p25: pct(tp.st.p25), p75: pct(tp.st.p75) })}>
                    <span className="absolute inset-y-0 rounded-full bg-teal-400/45" style={{ left: `${(tp.st.p25 / scale) * 100}%`, width: `${Math.max(1, ((tp.st.p75 - tp.st.p25) / scale) * 100)}%` }} />
                    <span className="absolute -inset-y-0.5 w-0.5 rounded bg-teal-200" style={{ left: `calc(${Math.min(100, (tp.st.median / scale) * 100)}% - 1px)` }} />
                    {own?.terpenes[tp.column] !== undefined && (
                      <span className="absolute -inset-y-1 w-1 rounded bg-leaf-300" title={t('discover.sm.yours')} style={{ left: `calc(${Math.min(100, (own.terpenes[tp.column]! / scale) * 100)}% - 2px)` }} />
                    )}
                  </span>
                  <span className="whitespace-nowrap text-right font-mono text-[11px] tabular text-ink-300">
                    {pct(tp.st.median)} <span className="text-ink-500">{t('discover.sm.detectedPct', { n: Math.round((tp.st.detected / tp.st.n) * 100) })}</span>
                  </span>
                </li>
              ))}
            </ul>
            {total && (
              <p className="mt-2 text-[11.5px] text-ink-400">
                {t('discover.sm.totalA')} <span className="font-mono tabular text-ink-200">{pct(total.median)}</span>
                {t('discover.sm.totalB', { p25: fmt(total.p25, 2), p75: fmt(total.p75, 2), count: total.n, n: fmt(total.n, 0) })}
              </p>
            )}
            {own && Object.keys(own.terpenes).length > 0 && (
              <p className="mt-1 flex items-center gap-1.5 text-[11.5px] text-ink-400">
                <span className="inline-block h-2.5 w-1 rounded bg-leaf-300" aria-hidden /> {t('discover.sm.yoursNamed', { title: own.report.title })}
              </p>
            )}
          </section>
        ) : (
          <p className="text-[12.5px] text-ink-400">{t('discover.sm.noTerp')}</p>
        )}

        <details className="text-[11.5px] text-ink-400">
          <summary className="cursor-pointer text-ink-300 hover:text-ink-100">{t('discover.sm.method')}</summary>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>{s.source.citation}</li>
            <li>
              {t('discover.sm.dataset')}{' '}
              <a href={s.source.licenseUrl} target="_blank" rel="noopener noreferrer" className="text-leaf-300 hover:underline">
                {s.source.license}
              </a>
              {s.source.version ? t('discover.sm.version', { v: s.source.version.slice(0, 7) }) : ''} ·{' '}
              <a href={`https://doi.org/${s.source.doi}`} target="_blank" rel="noopener noreferrer" className="text-leaf-300 hover:underline">
                {t('discover.sm.publication')}
              </a>
            </li>
            <li>{t('discover.sm.regions', { list: regions.map(([r, n]) => `${REGION_LABEL[r] ?? r} ${n}`).join(', ') })}</li>
            <li>{t('discover.sm.totalCalc')}</li>
            <li>{t('discover.sm.terpNote')}</li>
            <li>{t('discover.sm.matching')}</li>
          </ul>
          <a href={href('discover/learn/terpene-analytik')} className="mt-2 inline-flex text-leaf-300 hover:underline">
            {t('discover.sm.why')}
          </a>
        </details>
      </div>
    </Card>
  );
}
