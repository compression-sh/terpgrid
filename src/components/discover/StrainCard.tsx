import { Bookmark, GitCompare } from 'lucide-react';
import { useCompare, useFavoriteToggle, useLinkedStrains } from '../../app/catalog';
import { href } from '../../app/router';
import type { CatalogStrain } from '../../lib/catalog/types';
import { externalKey } from '../../lib/db/repo';
import { TypeBadge, rangeText } from './Badges';
import { StrainVisual } from './StrainVisual';
import { TerpeneChips } from './TerpeneChips';

export function StrainCard({ strain, priority }: { strain: CatalogStrain; priority?: boolean }) {
  const linked = useLinkedStrains();
  const toggleFav = useFavoriteToggle();
  const compare = useCompare();
  const mine = linked.get(externalKey(strain.provider, strain.id));
  const fav = !!mine?.favorite;
  const inCompare = compare.has(strain.key);
  const thc = rangeText(strain.thc);
  const cbd = rangeText(strain.cbd);
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-2xl border border-white/[0.06] bg-ink-900/70 transition-all duration-300 hover:-translate-y-0.5 hover:border-white/[0.14] hover:shadow-[0_24px_48px_-28px_rgb(0_0_0/0.9)]">
      <a href={href(`discover/strain/${strain.id}`)} className="flex flex-1 flex-col focus-visible:outline-offset-[-2px]" aria-label={`${strain.name} – Profil öffnen`}>
        <div className="relative aspect-[4/3] overflow-hidden">
          <StrainVisual image={strain.image} name={strain.name} eager={priority} className="h-full w-full transition-transform duration-700 group-hover:scale-[1.035]" />
          <div className="pointer-events-none absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-ink-950/85 to-transparent" />
          <div className="absolute left-2.5 top-2.5">
            <TypeBadge type={strain.typeClass} label={strain.type} overlay />
          </div>
        </div>
        <div className="flex flex-1 flex-col gap-3 p-3.5">
          <div className="min-w-0">
            <h3 className="truncate text-[15px] font-semibold tracking-tight text-ink-50">{strain.name}</h3>
            <p className="truncate text-[12px] text-ink-400">{strain.breeder ?? 'Breeder: keine Angabe'}</p>
          </div>
          <dl className="grid grid-cols-2 gap-2">
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-ink-500">THC</dt>
              <dd className={`font-mono text-[13px] tabular ${thc ? 'text-ink-100' : 'text-ink-600'}`}>{thc ?? 'k. A.'}</dd>
            </div>
            <div>
              <dt className="text-[10px] uppercase tracking-wider text-ink-500">CBD</dt>
              <dd className={`font-mono text-[13px] tabular ${cbd ? 'text-ink-100' : 'text-ink-600'}`}>{cbd ?? 'k. A.'}</dd>
            </div>
          </dl>
          <div className="mt-auto min-h-[1.25rem]">
            <TerpeneChips names={strain.terpenes} max={3} size="xs" link={false} />
          </div>
        </div>
      </a>
      <div className="flex items-center justify-between border-t border-white/[0.05] px-3.5 py-2">
        <a href={strain.attribution.recordUrl ?? strain.attribution.url} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer" className="text-[10px] text-ink-500 hover:text-ink-300">
          Daten: {strain.attribution.name}
        </a>
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            onClick={() => compare.toggle(strain.key)}
            aria-pressed={inCompare}
            aria-label={inCompare ? `${strain.name} aus Vergleich entfernen` : `${strain.name} vergleichen`}
            title="Zum Vergleich"
            className={`grid size-8 place-items-center rounded-lg transition-colors ${inCompare ? 'bg-sky-400/10 text-sky-300' : 'text-ink-500 hover:bg-white/[0.05] hover:text-ink-200'}`}
          >
            <GitCompare className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => toggleFav(strain)}
            aria-pressed={fav}
            aria-label={fav ? `${strain.name} aus Favoriten entfernen` : `${strain.name} als Favorit merken`}
            title={fav ? 'Favorit' : 'Merken'}
            className={`grid size-8 place-items-center rounded-lg transition-colors ${fav ? 'bg-leaf-500/10 text-leaf-300' : 'text-ink-500 hover:bg-white/[0.05] hover:text-ink-200'}`}
          >
            <Bookmark className={`size-4 ${fav ? 'fill-current' : ''}`} />
          </button>
        </div>
      </div>
    </article>
  );
}

export function StrainCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-2xl border border-white/[0.05] bg-ink-900/60" aria-hidden>
      <div className="aspect-[4/3] animate-pulse bg-gradient-to-br from-ink-800 to-ink-900" />
      <div className="space-y-3 p-3.5">
        <div className="h-4 w-2/3 animate-pulse rounded bg-ink-800" />
        <div className="h-3 w-1/2 animate-pulse rounded bg-ink-800/70" />
        <div className="grid grid-cols-2 gap-2">
          <div className="h-8 animate-pulse rounded bg-ink-800/60" />
          <div className="h-8 animate-pulse rounded bg-ink-800/60" />
        </div>
      </div>
      <div className="h-10 border-t border-white/[0.04]" />
    </div>
  );
}
