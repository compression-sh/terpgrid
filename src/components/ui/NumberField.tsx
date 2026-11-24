import { useEffect, useId, useState } from 'react';
import { parseLocaleNumber } from '../../lib/calc/validation';
import { fmt } from '../../lib/format';

export interface NumberFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step?: number;
  /** Slider-Bereich, falls er kleiner als der erlaubte Bereich sein soll. */
  sliderMax?: number;
  sliderMin?: number;
  unit?: string;
  hint?: string;
  /** Anzeige-Skalierung: 100 → Wert 0,7 wird als 70 angezeigt (Prozent). */
  scale?: number;
  integer?: boolean;
  /** Wert darf 0 nicht sein (strikt größer als min). */
  positive?: boolean;
  slider?: boolean;
  badge?: string;
}

function display(value: number, scale: number, integer?: boolean): string {
  const v = value * scale;
  if (!Number.isFinite(v)) return '';
  return integer ? String(Math.round(v)) : fmt(v, 3).replace(/\./g, '');
}

/**
 * Kombiniertes Eingabefeld aus Slider und Zahlenfeld mit Validierung.
 * Ungültige Eingaben werden angezeigt, aber nicht an die Berechnung weitergegeben.
 */
export function NumberField({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  sliderMin,
  sliderMax,
  unit,
  hint,
  scale = 1,
  integer,
  positive,
  slider = true,
  badge,
}: NumberFieldProps) {
  const id = useId();
  const [text, setText] = useState(() => display(value, scale, integer));
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) {
      setText(display(value, scale, integer));
      setError(null);
    }
  }, [value, scale, integer, focused]);

  const dMin = min * scale;
  const dMax = max * scale;
  const sMin = (sliderMin ?? min) * scale;
  const sMax = (sliderMax ?? max) * scale;
  const shown = value * scale;
  const fill = Math.min(100, Math.max(0, ((shown - sMin) / (sMax - sMin || 1)) * 100));

  function commit(raw: string) {
    setText(raw);
    const n = parseLocaleNumber(raw);
    if (Number.isNaN(n)) {
      setError('Bitte eine Zahl eingeben.');
      return;
    }
    if (n < dMin || n > dMax) {
      setError(`Erlaubt: ${fmt(dMin)}–${fmt(dMax)}${unit ? ` ${unit}` : ''}`);
      return;
    }
    if (positive && n <= 0) {
      setError('Wert muss größer als 0 sein.');
      return;
    }
    if (integer && !Number.isInteger(n)) {
      setError('Bitte eine ganze Zahl eingeben.');
      return;
    }
    setError(null);
    onChange(n / scale);
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="label flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          {label}
          {badge && (
            <span className="rounded-full border border-amber-400/20 bg-amber-400/10 px-1.5 py-px text-[10px] font-medium uppercase tracking-wide text-amber-300">
              {badge}
            </span>
          )}
        </label>
        <div className="relative w-[7.25rem] shrink-0 sm:w-[8rem]">
          <input
            id={id}
            inputMode={integer ? 'numeric' : 'decimal'}
            autoComplete="off"
            style={{ paddingRight: unit ? `${1.4 + unit.length * 0.5}rem` : undefined }}
            className={`input-base py-1.5 text-right font-mono text-[13px] ${
              error ? 'border-rose-400/60 focus:border-rose-400/70 focus:ring-rose-400/20' : ''
            }`}
            value={text}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-err` : hint ? `${id}-hint` : undefined}
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
            }}
            onChange={(e) => commit(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                const dir = e.key === 'ArrowUp' ? 1 : -1;
                const next = Math.min(dMax, Math.max(dMin, shown + dir * step * (e.shiftKey ? 10 : 1)));
                const rounded = Math.round(next / step) * step;
                setText(display(rounded / scale, scale, integer));
                setError(null);
                onChange(rounded / scale);
              }
            }}
          />
          {unit && (
            <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-ink-400">
              {unit}
            </span>
          )}
        </div>
      </div>
      {slider && (
        <input
          type="range"
          className="slider"
          aria-label={`${label} (Schieberegler)`}
          min={sMin}
          max={sMax}
          step={step}
          value={Math.min(sMax, Math.max(sMin, shown))}
          style={{ ['--fill' as string]: `${fill}%` }}
          onChange={(e) => {
            const n = Number(e.target.value);
            setError(null);
            setText(display(n / scale, scale, integer));
            onChange(n / scale);
          }}
        />
      )}
      {error ? (
        <p id={`${id}-err`} role="alert" className="text-xs text-rose-300">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="hint">
            {hint}
          </p>
        )
      )}
    </div>
  );
}
