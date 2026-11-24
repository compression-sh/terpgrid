import { externalLink } from '../../lib/catalog/links';
import { Camera, Clapperboard, Columns2, History, Images, Pencil, Plus, Ruler, Scale, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useConfirm } from '../../app/Confirm';
import { useData } from '../../app/DataProvider';
import { errorText, useToast } from '../../app/Toasts';
import { href, navigate, setQuery, useRoute } from '../../app/router';
import { ActivityFormModal, PlantFormModal } from '../../components/forms/GrowForms';
import { ActivityTimeline } from '../../components/grow/ActivityTimeline';
import { MeasurementCharts } from '../../components/grow/MeasurementCharts';
import { PhaseTimeline } from '../../components/grow/PhaseTimeline';
import { PhotoGrid } from '../../components/photos/PhotoGrid';
import { PhotoImg } from '../../components/photos/PhotoImg';
import { PhotoUploadModal } from '../../components/photos/PhotoUpload';
import { Card } from '../../components/ui/Card';
import { Chip, PhaseChip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { fmtDate, today } from '../../lib/dates';
import { deletePlant } from '../../lib/db/repo';
import { PLANT_TYPE_LABEL } from '../../lib/grow/labels';
import { currentPhase, growDay } from '../../lib/grow/phases';
import { METRICS, metricSeries } from '../../lib/grow/series';
import { fmt } from '../../lib/format';

type Tab = 'log' | 'photos' | 'measurements' | 'outcome';

export function PlantDetail({ growId, plantId }: { growId: string; plantId: string }) {
  const { data } = useData();
  const route = useRoute();
  const toast = useToast();
  const confirm = useConfirm();
  const [modal, setModal] = useState<'edit' | 'activity' | 'photo' | 'measure' | null>(null);
  const tab = (['log', 'photos', 'measurements', 'outcome'].includes(route.query.get('tab') ?? '') ? route.query.get('tab') : 'log') as Tab;

  const plant = data.plants.find((p) => p.id === plantId);
  const grow = data.grows.find((g) => g.id === growId);
  const activities = useMemo(() => data.activities.filter((a) => a.plantId === plantId), [data.activities, plantId]);
  const photos = useMemo(() => data.photos.filter((p) => p.plantId === plantId), [data.photos, plantId]);

  if (!plant || !grow || plant.growId !== growId) {
    return <EmptyState title="Pflanze nicht gefunden" text="Sie wurde gelöscht oder gehört zu einem anderen Grow." action={<a href={href(`grows/${growId}`)} className="btn-primary">Zum Grow</a>} />;
  }

  const t = today();
  const ownPhases = Object.keys(plant.phaseDates).length > 0;
  const dates = ownPhases ? plant.phaseDates : grow.phaseDates;
  const phase = currentPhase(dates, t);
  const day = growDay(plant.startDate, t, plant.outcome?.harvestDate ?? grow.completedDate);
  const strain = plant.strainId ? data.strains.find((s) => s.id === plant.strainId) : undefined;
  const sortedPhotos = [...photos].sort((a, b) => b.takenAt.localeCompare(a.takenAt));
  const cover = plant.coverPhotoId ?? sortedPhotos[0]?.id;
  const latest = METRICS.map((m) => ({ m, p: metricSeries(activities, m.key).at(-1) })).filter((x) => x.p);
  const o = plant.outcome;

  async function remove() {
    const ok = await confirm({
      title: `„${plant!.name}“ löschen?`,
      message: `Die Pflanze wird mit ${activities.length} Einträgen und ${photos.length} Fotos dauerhaft gelöscht.`,
      confirmLabel: 'Löschen',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await deletePlant(plant!.id);
      toast('Pflanze gelöscht');
      navigate(`grows/${growId}?tab=plants`, { replace: true });
    } catch (e) {
      toast(errorText(e), { tone: 'error' });
    }
  }

  const tabs: { id: Tab; label: string; icon: React.ReactNode }[] = [
    { id: 'log', label: 'Verlauf', icon: <History className="size-4" /> },
    { id: 'photos', label: `Fotos (${photos.length})`, icon: <Images className="size-4" /> },
    { id: 'measurements', label: 'Messwerte', icon: <Ruler className="size-4" /> },
    { id: 'outcome', label: 'Ergebnis', icon: <Scale className="size-4" /> },
  ];

  return (
    <div>
      <nav aria-label="Brotkrumen" className="mb-3 flex min-w-0 items-center gap-1.5 text-xs text-ink-400">
        <a href={href('grows')} className="hover:text-ink-100">
          Growlogs
        </a>
        <span className="text-ink-600">/</span>
        <a href={href(`grows/${growId}`)} className="truncate hover:text-ink-100">
          {grow.name}
        </a>
        <span className="text-ink-600">/</span>
        <span className="truncate text-ink-300">{plant.name}</span>
      </nav>

      <section className="card mb-6 overflow-hidden animate-fade-up">
        <div className="grid sm:grid-cols-[minmax(0,15rem)_1fr]">
          <PhotoImg photoId={cover} variant="full" alt={plant.name} className="aspect-[4/3] w-full sm:aspect-auto sm:h-full sm:min-h-[13rem]" />
          <div className="flex flex-col gap-4 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <h1 className="truncate text-2xl font-semibold tracking-tight text-ink-50">{plant.name}</h1>
                <div className="mt-1 text-[13px] text-ink-400">
                  {strain ? (
                    <>
                      <a href={href(`strains/${strain.id}`)} className="text-leaf-300 hover:underline">
                        {strain.name}
                      </a>
                      {strain.external && externalLink(strain.external.provider, strain.external.id) && (
                        <a href={href(externalLink(strain.external.provider, strain.external.id)!)} className="ml-1.5 rounded border border-white/[0.08] px-1.5 py-px text-[10px] text-ink-300 hover:text-ink-50">
                          Katalogprofil
                        </a>
                      )}
                    </>
                  ) : (
                    plant.strainName || 'Sorte nicht angegeben'
                  )}
                  {' · '}seit {fmtDate(plant.startDate)}
                </div>
              </div>
              <div className="shrink-0 rounded-xl border border-white/[0.08] bg-white/[0.02] px-3.5 py-1.5 text-center">
                <div className="text-[10px] uppercase tracking-[0.14em] text-ink-500">Tag</div>
                <div className="font-mono text-2xl font-semibold text-ink-50">{day ?? '–'}</div>
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <PhaseChip phase={phase} />
              <Chip>{PLANT_TYPE_LABEL[plant.type]}</Chip>
              {!ownPhases && <Chip title="Diese Pflanze hat keine eigenen Meilensteine">Phasen vom Grow</Chip>}
            </div>
            {latest.length > 0 && (
              <dl className="flex flex-wrap gap-x-5 gap-y-1">
                {latest.map(({ m, p }) => (
                  <div key={m.key}>
                    <dt className="text-[10px] text-ink-500">{m.label}</dt>
                    <dd className="font-mono text-[14px] tabular text-ink-100">
                      {fmt(p!.value)} <span className="text-[11px] text-ink-400">{m.unit}</span>
                    </dd>
                  </div>
                ))}
              </dl>
            )}
            <div className="mt-auto flex flex-wrap gap-2">
              <button type="button" className="btn-primary" onClick={() => setModal('activity')}>
                <Plus className="size-4" /> Eintrag
              </button>
              <button type="button" className="btn-ghost" onClick={() => setModal('measure')}>
                <Ruler className="size-4" /> Messung
              </button>
              <button type="button" className="btn-ghost" onClick={() => setModal('photo')}>
                <Camera className="size-4" /> Fotos
              </button>
              <button type="button" className="btn-ghost" onClick={() => setModal('edit')}>
                <Pencil className="size-4" /> Bearbeiten
              </button>
              <button type="button" className="btn-ghost text-rose-300/90 hover:text-rose-200" onClick={remove} aria-label="Pflanze löschen">
                <Trash2 className="size-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {plant.notes && (
        <Card title="Notizen" className="mb-5">
          <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-300">{plant.notes}</p>
        </Card>
      )}

      <Card title="Phasen" subtitle={ownPhases ? 'Eigene Meilensteine dieser Pflanze' : `Meilensteine von „${grow.name}“`} className="mb-5">
        <PhaseTimeline dates={dates} endDate={plant.outcome?.harvestDate && ownPhases ? undefined : grow.completedDate} />
      </Card>

      <div className="no-print mb-5 flex gap-1 overflow-x-auto rounded-xl border border-white/[0.06] bg-ink-900/70 p-1 [scrollbar-width:none]">
        {tabs.map((x) => (
          <button
            key={x.id}
            type="button"
            aria-current={tab === x.id ? 'page' : undefined}
            onClick={() => setQuery(route, { tab: x.id === 'log' ? undefined : x.id })}
            className={`flex shrink-0 flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium ${tab === x.id ? 'bg-ink-700 text-ink-50' : 'text-ink-400 hover:text-ink-200'}`}
          >
            {x.icon}
            {x.label}
          </button>
        ))}
      </div>

      {tab === 'log' && (
        <Card title="Verlauf" subtitle="Alle Einträge dieser Pflanze">
          <ActivityTimeline activities={activities} growId={growId} showPlant={false} />
        </Card>
      )}
      {tab === 'photos' && (
        <Card
          title="Fortschrittsfotos"
          actions={
            <>
              <a href={href(`photos?grow=${growId}&plant=${plantId}&view=timelapse`)} className="btn-ghost py-1.5 text-xs">
                <Clapperboard className="size-3.5" /> Zeitraffer
              </a>
              <a href={href(`photos?grow=${growId}&plant=${plantId}&view=compare`)} className="btn-ghost py-1.5 text-xs">
                <Columns2 className="size-3.5" /> Vergleich
              </a>
            </>
          }
        >
          {photos.length === 0 ? <EmptyState icon={<Camera />} title="Noch keine Fotos" action={<button type="button" className="btn-primary" onClick={() => setModal('photo')}><Camera className="size-4" /> Fotos hochladen</button>} /> : <PhotoGrid photos={photos} />}
        </Card>
      )}
      {tab === 'measurements' && (
        <Card title="Messwerte" actions={<button type="button" className="btn-ghost py-1.5 text-xs" onClick={() => setModal('measure')}><Plus className="size-3.5" /> Messung</button>}>
          <MeasurementCharts activities={activities} splitByPlant={false} />
        </Card>
      )}
      {tab === 'outcome' && (
        <Card title="Ergebnis" subtitle="Optional – nur eigene Angaben" actions={<button type="button" className="btn-ghost py-1.5 text-xs" onClick={() => setModal('edit')}><Pencil className="size-3.5" /> Erfassen</button>}>
          {!o ? (
            <EmptyState compact icon={<Scale />} title="Noch kein Ergebnis erfasst" text="Erntedatum, Nass- und Trockengewicht und Notizen lassen sich in „Bearbeiten“ eintragen." />
          ) : (
            <div className="space-y-4">
              <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ['Erntedatum', o.harvestDate ? fmtDate(o.harvestDate) : '–'],
                  ['Nassgewicht', o.wetWeightG !== undefined ? `${fmt(o.wetWeightG)} g` : '–'],
                  ['Trockengewicht', o.dryWeightG !== undefined ? `${fmt(o.dryWeightG)} g` : '–'],
                  ['Trocknungsverlust', o.wetWeightG && o.dryWeightG !== undefined ? `${fmt((1 - o.dryWeightG / o.wetWeightG) * 100)} %` : '–'],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3">
                    <dt className="text-[11px] text-ink-500">{k}</dt>
                    <dd className="mt-0.5 font-mono text-lg tabular text-ink-50">{v}</dd>
                  </div>
                ))}
              </dl>
              {o.notes && <p className="whitespace-pre-wrap text-[13px] text-ink-300">{o.notes}</p>}
              <p className="hint">Trocknungsverlust = 1 − Trocken ÷ Nass (aus deinen Angaben berechnet).</p>
            </div>
          )}
        </Card>
      )}

      {modal === 'edit' && <PlantFormModal open onClose={() => setModal(null)} plant={plant} growId={growId} />}
      {modal === 'activity' && <ActivityFormModal open onClose={() => setModal(null)} growId={growId} plantId={plantId} />}
      {modal === 'measure' && <ActivityFormModal open onClose={() => setModal(null)} growId={growId} plantId={plantId} defaultType="measurement" />}
      {modal === 'photo' && <PhotoUploadModal open onClose={() => setModal(null)} target={{ growId, plantId }} />}
    </div>
  );
}
