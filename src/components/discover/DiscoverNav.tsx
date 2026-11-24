import { BookOpen, Compass, Dna, Droplets, GalleryHorizontalEnd, GitCompare, Images, Users } from 'lucide-react';
import { useLibraryStatus } from '../../app/library';
import { useCompare } from '../../app/catalog';
import { href, useRoute } from '../../app/router';

const ITEMS = [
  { id: '', label: 'Entdecken', icon: Compass },
  { id: 'breeders', label: 'Breeder', icon: Users, library: true },
  { id: 'live', label: 'Live & Bilder', icon: Images, library: true },
  { id: 'genetics', label: 'Genetik', icon: Dna },
  { id: 'terpenes', label: 'Terpen-Atlas', icon: Droplets },
  { id: 'compare', label: 'Vergleich', icon: GitCompare },
  { id: 'gallery', label: 'Galerie', icon: GalleryHorizontalEnd },
  { id: 'learn', label: 'Cannabis 101', icon: BookOpen },
];

/** Unternavigation des Discover-Bereichs (statt zusätzlicher Top-Level-Tabs). */
export function DiscoverNav() {
  const { path } = useRoute();
  const compare = useCompare();
  const lib = useLibraryStatus();
  const current = path[1] === 'cultivar' ? '' : path[1] === 'strain' ? (lib ? 'live' : '') : (path[1] ?? '');
  return (
    <nav aria-label="Discover" className="no-print sticky top-[3.6rem] z-20 -mx-4 mb-6 border-b border-white/[0.05] bg-ink-950/85 px-4 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-10 lg:px-10">
      <div className="-mb-px flex gap-1 overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {ITEMS.filter((i) => !('library' in i) || lib).map((i) => {
          const active = current === i.id;
          const Icon = i.icon;
          return (
            <a
              key={i.id || 'home'}
              href={href(`discover${i.id ? `/${i.id}` : ''}`)}
              aria-current={active ? 'page' : undefined}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${active ? 'bg-white/[0.06] text-ink-50' : 'text-ink-400 hover:bg-white/[0.03] hover:text-ink-200'}`}
            >
              <Icon className={`size-4 ${active ? 'text-leaf-400' : ''}`} />
              {i.label}
              {i.id === 'compare' && compare.keys.length > 0 && <span className="rounded-full bg-sky-400/15 px-1.5 text-[10px] tabular text-sky-300">{compare.keys.length}</span>}
            </a>
          );
        })}
      </div>
    </nav>
  );
}
