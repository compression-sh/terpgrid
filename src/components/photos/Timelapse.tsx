import { Pause, Play, Repeat, SkipBack, SkipForward } from 'lucide-react';
import { useEffect, useState } from 'react';
import { daysBetween, fmtDateTime } from '../../lib/dates';
import type { Photo } from '../../lib/db/types';
import { loadPhotoUrl } from './usePhotoUrl';
import { PhotoImg } from './PhotoImg';

const SPEEDS = [
  { label: '0,5×', ms: 1600 },
  { label: '1×', ms: 800 },
  { label: '2×', ms: 400 },
  { label: '4×', ms: 200 },
  { label: '8×', ms: 100 },
];

/**
 * Interaktive Zeitraffer-Diashow aus eigenen Fotos (chronologisch).
 * Kein Video-Export – bewusst schlank; die Bilder bleiben lokal.
 */
export function Timelapse({ photos, startDate }: { photos: Photo[]; startDate?: string }) {
  const frames = [...photos].sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  const [i, setI] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(true);
  const frame = frames[Math.min(i, frames.length - 1)];

  // Nächste Bilder vorladen, damit die Wiedergabe flüssig bleibt.
  useEffect(() => {
    for (let k = 1; k <= 3; k++) {
      const f = frames[i + k];
      if (f) loadPhotoUrl(f.id, 'full');
    }
  }, [i, frames]);

  useEffect(() => {
    if (!playing) return;
    const t = window.setTimeout(() => {
      if (i < frames.length - 1) setI(i + 1);
      else if (loop) setI(0);
      else setPlaying(false);
    }, SPEEDS[speed]!.ms);
    return () => window.clearTimeout(t);
  }, [playing, i, speed, loop, frames.length]);

  if (!frame) return null;
  const day = startDate ? daysBetween(startDate, frame.takenAt.slice(0, 10)) + 1 : undefined;

  return (
    <div className="space-y-3">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-xl border border-white/[0.06] bg-black">
        <PhotoImg key={frame.id} photoId={frame.id} variant="full" alt={`Bild ${i + 1} von ${frames.length}`} fit="contain" className="absolute inset-0 h-full w-full" />
        <div className="absolute left-3 top-3 rounded-lg bg-black/65 px-2.5 py-1 text-xs text-ink-100 backdrop-blur">
          {fmtDateTime(frame.takenAt)}
          {day !== undefined && day > 0 && <span className="ml-2 font-mono text-leaf-300">Tag {day}</span>}
        </div>
        <div className="absolute bottom-3 right-3 rounded-lg bg-black/65 px-2 py-0.5 font-mono text-[11px] text-ink-200 backdrop-blur">
          {i + 1}/{frames.length}
        </div>
      </div>
      <input
        type="range"
        className="slider"
        min={0}
        max={Math.max(0, frames.length - 1)}
        value={i}
        aria-label="Bild auswählen"
        style={{ ['--fill' as string]: `${frames.length > 1 ? (i / (frames.length - 1)) * 100 : 0}%` }}
        onChange={(e) => {
          setPlaying(false);
          setI(Number(e.target.value));
        }}
      />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1.5">
          <button type="button" className="btn-ghost p-2" aria-label="Zum Anfang" onClick={() => setI(0)}>
            <SkipBack className="size-4" />
          </button>
          <button type="button" className="btn-primary px-4" aria-label={playing ? 'Pause' : 'Abspielen'} onClick={() => setPlaying((p) => !p)} disabled={frames.length < 2}>
            {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
            {playing ? 'Pause' : 'Abspielen'}
          </button>
          <button type="button" className="btn-ghost p-2" aria-label="Zum Ende" onClick={() => setI(frames.length - 1)}>
            <SkipForward className="size-4" />
          </button>
          <button type="button" className={`btn-ghost p-2 ${loop ? 'text-leaf-300' : ''}`} aria-pressed={loop} aria-label="Wiederholen" onClick={() => setLoop((l) => !l)}>
            <Repeat className="size-4" />
          </button>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-white/[0.06] bg-ink-850 p-1" role="radiogroup" aria-label="Geschwindigkeit">
          {SPEEDS.map((s, k) => (
            <button
              key={s.label}
              type="button"
              role="radio"
              aria-checked={speed === k}
              onClick={() => setSpeed(k)}
              className={`rounded-lg px-2 py-1 font-mono text-xs ${speed === k ? 'bg-ink-700 text-ink-50' : 'text-ink-400 hover:text-ink-200'}`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
