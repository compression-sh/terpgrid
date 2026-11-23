import { MoveHorizontal } from 'lucide-react';
import { useRef, useState } from 'react';
import { fmtDateTime } from '../../lib/dates';
import type { Photo } from '../../lib/db/types';
import { PhotoImg } from './PhotoImg';

/**
 * Vorher/Nachher-Vergleich mit Schieberegler (Maus, Touch und Tastatur).
 * Beide Bilder werden im gleichen Rahmen "contain" dargestellt.
 */
export function CompareSlider({ before, after }: { before: Photo; after: Photo }) {
  const [pos, setPos] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const fromClient = (x: number) => {
    const r = box.current?.getBoundingClientRect();
    if (!r) return;
    setPos(Math.min(100, Math.max(0, ((x - r.left) / r.width) * 100)));
  };

  return (
    <div className="space-y-3">
      <div
        ref={box}
        className="relative aspect-[4/3] w-full touch-none select-none overflow-hidden rounded-xl border border-white/[0.06] bg-black"
        onPointerDown={(e) => {
          dragging.current = true;
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          fromClient(e.clientX);
        }}
        onPointerMove={(e) => dragging.current && fromClient(e.clientX)}
        onPointerUp={() => (dragging.current = false)}
        onPointerCancel={() => (dragging.current = false)}
      >
        <PhotoImg photoId={after.id} variant="full" alt="Nachher" fit="contain" className="absolute inset-0 h-full w-full" />
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          <PhotoImg photoId={before.id} variant="full" alt="Vorher" fit="contain" className="absolute inset-0 h-full w-full bg-black" />
        </div>
        <div className="pointer-events-none absolute inset-y-0 w-px bg-white/80 shadow-[0_0_0_1px_rgb(0_0_0/0.4)]" style={{ left: `${pos}%` }}>
          <div className="absolute top-1/2 left-1/2 grid size-9 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full border border-white/40 bg-black/70 text-white backdrop-blur">
            <MoveHorizontal className="size-4" />
          </div>
        </div>
        <span className="absolute left-2 top-2 rounded-md bg-black/65 px-2 py-0.5 text-[11px] text-ink-100 backdrop-blur">Vorher · {fmtDateTime(before.takenAt)}</span>
        <span className="absolute right-2 top-2 rounded-md bg-black/65 px-2 py-0.5 text-[11px] text-ink-100 backdrop-blur">Nachher · {fmtDateTime(after.takenAt)}</span>
      </div>
      <input
        type="range"
        className="slider"
        min={0}
        max={100}
        step={1}
        value={pos}
        aria-label="Vergleichsposition"
        style={{ ['--fill' as string]: `${pos}%` }}
        onChange={(e) => setPos(Number(e.target.value))}
      />
    </div>
  );
}

export function SideBySide({ before, after }: { before: Photo; after: Photo }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {[before, after].map((p, i) => (
        <figure key={p.id} className="overflow-hidden rounded-xl border border-white/[0.06] bg-black">
          <PhotoImg photoId={p.id} variant="full" alt={i === 0 ? 'Vorher' : 'Nachher'} fit="contain" className="aspect-[4/3] w-full" />
          <figcaption className="border-t border-white/[0.06] bg-ink-900 px-3 py-2 text-xs text-ink-300">
            {i === 0 ? 'Vorher' : 'Nachher'} · {fmtDateTime(p.takenAt)}
          </figcaption>
        </figure>
      ))}
    </div>
  );
}
