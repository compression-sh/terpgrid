import { useMemo, useState } from 'react';
import { fmtDateLong } from '../../lib/dates';
import type { Photo } from '../../lib/db/types';
import { PhotoImg } from './PhotoImg';
import { PhotoViewer } from './PhotoViewer';

/**
 * Chronologisches Foto-Raster (neueste zuerst), optional nach Tag gruppiert.
 * Öffnet beim Antippen die Vollbildansicht.
 */
export function PhotoGrid({ photos, group = true, limit, dense }: { photos: Photo[]; group?: boolean; limit?: number; dense?: boolean }) {
  const sorted = useMemo(() => [...photos].sort((a, b) => b.takenAt.localeCompare(a.takenAt)), [photos]);
  const shown = limit ? sorted.slice(0, limit) : sorted;
  const [open, setOpen] = useState<number | null>(null);

  const groups = useMemo(() => {
    if (!group) return [{ key: 'all', label: '', items: shown }];
    const map = new Map<string, Photo[]>();
    for (const p of shown) {
      const k = p.takenAt.slice(0, 10);
      map.set(k, [...(map.get(k) ?? []), p]);
    }
    return [...map.entries()].map(([k, items]) => ({ key: k, label: fmtDateLong(k), items }));
  }, [shown, group]);

  const cols = dense ? 'grid-cols-4 sm:grid-cols-6 lg:grid-cols-8' : 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-6';
  return (
    <>
      <div className="space-y-5">
        {groups.map((g) => (
          <section key={g.key}>
            {g.label && (
              <h3 className="mb-2 flex items-baseline gap-2 text-xs font-medium text-ink-300">
                {g.label} <span className="text-ink-500">{g.items.length}</span>
              </h3>
            )}
            <ul className={`grid gap-1.5 sm:gap-2 ${cols}`}>
              {g.items.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => setOpen(sorted.indexOf(p))}
                    className="group relative block aspect-square w-full overflow-hidden rounded-lg border border-white/[0.05] bg-ink-850 focus-visible:outline-2"
                    aria-label={`Foto vom ${p.takenAt.slice(0, 10)} öffnen${p.note ? `: ${p.note}` : ''}`}
                  >
                    <PhotoImg photoId={p.id} alt="" className="h-full w-full transition-transform duration-300 group-hover:scale-[1.04]" />
                    {p.note && <span className="absolute inset-x-0 bottom-0 truncate bg-gradient-to-t from-black/80 to-transparent px-1.5 pb-1 pt-4 text-left text-[10px] text-ink-100">{p.note}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {open !== null && <PhotoViewer photos={sorted} index={open} onIndex={setOpen} onClose={() => setOpen(null)} />}
    </>
  );
}
