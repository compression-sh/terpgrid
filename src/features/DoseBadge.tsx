import type { DoseBand } from '../lib/calc/dosage';

const toneClass: Record<DoseBand['tone'], string> = {
  ok: 'border-leaf-500/25 bg-leaf-500/10 text-leaf-300',
  info: 'border-sky-400/25 bg-sky-400/10 text-sky-300',
  caution: 'border-yellow-400/25 bg-yellow-400/10 text-yellow-200',
  warn: 'border-amber-400/30 bg-amber-400/10 text-amber-300',
  danger: 'border-rose-400/30 bg-rose-500/10 text-rose-300',
};

export const toneHex: Record<DoseBand['tone'], string> = {
  ok: '#34c77b',
  info: '#38bdf8',
  caution: '#facc15',
  warn: '#fbbf24',
  danger: '#fb7185',
};

export function DoseBadge({ band }: { band: DoseBand }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-medium ${toneClass[band.tone]}`}>
      <span className="size-1.5 rounded-full" style={{ background: toneHex[band.tone] }} />
      Edible-Einordnung: {band.label}
    </span>
  );
}
