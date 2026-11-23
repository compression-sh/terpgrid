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

export function Card({ title, subtitle, icon, actions, children, className = '', bodyClassName = '' }: CardProps) {
  return (
    <section className={`card animate-fade-up ${className}`}>
      {(title || actions) && (
        <header className="flex items-start justify-between gap-3 border-b border-white/[0.05] px-5 py-4">
          <div className="flex min-w-0 items-start gap-3">
            {icon && (
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg border border-leaf-500/20 bg-leaf-500/10 text-leaf-400">
                {icon}
              </span>
            )}
            <div className="min-w-0">
              {title && <h2 className="text-[15px] font-semibold tracking-tight text-ink-50">{title}</h2>}
              {subtitle && <p className="mt-0.5 text-[13px] leading-snug text-ink-400">{subtitle}</p>}
            </div>
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className={`p-5 ${bodyClassName}`}>{children}</div>
    </section>
  );
}
