import { FlaskConical } from 'lucide-react';
import { href } from '../../app/router';
import { type LibCultivarDetail, listingEvidence } from '../../lib/catalog/library';
import type { LabReport } from '../../lib/db/types';
import { fmtDate } from '../../lib/dates';
import { fmt } from '../../lib/format';
import { Card } from '../ui/Card';
import { EvidenceTag } from './EvidenceTag';
import { TerpeneChips } from './TerpeneChips';
import { t } from '../../i18n';

/**
 * Terpene einer Katalogsorte – strikt nach Belegart getrennt:
 * 1. eigene Laborberichte (privat, je Probe), 2. Breeder-/Seedbank-Nennungen, 3. Datenbank-Nennungen.
 * Nennungen sind KEINE Mengen; aus Aromen werden keine Terpene abgeleitet.
 */
export function TerpeneCard({ detail, labReports, hasSamples }: { detail: LibCultivarDetail; labReports: LabReport[]; hasSamples?: boolean }) {
  const c = detail.cultivar;
  const shop = c.values.terpenes ?? [];
  const db = (detail.claims ?? []).filter((k) => k.field === 'terpenes');
  const labs = labReports.filter((r) => r.terpenes.length > 0);
  const none = !shop.length && !db.length && !labs.length;
  return (
    <Card title={t('discover.tc.title')} subtitle={t('discover.tc.subtitle')} icon={<FlaskConical className="size-4" />}>
      {none ? (
        <div className="space-y-2">
          <p className="text-[14px] font-medium text-ink-100">{t('discover.tc.none')}</p>
          <p className="text-[12px] leading-relaxed text-ink-400">
            {t('discover.tc.noneText')}
          </p>
          {hasSamples && (
            <p className="text-[12px] leading-relaxed text-ink-300">
              {t('discover.tc.samplesA')} <em>{t('discover.tc.samplesB')}</em> {t('discover.tc.samplesC')}
            </p>
          )}
          <a href={href('discover/learn/terpene-analytik')} className="inline-flex text-[12px] text-leaf-300 hover:underline">
            {t('discover.tc.why')}
          </a>
        </div>
      ) : (
        <div className="space-y-4">
          {labs.map((r) => {
            const max = Math.max(...r.terpenes.map((x) => x.value), 0.0001);
            return (
              <section key={r.id} aria-label={t('discover.tc.report', { title: r.title })}>
                <p className="mb-1.5 flex flex-wrap items-center gap-2 text-[12px] text-ink-300">
                  <EvidenceTag kind="lab" source={r.labName || t('discover.tc.ownReport')} />
                  <span>
                    {r.title}
                    {r.testDate ? ` · ${fmtDate(r.testDate)}` : ''}
                    {r.batchId ? t('discover.tc.batch', { id: r.batchId }) : ''}
                  </span>
                </p>
                <ul className="space-y-1">
                  {[...r.terpenes]
                    .sort((a, b) => b.value - a.value)
                    .map((tp) => (
                      <li key={tp.name} className="grid grid-cols-[7.5rem_minmax(0,1fr)_4.5rem] items-center gap-2 text-[12px]">
                        <span className="truncate text-ink-200">{tp.name}</span>
                        <span className="h-1.5 rounded-full bg-ink-700" aria-hidden>
                          <span className="block h-full rounded-full bg-leaf-400" style={{ width: `${(tp.value / max) * 100}%` }} />
                        </span>
                        <span className="text-right font-mono tabular text-ink-100">
                          {fmt(tp.value)} {r.unit}
                        </span>
                      </li>
                    ))}
                </ul>
                <p className="hint mt-1">{t('discover.tc.private')}</p>
              </section>
            );
          })}
          {shop.length > 0 && (
            <section>
              <p className="mb-1.5">
                <EvidenceTag kind={listingEvidence(detail, ['terpenes'])} source="CI-Strains-Pro" />
              </p>
              <TerpeneChips names={shop} max={10} size="xs" />
            </section>
          )}
          {db.map((k) => (
            <section key={k.provider}>
              <p className="mb-1.5 flex flex-wrap items-center gap-2">
                <EvidenceTag kind="database" source={k.providerName} />
                {k.sourceUrl && (
                  <a href={k.sourceUrl} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer" className="text-[11px] text-leaf-300 hover:underline">
                    {t('discover.tc.source')}
                  </a>
                )}
                <span className="text-[10.5px] text-ink-500">{t('discover.tc.retrieved', { date: fmtDate(String(k.retrievedAt).slice(0, 10)) })}</span>
              </p>
              <TerpeneChips names={(k.value as { original: string }[]).map((x) => x.original)} max={10} size="xs" />
            </section>
          ))}
          <p className="hint">{t('discover.tc.mentions')}</p>
        </div>
      )}
    </Card>
  );
}
