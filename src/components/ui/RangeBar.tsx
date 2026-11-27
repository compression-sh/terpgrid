import type { Range } from '../../lib/calc/potency';
import { fmt } from '../../lib/format';
import { t } from '../../i18n';

interface RangeBarProps {
  range: Range;
  max: number;
  unit: string;
  /** Optionale Markierungen (z. B. 2,5 / 5 / 10 mg). */
  markers?: { value: number; label: string }[];
  log?: boolean;
}

/** Horizontaler Balken: Unsicherheitsbereich mit Mittelwert. */
export function RangeBar({ range, max, unit, markers = [], log = false }: RangeBarProps) {
  const minLog = 0.5;
  const pos = (v: number) => {
    if (log) {
      if (v <= minLog) return 0;
      return Math.min(100, (Math.log(v / minLog) / Math.log(max / minLog)) * 100);
    }
    return Math.min(100, Math.max(0, (v / max) * 100));
  };
  const l = pos(range.low);
  const h = pos(range.high);
  const m = pos(range.mid);
  return (
    <div className="pt-8 pb-6" aria-label={t('common.range.aria', { low: fmt(range.low), high: fmt(range.high), unit })}>
      <div className="relative h-2.5 rounded-full bg-ink-700">
        {markers.map((mk) => (
          <div key={mk.label} className="absolute -top-1.5 bottom-[-6px] w-px bg-white/15" style={{ left: `${pos(mk.value)}%` }}>
            <span className="absolute top-[22px] -translate-x-1/2 whitespace-nowrap text-[10px] text-ink-400">{mk.label}</span>
          </div>
        ))}
        <div
          className="absolute inset-y-0 rounded-full bg-gradient-to-r from-leaf-500/40 via-amber-400/50 to-rose-400/50 transition-all duration-500"
          style={{ left: `${l}%`, width: `${Math.max(0.8, h - l)}%` }}
        />
        <div
          className="absolute top-1/2 size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-ink-950 bg-ink-50 shadow transition-all duration-500"
          style={{ left: `${m}%` }}
        >
          <span className="absolute bottom-[18px] left-1/2 -translate-x-1/2 whitespace-nowrap font-mono text-[11px] text-ink-100">
            ~{fmt(range.mid)} {unit}
          </span>
        </div>
      </div>
    </div>
  );
}
