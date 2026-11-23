import { useIsServerMode } from '../app/auth';
import { Camera, Clapperboard, Columns2, Grid3x3, Images, ShieldCheck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useData } from '../app/DataProvider';
import { useQuickActions } from '../app/QuickActions';
import { setQuery, useRoute } from '../app/router';
import { SelectField } from '../components/forms/Fields';
import { CompareSlider, SideBySide } from '../components/photos/CompareSlider';
import { PhotoGrid } from '../components/photos/PhotoGrid';
import { PhotoImg } from '../components/photos/PhotoImg';
import { usePhotoPhase } from '../components/photos/PhotoViewer';
import { Timelapse } from '../components/photos/Timelapse';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { Segmented } from '../components/ui/Segmented';
import { fmtDateTime } from '../lib/dates';
import { GROW_PHASES, type GrowPhase, type Photo } from '../lib/db/types';
import { PHASE_LABEL } from '../lib/grow/phases';

type View = 'grid' | 'compare' | 'timelapse';

function PhotoPicker({ photos, value, onChange, label }: { photos: Photo[]; value?: string; onChange: (id: string) => void; label: string }) {
  return (
    <div>
      <div className="label mb-1.5">{label}</div>
      <div className="flex gap-1.5 overflow-x-auto pb-1" role="radiogroup" aria-label={label}>
        {photos.map((p) => (
          <button
            key={p.id}
            type="button"
            role="radio"
            aria-checked={value === p.id}
            aria-label={`Foto vom ${fmtDateTime(p.takenAt)}`}
            onClick={() => onChange(p.id)}
            className={`relative size-16 shrink-0 overflow-hidden rounded-lg border-2 ${value === p.id ? 'border-leaf-400' : 'border-transparent opacity-70 hover:opacity-100'}`}
          >
            <PhotoImg photoId={p.id} alt="" className="h-full w-full" />
            <span className="absolute inset-x-0 bottom-0 bg-black/70 text-center font-mono text-[9px] text-ink-100">{p.takenAt.slice(5, 10).split('-').reverse().join('.')}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

export function PhotosPage() {
  const server = useIsServerMode();
  const { data } = useData();
  const route = useRoute();
  const quick = useQuickActions();
  const phaseOf = usePhotoPhase();
  const q = route.query;
  const view = (['grid', 'compare', 'timelapse'].includes(q.get('view') ?? '') ? q.get('view') : 'grid') as View;
  const growId = q.get('grow') ?? '';
  const plantId = q.get('plant') ?? '';
  const phase = (q.get('phase') ?? '') as GrowPhase | '';
  const from = q.get('from') ?? '';
  const to = q.get('to') ?? '';
  const [beforeId, setBeforeId] = useState<string>();
  const [afterId, setAfterId] = useState<string>();
  const [compareMode, setCompareMode] = useState<'slider' | 'side'>('slider');

  const plants = data.plants.filter((p) => !growId || p.growId === growId);
  const filtered = useMemo(
    () =>
      data.photos
        .filter((p) => !growId || p.growId === growId)
        .filter((p) => !plantId || p.plantId === plantId)
        .filter((p) => !from || p.takenAt.slice(0, 10) >= from)
        .filter((p) => !to || p.takenAt.slice(0, 10) <= to)
        .filter((p) => !phase || phaseOf(p) === phase),
    [data.photos, growId, plantId, from, to, phase, phaseOf],
  );
  const chrono = useMemo(() => [...filtered].sort((a, b) => a.takenAt.localeCompare(b.takenAt)), [filtered]);
  const before = chrono.find((p) => p.id === beforeId) ?? chrono[0];
  const after = chrono.find((p) => p.id === afterId) ?? chrono[chrono.length - 1];
  const grow = data.grows.find((g) => g.id === growId);
  const set = (patch: Record<string, string | undefined>) => setQuery(route, patch);
  const filtersActive = !!(growId || plantId || phase || from || to);

  return (
    <div>
      <PageHeader
        title="Fotos"
        subtitle="Dein lokales Foto-Journal – chronologisch, filterbar, mit Vergleich und Zeitraffer."
        actions={
          <button type="button" className="btn-primary" onClick={() => quick({ kind: 'photo', target: { growId: growId || undefined, plantId: plantId || undefined } })}>
            <Camera className="size-4" /> Hochladen
          </button>
        }
      />

      {data.photos.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={<Images />}
            title="Noch keine Fotos"
            text="Fotos lassen sich Grows und Pflanzen zuordnen. Sie werden lokal verkleinert gespeichert; Standortdaten werden entfernt."
            action={
              <button type="button" className="btn-primary" onClick={() => quick({ kind: 'photo' })}>
                <Camera className="size-4" /> Erste Fotos hochladen
              </button>
            }
          />
        </div>
      ) : (
        <div className="space-y-5">
          <Card bodyClassName="p-4">
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              <SelectField label="Grow" value={growId} onChange={(v) => set({ grow: v, plant: undefined })} options={data.grows.map((g) => ({ value: g.id, label: g.name }))} placeholder="Alle Grows" />
              <SelectField label="Pflanze" value={plantId} onChange={(v) => set({ plant: v })} options={plants.map((p) => ({ value: p.id, label: p.name }))} placeholder="Alle Pflanzen" />
              <SelectField label="Phase" value={phase} onChange={(v) => set({ phase: v })} options={GROW_PHASES.map((p) => ({ value: p, label: PHASE_LABEL[p] }))} placeholder="Alle Phasen" />
              <label className="space-y-1.5">
                <span className="label">Von</span>
                <input type="date" className="input-base" value={from} onChange={(e) => set({ from: e.target.value })} />
              </label>
              <label className="space-y-1.5">
                <span className="label">Bis</span>
                <input type="date" className="input-base" value={to} onChange={(e) => set({ to: e.target.value })} />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-ink-400">
                {filtered.length} von {data.photos.length} Fotos
                {filtersActive && (
                  <button type="button" className="ml-2 text-leaf-300 hover:underline" onClick={() => set({ grow: undefined, plant: undefined, phase: undefined, from: undefined, to: undefined })}>
                    Filter zurücksetzen
                  </button>
                )}
              </span>
              <div className="w-full sm:w-80">
                <Segmented
                  size="sm"
                  value={view}
                  onChange={(v) => set({ view: v === 'grid' ? undefined : v })}
                  options={[
                    { value: 'grid', label: 'Raster' },
                    { value: 'compare', label: 'Vergleich' },
                    { value: 'timelapse', label: 'Zeitraffer' },
                  ]}
                />
              </div>
            </div>
          </Card>

          {filtered.length === 0 ? (
            <div className="card">
              <EmptyState compact title="Keine Fotos für diese Filter" />
            </div>
          ) : view === 'grid' ? (
            <Card title="Chronologie" icon={<Grid3x3 className="size-4" />}>
              <PhotoGrid photos={filtered} />
            </Card>
          ) : view === 'compare' ? (
            <Card
              title="Vorher / Nachher"
              icon={<Columns2 className="size-4" />}
              actions={
                <div className="w-56">
                  <Segmented size="sm" value={compareMode} onChange={setCompareMode} options={[{ value: 'slider', label: 'Schieber' }, { value: 'side', label: 'Nebeneinander' }]} />
                </div>
              }
            >
              {chrono.length < 2 ? (
                <EmptyState compact title="Mindestens zwei Fotos nötig" />
              ) : (
                <div className="space-y-5">
                  <div className="grid gap-4 lg:grid-cols-2">
                    <PhotoPicker label="Vorher" photos={chrono} value={before?.id} onChange={setBeforeId} />
                    <PhotoPicker label="Nachher" photos={chrono} value={after?.id} onChange={setAfterId} />
                  </div>
                  {before && after && (compareMode === 'slider' ? <CompareSlider before={before} after={after} /> : <SideBySide before={before} after={after} />)}
                </div>
              )}
            </Card>
          ) : (
            <Card title="Zeitraffer" subtitle={`${chrono.length} eigene Fotos in Aufnahmereihenfolge`} icon={<Clapperboard className="size-4" />}>
              {chrono.length < 2 ? <EmptyState compact title="Mindestens zwei Fotos nötig" /> : <Timelapse photos={chrono} startDate={grow?.startDate} />}
              <p className="hint mt-4">Interaktive Diashow statt Videodatei. Tipp: für einen gleichmäßigen Zeitraffer Fotos aus ähnlicher Perspektive und nach Pflanze filtern.</p>
            </Card>
          )}

          <div className="flex gap-2.5 rounded-xl border border-white/[0.05] bg-white/[0.015] p-3 text-xs leading-relaxed text-ink-400">
            <ShieldCheck className="mt-0.5 size-4 shrink-0 text-leaf-400" />
            {server ? 'Bilder werden verschlüsselt auf deinem Server gespeichert und auf anderen Geräten bei Bedarf geladen.' : 'Alle Bilder liegen ausschließlich im Speicher dieses Browsers.'} Beim Import werden eingebettete Metadaten (inkl. GPS) durch Neu-Kodierung entfernt. Bilder, die der
            Browser nicht lesen kann (z. B. HEIC in manchen Browsern), werden abgelehnt.
          </div>
        </div>
      )}
    </div>
  );
}
