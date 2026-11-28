import { ChevronLeft, ChevronRight, Database, Dna, Loader2, X, ZoomIn, ZoomOut } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useFullCatalog, useStrainSearch } from '../../app/catalog';
import { href } from '../../app/router';
import { TYPE_META, TypeBadge, rangeText } from '../../components/discover/Badges';
import { DiscoverNav } from '../../components/discover/DiscoverNav';
import { StrainVisual } from '../../components/discover/StrainVisual';
import { TerpeneChips } from '../../components/discover/TerpeneChips';
import { EmptyState } from '../../components/ui/EmptyState';
import { namesIn, normalizeName, parseGenetics } from '../../lib/catalog/genetics';
import { TERPENES, matchTerpene } from '../../lib/catalog/terpenes';
import type { CatalogStrain, TypeClass } from '../../lib/catalog/types';
import { t } from '../../i18n';

type View = { kind: 'all' } | { kind: 'terpene'; id: string } | { kind: 'type'; id: TypeClass } | { kind: 'breeder'; name: string } | { kind: 'relatives'; key: string };

/** Verwandte über dokumentierte Genetik: Eltern und Nachkommen innerhalb des geladenen Katalogs. */
export function relativesOf(s: CatalogStrain, all: CatalogStrain[]): { parents: CatalogStrain[]; children: CatalogStrain[] } {
  const parentNames = new Set((parseGenetics(s.genetics)?.parents ?? []).flatMap(namesIn).map(normalizeName));
  const byName = new Map<string, CatalogStrain[]>();
  for (const x of all) byName.set(normalizeName(x.name), [...(byName.get(normalizeName(x.name)) ?? []), x]);
  // Eltern nur bei eindeutigem Namen
  const parents = [...parentNames].map((n) => byName.get(n)).filter((l): l is CatalogStrain[] => !!l && l.length === 1).map((l) => l[0]!);
  const me = normalizeName(s.name);
  const children = all.filter((x) => x.key !== s.key && (parseGenetics(x.genetics)?.parents ?? []).flatMap(namesIn).some((n) => normalizeName(n) === me));
  return { parents, children };
}

function Lightbox({ items, index, onIndex, onClose, all, onView }: { items: CatalogStrain[]; index: number; onIndex: (i: number) => void; onClose: () => void; all: CatalogStrain[]; onView: (v: View) => void }) {
  const s = items[index]!;
  const ref = useRef<HTMLDialogElement>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number } | null>(null);
  const touchX = useRef<number | null>(null);
  const rel = useMemo(() => relativesOf(s, all), [s, all]);

  useEffect(() => {
    if (ref.current && !ref.current.open) ref.current.showModal();
  }, []);
  useEffect(() => {
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [index]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' && index < items.length - 1) onIndex(index + 1);
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
      if (e.key === '+') setZoom((z) => Math.min(4, z * 1.4));
      if (e.key === '-') setZoom((z) => Math.max(1, z / 1.4));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, items.length, onIndex]);

  return (
    <dialog ref={ref} aria-label={t('discover.ve.galleryOf', { name: s.name })} onCancel={(e) => (e.preventDefault(), onClose())} className="m-0 h-dvh max-h-none w-screen max-w-none bg-black p-0 text-ink-100 backdrop:bg-black">
      <div className="flex h-full flex-col lg:flex-row">
        <div
          className="relative min-h-0 flex-1 touch-none overflow-hidden"
          onWheel={(e) => setZoom((z) => Math.min(4, Math.max(1, z * (e.deltaY < 0 ? 1.15 : 1 / 1.15))))}
          onDoubleClick={() => (zoom > 1 ? (setZoom(1), setPan({ x: 0, y: 0 })) : setZoom(2.2))}
          onPointerDown={(e) => {
            if (zoom > 1) drag.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
            else touchX.current = e.clientX;
          }}
          onPointerMove={(e) => drag.current && setPan({ x: e.clientX - drag.current.x, y: e.clientY - drag.current.y })}
          onPointerUp={(e) => {
            drag.current = null;
            if (touchX.current !== null && zoom === 1) {
              const dx = e.clientX - touchX.current;
              if (dx < -60 && index < items.length - 1) onIndex(index + 1);
              if (dx > 60 && index > 0) onIndex(index - 1);
            }
            touchX.current = null;
          }}
        >
          <div className="absolute inset-0 transition-transform duration-150" style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, cursor: zoom > 1 ? 'grab' : 'zoom-in' }}>
            <StrainVisual key={s.key} image={s.image} name={s.name} eager fit="contain" className="h-full w-full bg-black" />
          </div>
          <button type="button" onClick={onClose} aria-label={t('discover.ve.close')} className="absolute right-3 top-3 grid size-10 place-items-center rounded-full bg-black/60 backdrop-blur hover:bg-black/80">
            <X className="size-5" />
          </button>
          <div className="absolute left-3 top-3 flex gap-1">
            <button type="button" aria-label={t('discover.ve.zoomIn')} className="grid size-9 place-items-center rounded-full bg-black/60 backdrop-blur hover:bg-black/80" onClick={() => setZoom((z) => Math.min(4, z * 1.4))}>
              <ZoomIn className="size-4" />
            </button>
            <button type="button" aria-label={t('discover.ve.zoomOut')} className="grid size-9 place-items-center rounded-full bg-black/60 backdrop-blur hover:bg-black/80" onClick={() => (setZoom((z) => Math.max(1, z / 1.4)), zoom <= 1.4 && setPan({ x: 0, y: 0 }))}>
              <ZoomOut className="size-4" />
            </button>
          </div>
          {index > 0 && (
            <button type="button" onClick={() => onIndex(index - 1)} aria-label={t('discover.ve.prev')} className="absolute left-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/60 backdrop-blur hover:bg-black/80">
              <ChevronLeft className="size-5" />
            </button>
          )}
          {index < items.length - 1 && (
            <button type="button" onClick={() => onIndex(index + 1)} aria-label={t('discover.ve.next')} className="absolute right-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/60 backdrop-blur hover:bg-black/80">
              <ChevronRight className="size-5" />
            </button>
          )}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 font-mono text-xs text-ink-200 backdrop-blur">
            {index + 1} / {items.length}
          </div>
        </div>
        <aside className="max-h-[42dvh] shrink-0 space-y-4 overflow-y-auto border-t border-white/[0.08] bg-ink-950 p-5 lg:max-h-none lg:w-[22rem] lg:border-l lg:border-t-0">
          <div>
            <TypeBadge type={s.typeClass} label={s.type} />
            <h2 className="mt-2 text-xl font-semibold text-ink-50">{s.name}</h2>
            <p className="text-[13px] text-ink-400">{s.breeder ?? t('discover.ve.noBreeder')}</p>
          </div>
          <dl className="grid grid-cols-2 gap-2 text-[12px]">
            <div>
              <dt className="text-ink-500">THC</dt>
              <dd className="font-mono text-ink-100">{rangeText(s.thc) ?? t('discover.ve.na')}</dd>
            </div>
            <div>
              <dt className="text-ink-500">CBD</dt>
              <dd className="font-mono text-ink-100">{rangeText(s.cbd) ?? t('discover.ve.na')}</dd>
            </div>
          </dl>
          {s.genetics && <p className="text-[12px] text-ink-300">{t('discover.ve.genetics')} {s.genetics}</p>}
          <TerpeneChips names={s.terpenes} max={6} />
          {(rel.parents.length > 0 || rel.children.length > 0) && (
            <div>
              <div className="mb-1.5 text-[11px] uppercase tracking-wider text-ink-500">{t('discover.ve.connections')}</div>
              <div className="flex flex-wrap gap-1.5">
                {[...rel.parents.map((p) => ({ p, label: t('discover.ve.parent') })), ...rel.children.slice(0, 8).map((p) => ({ p, label: t('discover.ve.child') }))].map(({ p, label }) => {
                  const i = items.findIndex((x) => x.key === p.key);
                  return (
                    <button
                      key={p.key + label}
                      type="button"
                      onClick={() => (i >= 0 ? onIndex(i) : onView({ kind: 'relatives', key: s.key }))}
                      className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[11px] text-ink-200 hover:border-leaf-500/30"
                      title={label}
                    >
                      {p.name} <span className="text-ink-500">· {label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <a href={href(`discover/strain/${s.id}`)} className="btn-primary py-1.5 text-xs">
              {t('discover.ve.profile')}
            </a>
            <a href={href(`discover/genetics/${s.id}`)} className="btn-ghost py-1.5 text-xs">
              <Dna className="size-3.5" /> {t('discover.ve.geneticsBtn')}
            </a>
            <button type="button" className="btn-ghost py-1.5 text-xs" onClick={() => onView({ kind: 'relatives', key: s.key })}>
              {t('discover.ve.related')}
            </button>
          </div>
          <p className="text-[10px] leading-relaxed text-ink-600">{t('discover.ve.credit')}</p>
        </aside>
      </div>
    </dialog>
  );
}

export function VisualExplorer() {
  const first = useStrainSearch('', 0);
  const full = useFullCatalog();
  const [view, setView] = useState<View>({ kind: 'all' });
  const [open, setOpen] = useState<number | null>(null);
  const all = full.loaded ? full.items : first.items;

  const items = useMemo(() => {
    const withImages = all.filter((s) => s.image);
    switch (view.kind) {
      case 'terpene':
        return withImages.filter((s) => s.terpenes.some((tv) => matchTerpene(tv)?.id === view.id));
      case 'type':
        return withImages.filter((s) => s.typeClass === view.id);
      case 'breeder':
        return withImages.filter((s) => s.breeder === view.name);
      case 'relatives': {
        const s = all.find((x) => x.key === view.key);
        if (!s) return [];
        const r = relativesOf(s, all);
        return [s, ...r.parents, ...r.children].filter((x) => x.image);
      }
      default:
        return withImages;
    }
  }, [all, view]);

  const topBreeders = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of all) if (s.breeder) m.set(s.breeder, (m.get(s.breeder) ?? 0) + 1);
    return [...m.entries()].filter(([, n]) => n >= 3).sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [all]);

  const viewLabel =
    view.kind === 'terpene'
      ? t('discover.ve.withTerp', { name: TERPENES.find((tv) => tv.id === view.id)?.name ?? '' })
      : view.kind === 'type'
        ? t('discover.ve.typeOf', { type: TYPE_META[view.id].label })
        : view.kind === 'breeder'
          ? t('discover.ve.breederOf', { name: view.name })
          : view.kind === 'relatives'
            ? t('discover.ve.relativesOf', { name: all.find((x) => x.key === view.key)?.name ?? '…' })
            : t('discover.ve.allImg');

  return (
    <div>
      <DiscoverNav />
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between animate-fade-up">
        <div>
          <h1 className="page-title">{t('discover.ve.title')}</h1>
          <p className="mt-2 max-w-xl text-sm text-ink-400">{t('discover.ve.subtitle')}</p>
        </div>
        {!full.loaded && (
          <button type="button" className="btn-ghost shrink-0" onClick={full.load} disabled={full.loading}>
            {full.loading ? <Loader2 className="size-4 animate-spin" /> : <Database className="size-4" />}
            {full.progress ? `${full.progress.loaded}/${full.progress.total}` : t('discover.ve.loadAll')}
          </button>
        )}
      </div>

      <div className="mb-5 space-y-2.5">
        <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
          <button type="button" aria-pressed={view.kind === 'all'} onClick={() => setView({ kind: 'all' })} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${view.kind === 'all' ? 'border-white/25 bg-white/[0.06] text-ink-50' : 'border-white/[0.06] text-ink-400'}`}>
            {t('discover.ve.all')}
          </button>
          {(['indica', 'sativa', 'hybrid'] as TypeClass[]).map((tv) => (
            <button key={tv} type="button" aria-pressed={view.kind === 'type' && view.id === tv} onClick={() => setView({ kind: 'type', id: tv })} className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs ${view.kind === 'type' && view.id === tv ? 'border-white/25 bg-white/[0.06] text-ink-50' : 'border-white/[0.06] text-ink-400'}`}>
              <span className="size-1.5 rounded-full" style={{ background: TYPE_META[tv].color }} />
              {TYPE_META[tv].label}
            </button>
          ))}
          {TERPENES.map((tv) => (
            <button key={tv.id} type="button" aria-pressed={view.kind === 'terpene' && view.id === tv.id} onClick={() => setView({ kind: 'terpene', id: tv.id })} className={`shrink-0 rounded-full border px-3 py-1.5 text-xs ${view.kind === 'terpene' && view.id === tv.id ? 'text-ink-50' : 'border-white/[0.06] text-ink-400'}`} style={view.kind === 'terpene' && view.id === tv.id ? { borderColor: tv.color, background: `${tv.color}22` } : undefined}>
              {tv.name}
            </button>
          ))}
        </div>
        {topBreeders.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
            <span className="shrink-0 self-center text-[11px] text-ink-500">{t('discover.ve.breeder')}</span>
            {topBreeders.map(([b, n]) => (
              <button key={b} type="button" aria-pressed={view.kind === 'breeder' && view.name === b} onClick={() => setView({ kind: 'breeder', name: b })} className={`shrink-0 rounded-full border px-2.5 py-1 text-[11px] ${view.kind === 'breeder' && view.name === b ? 'border-white/25 bg-white/[0.06] text-ink-50' : 'border-white/[0.06] text-ink-400'}`}>
                {b} <span className="text-ink-600">{n}</span>
              </button>
            ))}
          </div>
        )}
        <p className="text-[12px] text-ink-500">
          {viewLabel} · <span className="font-mono text-ink-300">{items.length}</span> Bilder
          {!full.loaded && ` ${t('discover.ve.partial', { n: all.length })}`}
        </p>
      </div>

      {first.loading && all.length === 0 ? (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-xl bg-ink-800" />
          ))}
        </div>
      ) : first.error && all.length === 0 ? (
        <div className="card">
          <EmptyState title={t('discover.ve.unavailable')} text={first.error} action={<button type="button" className="btn-primary" onClick={first.retry}>{t('discover.ve.retry')}</button>} />
        </div>
      ) : items.length === 0 ? (
        <div className="card">
          <EmptyState title={t('discover.ve.noImages')} text={!full.loaded ? t('discover.ve.noImagesText') : undefined} />
        </div>
      ) : (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {items.map((s, i) => (
            <li key={s.key} className={i % 7 === 0 ? 'sm:col-span-2 sm:row-span-2' : ''}>
              <button type="button" onClick={() => setOpen(i)} className="group relative block aspect-square w-full overflow-hidden rounded-xl border border-white/[0.05] focus-visible:outline-2" aria-label={t('discover.ve.enlarge', { name: s.name })}>
                <StrainVisual image={s.image} name={s.name} className="h-full w-full transition-transform duration-700 group-hover:scale-[1.05]" />
                <span className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent px-3 pb-2.5 pt-8 text-left opacity-90 transition-opacity group-hover:opacity-100">
                  <span className="block truncate text-[13px] font-medium text-white">{s.name}</span>
                  <span className="block truncate text-[10px] text-ink-300">{s.breeder ?? ''}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-6 text-center text-[11px] text-ink-600">{t('discover.ve.footer')}</p>
      {open !== null && items[open] && <Lightbox items={items} index={open} onIndex={setOpen} onClose={() => setOpen(null)} all={all} onView={(v) => (setOpen(null), setView(v))} />}
    </div>
  );
}
