import { ChevronRight } from 'lucide-react';
import type { ReactNode } from 'react';
import { href } from '../../app/router';

export interface Crumb {
  label: string;
  to?: string;
}

export function PageHeader({ title, subtitle, actions, crumbs, meta }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; crumbs?: Crumb[]; meta?: ReactNode }) {
  return (
    <div className="mb-6 animate-fade-up">
      {crumbs && crumbs.length > 0 && (
        <nav aria-label="Brotkrumen" className="mb-2 flex min-w-0 items-center gap-1 text-xs text-ink-400">
          {crumbs.map((c, i) => (
            <span key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-1">
              {i > 0 && <ChevronRight className="size-3 shrink-0 text-ink-600" />}
              {c.to ? (
                <a href={href(c.to)} className="truncate hover:text-ink-100">
                  {c.label}
                </a>
              ) : (
                <span className="truncate text-ink-300">{c.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h1 className="truncate text-2xl font-semibold tracking-tight text-ink-50 sm:text-[28px]">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-ink-400">{subtitle}</p>}
          {meta && <div className="mt-2.5 flex flex-wrap items-center gap-2">{meta}</div>}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </div>
  );
}
