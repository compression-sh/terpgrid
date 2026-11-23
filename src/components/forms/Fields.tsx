import { Star } from 'lucide-react';
import { type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes, useId } from 'react';
import { parseLocaleNumber } from '../../lib/calc/validation';

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  children: (id: string, describedBy?: string) => ReactNode;
  className?: string;
}

export function Field({ label, hint, error, required, children, className = '' }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-err` : hint ? `${id}-hint` : undefined;
  return (
    <div className={`space-y-1.5 ${className}`}>
      <label htmlFor={id} className="label">
        {label}
        {required && <span className="ml-0.5 text-leaf-400">*</span>}
      </label>
      {children(id, describedBy)}
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

type TextProps = Omit<InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> & {
  label: string;
  value: string;
  onChange: (v: string) => void;
  hint?: ReactNode;
  error?: string;
};

export function TextField({ label, value, onChange, hint, error, required, className, ...rest }: TextProps) {
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {(id, d) => (
        <input
          id={id}
          aria-describedby={d}
          aria-invalid={!!error}
          required={required}
          className="input-base"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          {...rest}
        />
      )}
    </Field>
  );
}

export function TextArea({
  label,
  value,
  onChange,
  hint,
  rows = 3,
  ...rest
}: Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'onChange' | 'value'> & { label: string; value: string; onChange: (v: string) => void; hint?: ReactNode }) {
  return (
    <Field label={label} hint={hint}>
      {(id, d) => (
        <textarea id={id} aria-describedby={d} rows={rows} className="input-base resize-y leading-relaxed" value={value} onChange={(e) => onChange(e.target.value)} {...rest} />
      )}
    </Field>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  onChange,
  options,
  hint,
  placeholder,
  ...rest
}: Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> & {
  label: string;
  value: T | '';
  onChange: (v: T | '') => void;
  options: { value: T; label: string }[];
  hint?: ReactNode;
  placeholder?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      {(id, d) => (
        <select id={id} aria-describedby={d} className="input-base appearance-none bg-[length:12px] pr-8" value={value} onChange={(e) => onChange(e.target.value as T | '')} {...rest}>
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

/**
 * Optionales Zahlenfeld: leer = undefined. Akzeptiert Dezimalkomma.
 * Der Rohtext wird vom Aufrufer gehalten, damit Eingaben wie "1," möglich sind.
 */
export function OptionalNumber({
  label,
  text,
  onText,
  unit,
  hint,
  min,
  max,
  required,
}: {
  label: string;
  text: string;
  onText: (t: string) => void;
  unit?: string;
  hint?: ReactNode;
  min?: number;
  max?: number;
  required?: boolean;
}) {
  const err = numberError(text, { min, max, required });
  return (
    <Field label={label} hint={hint} error={err} required={required}>
      {(id, d) => (
        <div className="relative">
          <input
            id={id}
            aria-describedby={d}
            aria-invalid={!!err}
            inputMode="decimal"
            autoComplete="off"
            className="input-base font-mono"
            style={{ paddingRight: unit ? `${1.2 + unit.length * 0.5}rem` : undefined }}
            value={text}
            onChange={(e) => onText(e.target.value)}
          />
          {unit && <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-ink-400">{unit}</span>}
        </div>
      )}
    </Field>
  );
}

export function numberError(text: string, { min, max, required }: { min?: number; max?: number; required?: boolean }): string | undefined {
  if (text.trim() === '') return required ? 'Pflichtfeld' : undefined;
  const n = parseLocaleNumber(text);
  if (Number.isNaN(n)) return 'Bitte eine Zahl eingeben.';
  if (min !== undefined && n < min) return `Mindestens ${min.toLocaleString('de-DE')}`;
  if (max !== undefined && n > max) return `Höchstens ${max.toLocaleString('de-DE')}`;
  return undefined;
}

export function toOptionalNumber(text: string): number | undefined {
  if (text.trim() === '') return undefined;
  const n = parseLocaleNumber(text);
  return Number.isNaN(n) ? undefined : n;
}

export function numText(n?: number): string {
  return n === undefined || !Number.isFinite(n) ? '' : String(n).replace('.', ',');
}

export function ChipSelect({ label, options, value, onChange, hint }: { label: string; options: string[]; value: string[]; onChange: (v: string[]) => void; hint?: ReactNode }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <div id={id} className="label">
        {label}
      </div>
      <div role="group" aria-labelledby={id} className="flex flex-wrap gap-1.5">
        {options.map((o) => {
          const on = value.includes(o);
          return (
            <button
              key={o}
              type="button"
              aria-pressed={on}
              onClick={() => onChange(on ? value.filter((v) => v !== o) : [...value, o])}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                on ? 'border-leaf-500/40 bg-leaf-500/15 text-leaf-200' : 'border-white/[0.08] text-ink-300 hover:border-white/20 hover:text-ink-100'
              }`}
            >
              {o}
            </button>
          );
        })}
      </div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function RatingInput({ label, value, onChange }: { label: string; value?: number; onChange: (v?: number) => void }) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      <div id={id} className="label">
        {label}
      </div>
      <div role="radiogroup" aria-labelledby={id} className="flex items-center gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} von 5`}
            onClick={() => onChange(value === n ? undefined : n)}
            className="rounded p-1 text-ink-500 transition-colors hover:text-amber-200"
          >
            <Star className={`size-5 ${value !== undefined && n <= value ? 'fill-amber-300 text-amber-300' : ''}`} />
          </button>
        ))}
        {value !== undefined && (
          <button type="button" className="ml-2 text-xs text-ink-400 hover:text-ink-200" onClick={() => onChange(undefined)}>
            zurücksetzen
          </button>
        )}
      </div>
    </div>
  );
}

export function Stars({ value, size = 'sm' }: { value?: number; size?: 'sm' | 'xs' }) {
  if (!value) return null;
  const s = size === 'sm' ? 'size-3.5' : 'size-3';
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Bewertung ${value} von 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={`${s} ${n <= value ? 'fill-amber-300 text-amber-300' : 'text-ink-600'}`} />
      ))}
    </span>
  );
}
