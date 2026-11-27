import { BadgeCheck, CircleHelp, CircleSlash, MessageSquareQuote, TriangleAlert } from 'lucide-react';
import type { EvidenceState, TypeClass, ValueRange } from '../../lib/catalog/types';
import { fmt } from '../../lib/format';
import { t } from '../../i18n';

export const TYPE_META: Record<TypeClass, { label: string; color: string }> = {
  indica: { get label() { return t('discover.type.indica'); }, color: '#a78bfa' },
  sativa: { get label() { return t('discover.type.sativa'); }, color: '#fbbf24' },
  hybrid: { get label() { return t('discover.type.hybrid'); }, color: '#5fe39a' },
  unknown: { get label() { return t('discover.type.unknown'); }, color: '#5f6d68' },
};

export function TypeBadge({ type, label, overlay }: { type: TypeClass; label?: string; overlay?: boolean }) {
  const m = TYPE_META[type];
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${overlay ? 'border-white/10 bg-black/55 text-ink-100 backdrop-blur' : 'border-white/[0.08] bg-white/[0.03] text-ink-200'}`}
      title={label && label !== m.label ? t('discover.perSource', { label }) : undefined}
    >
      <span className="size-1.5 rounded-full" style={{ background: m.color }} />
      {label && type !== 'unknown' ? label : m.label}
    </span>
  );
}

export const EVIDENCE_META: Record<EvidenceState, { label: string; hint: string; cls: string; icon: typeof BadgeCheck }> = {
  supported: { get label() { return t('discover.evidence.supported'); }, get hint() { return t('discover.evidence.supportedHint'); }, cls: 'border-leaf-500/25 bg-leaf-500/10 text-leaf-300', icon: BadgeCheck },
  reported: { get label() { return t('discover.evidence.reported'); }, get hint() { return t('discover.evidence.reportedHint'); }, cls: 'border-sky-400/20 bg-sky-400/10 text-sky-300', icon: MessageSquareQuote },
  disputed: { get label() { return t('discover.evidence.disputed'); }, get hint() { return t('discover.evidence.disputedHint'); }, cls: 'border-amber-400/25 bg-amber-400/10 text-amber-300', icon: TriangleAlert },
  insufficient_data: { get label() { return t('discover.evidence.insufficient'); }, get hint() { return t('discover.evidence.insufficientHint'); }, cls: 'border-white/[0.08] bg-white/[0.03] text-ink-400', icon: CircleHelp },
};

export function EvidenceBadge({ state }: { state?: EvidenceState }) {
  if (!state) return null;
  const m = EVIDENCE_META[state];
  const Icon = m.icon;
  return (
    <span title={m.hint} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-px text-[10px] font-medium ${m.cls}`}>
      <Icon className="size-3" /> {m.label}
    </span>
  );
}

export function NoData({ text = t('discover.noData') }: { text?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-500">
      <CircleSlash className="size-3.5" /> {text}
    </span>
  );
}

export function rangeText(r?: ValueRange): string | undefined {
  if (!r) return undefined;
  if (r.min !== undefined && r.max !== undefined) return r.min === r.max ? `${fmt(r.min)} %` : `${fmt(r.min)}–${fmt(r.max)} %`;
  if (r.value !== undefined) return `${fmt(r.value)} %`;
  if (r.max !== undefined) return t('discover.upTo', { v: fmt(r.max) });
  if (r.min !== undefined) return t('discover.from', { v: fmt(r.min) });
  return undefined;
}

/** Horizontale Spanne auf fester Skala (0–max %). */
export function RangeMeter({ range, max = 35, color = '#5fe39a', label }: { range?: ValueRange; max?: number; color?: string; label: string }) {
  if (!range) return null;
  const lo = range.min ?? range.value ?? range.max ?? 0;
  const hi = range.max ?? range.value ?? range.min ?? 0;
  const pos = (v: number) => Math.min(100, Math.max(0, (v / max) * 100));
  return (
    <div aria-label={`${label}: ${rangeText(range)}`} role="img">
      <div className="relative h-1.5 rounded-full bg-ink-700">
        <div className="absolute inset-y-0 rounded-full" style={{ left: `${pos(lo)}%`, width: `${Math.max(1.5, pos(hi) - pos(lo))}%`, background: color }} />
      </div>
      <div className="mt-1 flex justify-between font-mono text-[9px] text-ink-600">
        <span>0</span>
        <span>{max} %</span>
      </div>
    </div>
  );
}
