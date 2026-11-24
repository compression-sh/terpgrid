import { AlertTriangle, Check, Minus } from 'lucide-react';
import type { CatalogFacts } from '../../lib/catalog/types';

const ITEMS: { key: keyof Omit<CatalogFacts, 'sources' | 'conflicts' | 'lineage'> | 'lineage'; label: string }[] = [
  { key: 'lineage', label: 'Abstammung' },
  { key: 'thc', label: 'THC' },
  { key: 'cbd', label: 'CBD' },
  { key: 'flowering', label: 'Blütezeit' },
  { key: 'terpenes', label: 'Terpene' },
  { key: 'image', label: 'Foto' },
];

const CONFLICT_FIELD: Record<string, string> = { thc: 'thc', cbd: 'cbd', flowering: 'flowering', parents: 'lineage' };

/**
 * Welche Angaben liegen vor? Unterscheidet „vorhanden“, „fehlt“ und „widersprüchlich“ –
 * mit Symbol UND Text (nicht nur Farbe). Kein Punktwert, keine wissenschaftliche Konfidenz.
 */
export function CatalogFactsRow({ facts, compact }: { facts: CatalogFacts; compact?: boolean }) {
  const conflicted = new Set(facts.conflicts.map((c) => CONFLICT_FIELD[c]).filter(Boolean));
  return (
    <ul className={`flex flex-wrap gap-x-2.5 gap-y-1 ${compact ? 'text-[10.5px]' : 'text-[12px]'}`} aria-label="Vorhandene Angaben">
      {ITEMS.map((i) => {
        const has = i.key === 'lineage' ? facts.lineage !== 'none' : facts[i.key];
        const conflict = conflicted.has(i.key);
        const Icon = conflict ? AlertTriangle : has ? Check : Minus;
        const state = conflict ? 'widersprüchlich' : has ? (i.key === 'lineage' && facts.lineage === 'partial-unknown' ? 'teilweise unbekannt' : 'vorhanden') : 'fehlt';
        return (
          <li key={i.key} className={`inline-flex items-center gap-1 ${conflict ? 'text-amber-300' : has ? 'text-ink-200' : 'text-ink-500'}`} title={`${i.label}: ${state}`}>
            <Icon className="size-3" aria-hidden />
            <span>
              {i.label}
              <span className="sr-only">: {state}</span>
            </span>
          </li>
        );
      })}
      <li className="text-ink-400">{facts.sources} {facts.sources === 1 ? 'Quelle' : 'Quellen'}</li>
    </ul>
  );
}
