import { href } from '../../app/router';
import { useData } from '../../app/DataProvider';
import type { GrowProject } from '../../lib/db/types';
import { fmtDateShort, relativeDay, today } from '../../lib/dates';
import { PHASE_COLOR, currentPhase, growDay, phaseSpans } from '../../lib/grow/phases';
import { PhotoImg } from '../photos/PhotoImg';
import { Chip, PhaseChip } from '../ui/Chip';

/** Karte eines Grow-Projekts (Grow-Liste). */
export function GrowCard({ grow, compact }: { grow: GrowProject; compact?: boolean }) {
  const { data } = useData();
  const plants = data.plants.filter((p) => p.growId === grow.id);
  const photos = data.photos.filter((p) => p.growId === grow.id);
  const t = today();
  const day = growDay(grow.startDate, t, grow.completedDate);
  const phase = currentPhase(grow.phaseDates, t);
  const spans = phaseSpans(grow.phaseDates, t, grow.completedDate);
  const total = spans.reduce((s, x) => s + Math.max(1, x.days), 0);
  const cover = grow.coverPhotoId ?? [...photos].sort((a, b) => b.takenAt.localeCompare(a.takenAt))[0]?.id;
  return (
    <a href={href(`grows/${grow.id}`)} className="group block overflow-hidden rounded-xl border border-white/[0.06] bg-ink-900/60 transition-all hover:border-white/[0.12]">
      <div className={`relative ${compact ? 'h-24' : 'h-32'} overflow-hidden bg-ink-850`}>
        <PhotoImg photoId={cover} alt={`Titelbild ${grow.name}`} className="h-full w-full transition-transform duration-500 group-hover:scale-[1.03]" />
        <div className="absolute inset-0 bg-gradient-to-t from-ink-950/90 via-ink-950/20 to-transparent" />
        <div className="absolute bottom-2.5 left-3 right-3 flex items-end justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold text-ink-50">{grow.name}</div>
            <div className="text-[11px] text-ink-300">
              seit {fmtDateShort(grow.startDate)} · {plants.length} {plants.length === 1 ? 'Pflanze' : 'Pflanzen'}
            </div>
          </div>
          {day !== undefined ? (
            <div className="shrink-0 rounded-lg border border-white/10 bg-black/50 px-2 py-1 text-right backdrop-blur">
              <div className="text-[9px] uppercase tracking-wider text-ink-400">Tag</div>
              <div className="font-mono text-base font-semibold leading-none text-ink-50">{day}</div>
            </div>
          ) : (
            <Chip tone="sky">startet {relativeDay(grow.startDate)}</Chip>
          )}
        </div>
      </div>
      <div className="space-y-2.5 px-3 py-3">
        <div className="flex items-center justify-between gap-2">
          <PhaseChip phase={phase} />
          <span className="text-[11px] text-ink-500">{photos.length} Fotos</span>
        </div>
        {spans.length > 0 ? (
          <div className="flex h-1.5 overflow-hidden rounded-full bg-ink-700" aria-label="Erfasste Phasen">
            {spans.map((s) => (
              <div key={s.phase} title={`${s.phase}: ${s.days} Tage`} style={{ width: `${(Math.max(1, s.days) / total) * 100}%`, background: PHASE_COLOR[s.phase], opacity: s.ongoing ? 1 : 0.6 }} />
            ))}
          </div>
        ) : (
          <div className="h-1.5 rounded-full bg-ink-700" title="Noch keine Meilensteine erfasst" />
        )}
      </div>
    </a>
  );
}
