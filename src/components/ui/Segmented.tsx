import { useId } from 'react';

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

interface SegmentedProps<T extends string> {
  label?: string;
  value: T;
  options: SegmentOption<T>[];
  onChange: (value: T) => void;
  size?: 'sm' | 'md';
}

export function Segmented<T extends string>({ label, value, options, onChange, size = 'md' }: SegmentedProps<T>) {
  const id = useId();
  return (
    <div className="space-y-1.5">
      {label && (
        <div id={id} className="label">
          {label}
        </div>
      )}
      <div
        role="radiogroup"
        aria-labelledby={label ? id : undefined}
        className="flex w-full gap-1 overflow-x-auto rounded-xl border border-white/[0.06] bg-ink-850 p-1 [scrollbar-width:none]"
      >
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={o.value}
              type="button"
              role="radio"
              aria-checked={active}
              title={o.hint}
              onClick={() => onChange(o.value)}
              className={`flex-1 shrink-0 whitespace-nowrap rounded-lg px-2.5 font-medium transition-all ${
                size === 'sm' ? 'py-1 text-xs' : 'py-1.5 text-[13px]'
              } ${
                active
                  ? 'bg-ink-700 text-ink-50 shadow-[0_1px_0_0_rgb(255_255_255/0.06)_inset,0_4px_12px_-4px_rgb(0_0_0/0.6)]'
                  : 'text-ink-400 hover:text-ink-200'
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
