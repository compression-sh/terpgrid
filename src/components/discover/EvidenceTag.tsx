import { AlertTriangle, BadgeCheck, CircleSlash, Database, Sprout, Store } from 'lucide-react';

export type EvidenceKind = 'lab' | 'breeder' | 'seedbank' | 'database' | 'conflict' | 'missing';

const META: Record<EvidenceKind, { label: string; hint: string; cls: string; icon: typeof BadgeCheck }> = {
  lab: { label: 'Laborbestätigt', hint: 'Messwert einer konkreten Probe (Labor, Datum) – gilt für diese Probe, nicht für jede Charge', cls: 'border-leaf-500/30 bg-leaf-500/10 text-leaf-200', icon: BadgeCheck },
  breeder: { label: 'Breeder-Angabe', hint: 'Angabe des Breeders selbst (Shop des Breeders) – nicht unabhängig geprüft', cls: 'border-sky-400/25 bg-sky-400/10 text-sky-200', icon: Sprout },
  seedbank: { label: 'Seedbank-Angabe', hint: 'Angabe eines Händlers (Shop-Text) – nicht unabhängig geprüft', cls: 'border-sky-400/20 bg-sky-400/[0.06] text-sky-200/90', icon: Store },
  database: { label: 'Datenbank-Angabe', hint: 'Angabe einer Sortendatenbank – nicht laborbestätigt', cls: 'border-violet-400/25 bg-violet-400/10 text-violet-200', icon: Database },
  conflict: { label: 'Widersprüchlich', hint: 'Quellen widersprechen sich', cls: 'border-amber-400/30 bg-amber-400/10 text-amber-200', icon: AlertTriangle },
  missing: { label: 'Keine Daten', hint: 'Keine Quelle liefert diese Angabe', cls: 'border-white/[0.08] bg-white/[0.02] text-ink-400', icon: CircleSlash },
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
