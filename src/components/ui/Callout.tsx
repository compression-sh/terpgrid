import { AlertTriangle, Info, ShieldAlert, CheckCircle2 } from 'lucide-react';
import type { ReactNode } from 'react';

export type Tone = 'info' | 'warn' | 'danger' | 'ok';

const styles: Record<Tone, string> = {
  info: 'border-sky-400/15 bg-sky-400/[0.06] text-sky-100',
  warn: 'border-amber-400/20 bg-amber-400/[0.07] text-amber-100',
  danger: 'border-rose-400/25 bg-rose-500/[0.08] text-rose-100',
  ok: 'border-leaf-500/20 bg-leaf-500/[0.07] text-leaf-100',
};
const iconColor: Record<Tone, string> = {
  info: 'text-sky-300',
  warn: 'text-amber-300',
  danger: 'text-rose-300',
  ok: 'text-leaf-400',
};

export function Callout({ tone = 'info', title, children }: { tone?: Tone; title?: ReactNode; children?: ReactNode }) {
  const Icon = tone === 'danger' ? ShieldAlert : tone === 'warn' ? AlertTriangle : tone === 'ok' ? CheckCircle2 : Info;
  return (
    <div className={`flex gap-3 rounded-xl border px-3.5 py-3 text-[13px] leading-relaxed ${styles[tone]}`} role={tone === 'danger' ? 'alert' : undefined}>
      <Icon className={`mt-0.5 size-4 shrink-0 ${iconColor[tone]}`} aria-hidden />
      <div className="min-w-0 space-y-1">
        {title && <div className="font-semibold">{title}</div>}
        {children && <div className="text-current/85 opacity-90">{children}</div>}
      </div>
    </div>
  );
}
