import { href } from '../../app/router';
import { matchTerpene, matchTerpeneGroup, terpeneLabel } from '../../lib/catalog/terpenes';

/** Terpen-Chips in Quell-Reihenfolge, Atlas-Einträge verlinkt. Keine Mengenangaben. */
export function TerpeneChips({ names, max = 4, size = 'sm', link = true }: { names: string[]; max?: number; size?: 'xs' | 'sm'; link?: boolean }) {
  if (names.length === 0) return null;
  const shown = names.slice(0, max);
  const cls = size === 'xs' ? 'px-1.5 py-0.5 text-[10px]' : 'px-2 py-0.5 text-[11px]';
  return (
    <div className="flex flex-wrap gap-1">
      {shown.map((n) => {
        const t = matchTerpene(n);
        // Sammelname ohne Isomer (z. B. „Pinen“): verlinkt auf die Gruppe, gestrichelt gekennzeichnet
        const g = t ? undefined : matchTerpeneGroup(n);
        const target = t?.id ?? g?.id;
        const body = (
          <>
            <span className="size-1.5 rounded-full" style={{ background: t?.color ?? '#5f6d68' }} />
            {terpeneLabel(n)}
          </>
        );
        return target && link ? (
          <a
            key={n}
            href={href(`discover/terpenes/${target}`)}
            title={g ? `${g.name}: ${g.note}` : undefined}
            onClick={(e) => e.stopPropagation()}
            className={`inline-flex items-center gap-1 rounded-full border bg-white/[0.03] text-ink-200 hover:border-white/20 ${g ? 'border-dashed border-white/[0.14]' : 'border-white/[0.07]'} ${cls}`}
          >
            {body}
          </a>
        ) : (
          <span key={n} className={`inline-flex items-center gap-1 rounded-full border border-white/[0.07] bg-white/[0.03] text-ink-300 ${cls}`}>
            {body}
          </span>
        );
      })}
      {names.length > max && <span className={`rounded-full text-ink-500 ${cls}`}>+{names.length - max}</span>}
    </div>
  );
}
