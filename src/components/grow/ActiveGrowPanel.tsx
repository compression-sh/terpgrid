import { CalendarClock, NotebookPen } from 'lucide-react';
import { useData } from '../../app/DataProvider';
import { useQuickActions } from '../../app/QuickActions';
import { href } from '../../app/router';
import { relativeDay, today } from '../../lib/dates';
import type { GrowProject } from '../../lib/db/types';
import { fmt } from '../../lib/format';
import { upcoming } from '../../lib/calendar';
import { PHASE_COLOR, currentPhase, growDay, phaseSpans } from '../../lib/grow/phases';
import { metricSeries } from '../../lib/grow/series';
import { growCompleteness, growData } from '../../lib/grow/summary';
import { PhotoImg } from '../photos/PhotoImg';
import { PhaseChip } from '../ui/Chip';

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
  const t = today();
  const d = growData(grow.id, data);
  const day = growDay(grow.startDate, t, grow.completedDate);
  const phase = currentPhase(grow.phaseDates, t);
  const spans = phaseSpans(grow.phaseDates, t, grow.completedDate);
  const total = spans.reduce((s, x) => s + Math.max(1, x.days), 0);
  const cover = grow.coverPhotoId ?? [...d.photos].sort((a, b) => b.takenAt.localeCompare(a.takenAt))[0]?.id;
  const heights = metricSeries(d.activities, 'heightCm');
  const last = (k: 'heightCm' | 'ph' | 'ecMsCm' | 'temperatureC') => metricSeries(d.activities, k).at(-1);
  const chips = (
    [
      ['Höhe', last('heightCm'), 'cm'],
      ['pH', last('ph'), ''],
      ['EC', last('ecMsCm'), 'mS/cm'],
      ['Temp.', last('temperatureC'), '°C'],
    ] as const
  ).filter(([, p]) => p);
  const next = upcoming(
    data.reminders.filter((r) => r.growId === grow.id),
    t,
    14,
    1,
  )[0];
  const doc = growCompleteness(grow, d, t);
  return (
    <li className="group relative grid gap-3 rounded-2xl border border-white/[0.06] bg-ink-900/60 p-3 transition-colors hover:border-white/[0.12] sm:grid-cols-[6.5rem_minmax(0,1fr)_auto] sm:items-center sm:gap-4">
      <PhotoImg photoId={cover} alt="" className="hidden aspect-square w-full rounded-xl sm:block" />
      <div className="min-w-0 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <a href={href(`grows/${grow.id}`)} className="block truncate text-[15px] font-semibold text-ink-50 after:absolute after:inset-0 after:rounded-2xl after:content-['']">
              {grow.name}
            </a>
            <p className="text-[12px] text-ink-400">
              {day !== undefined ? `Tag ${day}` : `startet ${relativeDay(grow.startDate, t)}`} · {d.plants.length} {d.plants.length === 1 ? 'Pflanze' : 'Pflanzen'} · {d.photos.length} Fotos
            </p>
          </div>
          <PhaseChip phase={phase} />
        </div>
        {spans.length > 0 ? (
          <div className="flex h-1.5 overflow-hidden rounded-full bg-ink-700" role="img" aria-label={`Phasen: ${spans.map((s) => `${s.phase} ${s.days} Tage`).join(', ')}`}>
            {spans.map((s) => (
              <div key={s.phase} style={{ width: `${(Math.max(1, s.days) / total) * 100}%`, background: PHASE_COLOR[s.phase], opacity: s.ongoing ? 1 : 0.55 }} />
            ))}
          </div>
        ) : (
          <div className="h-1.5 rounded-full bg-ink-700" title="Noch keine Meilensteine erfasst" />
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
            <span className="text-[11px] text-ink-500">Noch keine Messwerte</span>
          )}
          {chips.length > 0 && <span className="text-[10px] text-ink-500">zuletzt {relativeDay(d.activities.map((a) => a.date).sort().at(-1)!.slice(0, 10), t)}</span>}
        </div>
      </div>
      <div className="relative z-10 flex items-center justify-between gap-3 border-t border-white/[0.05] pt-2.5 sm:flex-col sm:items-end sm:border-0 sm:pt-0">
        <Sparkline values={heights.slice(-12).map((p) => p.value)} label={`Höhe: ${heights.length} Messungen`} />
        <div className="flex items-center gap-1" role="img" title={doc.map((c) => `${c.label}: ${c.detail}`).join('\n')} aria-label={`Dokumentation: ${doc.map((c) => `${c.label} ${c.state === 'ok' ? 'vollständig' : c.state === 'partial' ? 'teilweise' : 'fehlt'}`).join(', ')}`}>
          {doc.map((c) => (
            <span key={c.id} className={`size-1.5 rounded-full ${DOT[c.state]}`} />
          ))}
        </div>
        {next && (
          <span className="flex items-center gap-1 text-[11px] text-ink-300">
            <CalendarClock className="size-3.5 text-ink-500" /> {next.reminder.title} · {relativeDay(next.date, t)}
          </span>
        )}
        <button type="button" className="btn-ghost h-8 px-2.5 text-[12px]" onClick={() => quick({ kind: 'log', growId: grow.id })}>
          <NotebookPen className="size-3.5" /> Log
        </button>
      </div>
    </li>
  );
}
