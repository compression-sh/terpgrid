import { AlertTriangle, BadgeCheck, CircleSlash, Database, GraduationCap, Link2Off, Sprout, Store } from 'lucide-react';
import { t } from '../../i18n';

export type EvidenceKind = 'lab' | 'science' | 'name-only' | 'breeder' | 'seedbank' | 'database' | 'conflict' | 'missing';

const META: Record<EvidenceKind, { label: string; hint: string; cls: string; icon: typeof BadgeCheck }> = {
  lab: { get label() { return t('discover.ev.lab'); }, get hint() { return t('discover.ev.labHint'); }, cls: 'border-leaf-500/30 bg-leaf-500/10 text-leaf-200', icon: BadgeCheck },
  science: { get label() { return t('discover.ev.science'); }, get hint() { return t('discover.ev.scienceHint'); }, cls: 'border-teal-400/30 bg-teal-400/10 text-teal-200', icon: GraduationCap },
  'name-only': { get label() { return t('discover.ev.nameOnly'); }, get hint() { return t('discover.ev.nameOnlyHint'); }, cls: 'border-amber-400/25 bg-amber-400/[0.07] text-amber-200/90', icon: Link2Off },
  breeder: { get label() { return t('discover.ev.breeder'); }, get hint() { return t('discover.ev.breederHint'); }, cls: 'border-sky-400/25 bg-sky-400/10 text-sky-200', icon: Sprout },
  seedbank: { get label() { return t('discover.ev.seedbank'); }, get hint() { return t('discover.ev.seedbankHint'); }, cls: 'border-sky-400/20 bg-sky-400/[0.06] text-sky-200/90', icon: Store },
  database: { get label() { return t('discover.ev.database'); }, get hint() { return t('discover.ev.databaseHint'); }, cls: 'border-violet-400/25 bg-violet-400/10 text-violet-200', icon: Database },
  conflict: { get label() { return t('discover.ev.conflict'); }, get hint() { return t('discover.ev.conflictHint'); }, cls: 'border-amber-400/30 bg-amber-400/10 text-amber-200', icon: AlertTriangle },
  missing: { get label() { return t('discover.ev.missing'); }, get hint() { return t('discover.ev.missingHint'); }, cls: 'border-white/[0.08] bg-white/[0.02] text-ink-400', icon: CircleSlash },
};

/** Einheitliche Kennzeichnung der Belegart (Symbol + Text, nicht nur Farbe). */
export function EvidenceTag({ kind, source }: { kind: EvidenceKind; source?: string }) {
  const m = META[kind];
  const Icon = m.icon;
  return (
    <span title={m.hint} className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border px-1.5 py-px text-[10.5px] font-medium ${m.cls}`}>
      <Icon className="size-3" aria-hidden />
      {m.label}
      {source && <span className="font-normal opacity-80">· {source}</span>}
    </span>
  );
}
