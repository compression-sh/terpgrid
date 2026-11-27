import { CalendarClock, NotebookPen } from 'lucide-react';
import { useData } from '../../app/DataProvider';
import { useQuickActions } from '../../app/QuickActions';
import { href } from '../../app/router';
import { relativeDay, today } from '../../lib/dates';
import type { GrowProject } from '../../lib/db/types';
import { fmt } from '../../lib/format';
import { upcoming } from '../../lib/calendar';
import { PHASE_COLOR, PHASE_LABEL, currentPhase, growDay, phaseSpans } from '../../lib/grow/phases';
import { metricSeries } from '../../lib/grow/series';
import { growCompleteness, growData } from '../../lib/grow/summary';
import { PhotoImg } from '../photos/PhotoImg';
import { PhaseChip } from '../ui/Chip';
import { t } from '../../i18n';

/** Minimal-Verlaufslinie (nur Messpunkte, keine Interpolation über Lücken hinaus). */
export function Sparkline({ values, label }: { values: number[]; label: string }) {
  if (values.length < 2) return null;
  const w = 96;
  const h = 28;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * (w - 4) + 2).toFixed(1)},${(h - 3 - ((v - min) / span) * (h - 6)).toFixed(1)}`);
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={label} className="shrink-0">
      <polyline points={pts.join(' ')} fill="none" stroke="var(--color-leaf-400)" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity="0.9" />
      <circle cx={pts.at(-1)!.split(',')[0]} cy={pts.at(-1)!.split(',')[1]} r="2.2" fill="var(--color-leaf-300)" />
    </svg>
  );
}

const DOT: Record<'ok' | 'partial' | 'missing', string> = { ok: 'bg-leaf-400', partial: 'bg-amber-300', missing: 'bg-ink-600 ring-1 ring-inset ring-ink-400/40' };

/** Breite Statuskarte eines aktiven Grows für die Übersicht. */
export function ActiveGrowRow({ grow }: { grow: GrowProject }) {
  const { data } = useData();
  const quick = useQuickActions();
  const todayStr = today();
  const d = growData(grow.id, data);
  const day = growDay(grow.startDate, todayStr, grow.completedDate);
  const phase = currentPhase(grow.phaseDates, todayStr);
  const spans = phaseSpans(grow.phaseDates, todayStr, grow.completedDate);
  const total = spans.reduce((s, x) => s + Math.max(1, x.days), 0);
  const cover = grow.coverPhotoId ?? [...d.photos].sort((a, b) => b.takenAt.localeCompare(a.takenAt))[0]?.id;
  const heights = metricSeries(d.activities, 'heightCm');
  const last = (k: 'heightCm' | 'ph' | 'ecMsCm' | 'temperatureC') => metricSeries(d.activities, k).at(-1);
  const chips = (
    [
      [t('grow.metric.height'), last('heightCm'), 'cm'],
      ['pH', last('ph'), ''],
      ['EC', last('ecMsCm'), 'mS/cm'],
      [t('grow.metric.tempShort'), last('temperatureC'), '°C'],
    ] as const
  ).filter(([, p]) => p);
  const next = upcoming(
    data.reminders.filter((r) => r.growId === grow.id),
    todayStr,
    14,
    1,
  )[0];
  const doc = growCompleteness(grow, d, todayStr);
  return (
    <li className="group relative grid grid-cols-[minmax(0,1fr)] gap-3 rounded-2xl border border-white/[0.06] bg-ink-900/60 p-3 transition-colors hover:border-white/[0.12] sm:grid-cols-[6.5rem_minmax(0,1fr)_auto] sm:items-center sm:gap-4">
      <PhotoImg photoId={cover} alt="" className="hidden aspect-square w-full rounded-xl sm:block" />
      <div className="min-w-0 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <a href={href(`grows/${grow.id}`)} className="block truncate text-[15px] font-semibold text-ink-50 after:absolute after:inset-0 after:rounded-2xl after:content-['']">
              {grow.name}
            </a>
            <p className="text-[12px] text-ink-400">
              {day !== undefined ? t('grow.row.day', { day }) : t('grow.row.starts', { when: relativeDay(grow.startDate, todayStr) })} · {t('grow.row.plants', { count: d.plants.length })} · {t('grow.row.photos', { count: d.photos.length })}
            </p>
          </div>
          <PhaseChip phase={phase} />
        </div>
        {spans.length > 0 ? (
          <div className="flex h-1.5 overflow-hidden rounded-full bg-ink-700" role="img" aria-label={t('grow.row.phases', { list: spans.map((s) => t('grow.row.phaseDays', { phase: PHASE_LABEL[s.phase], count: s.days })).join(', ') })}>
            {spans.map((s) => (
              <div key={s.phase} style={{ width: `${(Math.max(1, s.days) / total) * 100}%`, background: PHASE_COLOR[s.phase], opacity: s.ongoing ? 1 : 0.55 }} />
            ))}
          </div>
        ) : (
          <div className="h-1.5 rounded-full bg-ink-700" title={t('grow.row.noMilestones')} />
        )}
        <div className="flex flex-wrap items-center gap-1.5">
          {chips.length ? (
            chips.map(([label, p, unit]) => (
              <span key={label} className="rounded-md border border-white/[0.06] bg-white/[0.02] px-1.5 py-0.5 text-[11px] text-ink-300">
                {label} <span className="font-mono tabular text-ink-100">{fmt(p!.value)}</span>
                {unit && <span className="text-ink-500"> {unit}</span>}
              </span>
            ))
          ) : (
            <span className="text-[11px] text-ink-500">{t('grow.row.noMeasurements')}</span>
          )}
          {chips.length > 0 && <span className="text-[10px] text-ink-500">{t('grow.row.lastMeasured', { when: relativeDay(d.activities.map((a) => a.date).sort().at(-1)!.slice(0, 10), todayStr) })}</span>}
        </div>
      </div>
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-white/[0.05] pt-2.5 sm:flex-col sm:items-end sm:border-0 sm:pt-0">
        <Sparkline values={heights.slice(-12).map((p) => p.value)} label={t('grow.row.heightSeries', { count: heights.length })} />
        <div className="flex items-center gap-1" role="img" title={doc.map((c) => `${c.label}: ${c.detail}`).join('\n')} aria-label={t('grow.doc.label', { list: doc.map((c) => `${c.label} ${t(c.state === 'ok' ? 'grow.doc.ok' : c.state === 'partial' ? 'grow.doc.partial' : 'grow.doc.missing')}`).join(', ') })}>
          {doc.map((c) => (
            <span key={c.id} className={`size-1.5 rounded-full ${DOT[c.state]}`} />
          ))}
        </div>
        {next && (
          <span className="flex items-center gap-1 text-[11px] text-ink-300">
            <CalendarClock className="size-3.5 text-ink-500" /> {next.reminder.title} · {relativeDay(next.date, todayStr)}
          </span>
        )}
        <button type="button" className="btn-ghost h-8 px-2.5 text-[12px]" onClick={() => quick({ kind: 'log', growId: grow.id })}>
          <NotebookPen className="size-3.5" /> {t('grow.row.log')}
        </button>
      </div>
    </li>
  );
}
