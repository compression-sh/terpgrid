import type { ReactNode } from 'react';
import type { GrowPhase } from '../../lib/db/types';
import { PHASE_COLOR, PHASE_LABEL, PHASE_SHORT } from '../../lib/grow/phases';

export function Chip({ children, tone = 'neutral', title }: { children: ReactNode; tone?: 'neutral' | 'green' | 'amber' | 'rose' | 'sky'; title?: string }) {
  const cls = {
    neutral: 'border-white/[0.08] bg-white/[0.03] text-ink-300',
    green: 'border-leaf-500/25 bg-leaf-500/10 text-leaf-300',
    amber: 'border-amber-400/25 bg-amber-400/10 text-amber-300',
    rose: 'border-rose-400/25 bg-rose-500/10 text-rose-300',
    sky: 'border-sky-400/25 bg-sky-400/10 text-sky-300',
  }[tone];
  return (
    <span title={title} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${cls}`}>
      {children}
    </span>
  );
}

export function PhaseChip({ phase, short }: { phase?: GrowPhase; short?: boolean }) {
  if (!phase) return <Chip>Keine Phase erfasst</Chip>;
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/[0.08] bg-white/[0.03] px-2 py-0.5 text-[11px] font-medium text-ink-200">
      <span className="size-1.5 rounded-full" style={{ background: PHASE_COLOR[phase] }} />
      {short ? PHASE_SHORT[phase] : PHASE_LABEL[phase]}
    </span>
  );
}
