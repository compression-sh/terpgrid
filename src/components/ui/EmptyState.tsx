import type { ReactNode } from 'react';

export function EmptyState({ icon, title, text, action, compact }: { icon?: ReactNode; title: string; text?: ReactNode; action?: ReactNode; compact?: boolean }) {
  return (
    <div className={`flex flex-col items-center text-center ${compact ? 'py-6' : 'py-12'}`}>
      {icon && <div className="grid size-11 place-items-center rounded-xl border border-white/[0.06] bg-white/[0.02] text-ink-400 [&>svg]:size-5">{icon}</div>}
      <p className="mt-3 text-sm font-medium text-ink-200">{title}</p>
      {text && <p className="hint mt-1 max-w-sm">{text}</p>}
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}
