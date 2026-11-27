import { ChevronLeft, ChevronRight } from 'lucide-react';
import { addMonths, fmtMonth, monthGrid, startOfMonth, today, fmtDate } from '../../lib/dates';
import { intlLocale, t } from '../../i18n';

export interface DayMarker {
  color: string;
  label: string;
}

/** Kurze Wochentagsnamen (Mo–So) in der aktiven Sprache – 2024-01-01 war ein Montag. */
const weekdays = () => Array.from({ length: 7 }, (_, i) => new Intl.DateTimeFormat(intlLocale(), { weekday: 'short', timeZone: 'UTC' }).format(Date.UTC(2024, 0, 1 + i)));

/** Kompakte Monatsansicht mit farbigen Markierungen je Tag. */
export function MonthCalendar({
  month,
  onMonth,
  markers,
  selected,
  onSelect,
  compact,
}: {
  month: string;
  onMonth: (m: string) => void;
  markers: Map<string, DayMarker[]>;
  selected?: string;
  onSelect?: (d: string) => void;
  compact?: boolean;
}) {
  const days = monthGrid(month);
  const todayStr = today();
  const m = month.slice(0, 7);
  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <button type="button" className="btn-ghost p-1.5" aria-label={t('common.cal.prevMonth')} onClick={() => onMonth(addMonths(startOfMonth(month), -1))}>
          <ChevronLeft className="size-4" />
        </button>
        <div className="flex items-center gap-2">
          <span className="text-[14px] font-semibold capitalize text-ink-50">{fmtMonth(month)}</span>
          {m !== todayStr.slice(0, 7) && (
            <button type="button" className="rounded-md px-1.5 py-0.5 text-[11px] text-leaf-300 hover:bg-white/[0.04]" onClick={() => onMonth(startOfMonth(todayStr))}>
              {t('common.cal.today')}
            </button>
          )}
        </div>
        <button type="button" className="btn-ghost p-1.5" aria-label={t('common.cal.nextMonth')} onClick={() => onMonth(addMonths(startOfMonth(month), 1))}>
          <ChevronRight className="size-4" />
        </button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-medium uppercase tracking-wider text-ink-500">
        {weekdays().map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1" role="group" aria-label={t('common.cal.daysIn', { month: fmtMonth(month) })}>
        {days.map((d) => {
          const inMonth = d.slice(0, 7) === m;
          const mk = markers.get(d) ?? [];
          const isSel = selected === d;
          const isToday = d === todayStr;
          return (
            <button
              key={d}
              type="button"
              aria-pressed={isSel}
              aria-current={isToday ? 'date' : undefined}
              aria-label={`${fmtDate(d)}${isToday ? ' (heute)' : ''}${mk.length ? `: ${mk.map((x) => x.label).join(', ')}` : ''}`}
              onClick={() => onSelect?.(d)}
              className={`relative flex flex-col items-center rounded-lg border transition-colors ${compact ? 'h-10 pt-1' : 'h-14 pt-1.5 sm:h-20'} ${
                isSel ? 'border-leaf-500/50 bg-leaf-500/10' : 'border-transparent hover:border-white/[0.08] hover:bg-white/[0.02]'
              } ${inMonth ? '' : 'opacity-35'}`}
            >
              <span className={`grid size-6 place-items-center rounded-full font-mono text-[12px] ${isToday ? 'bg-leaf-500 font-semibold text-ink-950' : 'text-ink-200'}`}>{Number(d.slice(8))}</span>
              {mk.length > 0 && (
                <span className="mt-1 flex max-w-full flex-wrap justify-center gap-0.5 px-0.5">
                  {mk.slice(0, compact ? 3 : 5).map((x, i) => (
                    <span key={i} className="size-1.5 rounded-full" style={{ background: x.color }} />
                  ))}
                  {mk.length > (compact ? 3 : 5) && <span className="text-[8px] leading-none text-ink-400">+</span>}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
