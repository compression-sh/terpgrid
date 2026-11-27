import { fmtDateShort, today } from '../../lib/dates';
import { GROW_PHASES, type PhaseDates } from '../../lib/db/types';
import { PHASE_COLOR, PHASE_LABEL, PHASE_SHORT, phaseOrderIssues, phaseSpans } from '../../lib/grow/phases';
import { Callout } from '../ui/Callout';
import { t } from '../../i18n';

/**
 * Darstellung der erfassten Phasen als proportionale Leiste plus Meilenstein-Liste.
 * Nicht erfasste Phasen werden ausgegraut – es wird nichts geschätzt.
 */
export function PhaseTimeline({ dates, endDate }: { dates: PhaseDates; endDate?: string }) {
  const todayStr = today();
  const spans = phaseSpans(dates, todayStr, endDate);
  const total = spans.reduce((s, x) => s + Math.max(1, x.days), 0);
  const issues = phaseOrderIssues(dates);

  return (
    <div className="space-y-4">
      {spans.length > 0 ? (
        <div>
          <div className="flex h-9 overflow-hidden rounded-lg border border-white/[0.06]" role="img" aria-label={t('grow.phases.title')}>
            {spans.map((s) => (
              <div
                key={s.phase}
                className="relative flex min-w-[2px] items-center overflow-hidden px-2 text-[11px] font-medium text-ink-950"
                style={{ width: `${(Math.max(1, s.days) / total) * 100}%`, background: PHASE_COLOR[s.phase], opacity: s.ongoing ? 1 : 0.72 }}
                title={`${PHASE_LABEL[s.phase]}: ${s.days} Tage${s.ongoing ? ' (laufend)' : ''}`}
              >
                <span className="truncate">{PHASE_SHORT[s.phase]}</span>
                {s.ongoing && <span className="absolute inset-y-0 right-0 w-1 animate-pulse bg-white/60" />}
              </div>
            ))}
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] text-ink-500">
            <span>{fmtDateShort(spans[0]!.start)}</span>
            <span>{endDate ? fmtDateShort(endDate) : 'heute'}</span>
          </div>
        </div>
      ) : (
        <p className="hint">{t('grow.phases.none')}</p>
      )}

      <ol className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {GROW_PHASES.map((p) => {
          const span = spans.find((s) => s.phase === p);
          const date = dates[p];
          const future = date && date > todayStr;
          return (
            <li key={p} className={`rounded-lg border px-3 py-2 ${date ? 'border-white/[0.07] bg-white/[0.02]' : 'border-dashed border-white/[0.05] opacity-50'}`}>
              <div className="flex items-center gap-2 text-[12px] font-medium text-ink-200">
                <span className="size-2 rounded-full" style={{ background: date ? PHASE_COLOR[p] : 'transparent', border: date ? 'none' : '1px solid rgb(255 255 255 / 0.2)' }} />
                {PHASE_LABEL[p]}
              </div>
              <div className="mt-0.5 font-mono text-[11px] text-ink-400">
                {date ? (
                  <>
                    {fmtDateShort(date)}
                    {span && ` · ${t('grow.phases.days', { count: span.days })}${span.ongoing ? ` ${t('grow.phases.ongoing')}` : ''}`}
                    {future && ` · ${t('grow.phases.planned')}`}
                  </>
                ) : (
                  t('grow.phases.notRecorded')
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {issues.length > 0 && <Callout tone="warn">{issues.join(' ')}</Callout>}
    </div>
  );
}
