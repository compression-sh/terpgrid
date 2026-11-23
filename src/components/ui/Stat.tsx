import type { ReactNode } from 'react';
import type { Range } from '../../lib/calc/potency';
import { fmt } from '../../lib/format';

interface StatProps {
  label: string;
  value?: number;
  range?: Range;
  unit: string;
  hint?: ReactNode;
  emphasis?: boolean;
  /** Kennzeichnung "theoretisch" (kein Unsicherheitsbereich, Maximalwert). */
  theoretical?: boolean;
  /** Bereich als Hauptwert anzeigen (kein hervorgehobener Mittelwert). */
  rangeOnly?: boolean;
  step?: number;
}

/**
 * Ergebnisanzeige. Bei vorhandenem Bereich wird der Mittelwert als "ca."
 * dargestellt und der Bereich immer mit angezeigt – nie nur eine Zahl.
 */
export function Stat({ label, value, range, unit, hint, emphasis, theoretical, rangeOnly, step }: StatProps) {
  const main = range ? range.mid : (value ?? 0);
  return (
    <div
      className={`rounded-xl border p-4 ${
        emphasis ? 'border-leaf-500/25 bg-gradient-to-b from-leaf-500/[0.08] to-transparent' : 'border-white/[0.06] bg-white/[0.015]'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-medium text-ink-300">
          {step !== undefined && <span className="grid size-4 place-items-center rounded-full border border-white/15 font-mono text-[9px] text-ink-400">{step}</span>}
          {label}
        </div>
        {theoretical && (
          <span className="rounded-full border border-white/10 px-1.5 py-px text-[10px] uppercase tracking-wide text-ink-400">
            theoretisch
          </span>
        )}
        {range && (
          <span className="rounded-full border border-amber-400/20 bg-amber-400/[0.06] px-1.5 py-px text-[10px] uppercase tracking-wide text-amber-300/90">
            Schätzung
          </span>
        )}
      </div>
      {range && rangeOnly ? (
        <div className="mt-1.5 flex flex-wrap items-baseline gap-x-1.5">
          <span className={`font-mono tabular font-semibold tracking-tight text-ink-50 ${emphasis ? 'text-2xl' : 'text-xl'}`}>
            {fmt(range.low)}–{fmt(range.high)}
          </span>
          <span className="text-sm text-ink-300">{unit}</span>
        </div>
      ) : (
      <div className="mt-1.5 flex items-baseline gap-1.5">
        {range && <span className="text-sm text-ink-400">ca.</span>}
        <span className={`font-mono tabular font-semibold tracking-tight text-ink-50 ${emphasis ? 'text-3xl' : 'text-2xl'}`}>
          {fmt(main)}
        </span>
        <span className="text-sm text-ink-300">{unit}</span>
      </div>
      )}
      {range && !rangeOnly && (
        <div className="mt-1 font-mono text-xs tabular text-ink-300">
          Bereich {fmt(range.low)} – {fmt(range.high)} {unit}
        </div>
      )}
      {hint && <div className="hint mt-2">{hint}</div>}
    </div>
  );
}
