import type { ReactNode } from 'react';

interface CardProps {
  title?: ReactNode;
  subtitle?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
}

/**
 * Gruppierender Abschnitt. 6.0.1: Kopfzeile ohne Trennlinie und ohne farbige Symbolkachel –
 * das Symbol steht gedämpft vor dem Titel, Akzentfarbe bleibt Aktionen und Zuständen vorbehalten.
 */
export function Card({ title, subtitle, icon, actions, children, className = '', bodyClassName = '' }: CardProps) {
  const head = !!(title || actions);
  return (
    <section className={`card animate-fade-up ${className}`}>
      {head && (
        <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2 px-5 pt-4">
          <div className="flex min-w-0 flex-1 basis-48 items-start gap-2">
            {icon && <span className="mt-[3px] shrink-0 text-ink-500 [&>svg]:size-4">{icon}</span>}
            <div className="min-w-0">
              {title && <h2 className="text-[14px] font-semibold tracking-tight text-ink-50">{title}</h2>}
              {subtitle && <p className="mt-0.5 text-[12.5px] leading-snug text-ink-400">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      {/* Eigene Abstände (bodyClassName mit p-…) ersetzen die Standardabstände vollständig */}
      <div className={/(^|\s)p-/.test(bodyClassName) ? bodyClassName : `${head ? 'px-5 pt-3 pb-5' : 'p-5'} ${bodyClassName}`}>{children}</div>
    </section>
  );
}
