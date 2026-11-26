import { growCompleteness } from '../../lib/grow/summary';
import {
  Archive,
  ArchiveRestore,
  CalendarDays,
  Camera,
  CheckCircle2,
  Clapperboard,
  Columns2,
  History,
  Images,
  LayoutGrid,
  MoreHorizontal,
  Pencil,
  Plus,
  Receipt,
  Ruler,
  Sprout,
  Trash2, QrCode, NotebookPen, FileText, FlaskConical } from 'lucide-react';
import { type ReactNode, useMemo, useState } from 'react';
import { useConfirm } from '../../app/Confirm';
import { useData } from '../../app/DataProvider';
import { useQuickActions } from '../../app/QuickActions';
import { errorText, useToast } from '../../app/Toasts';
import { href, navigate, setQuery, useRoute } from '../../app/router';
import { GrowFormModal, ActivityFormModal } from '../../components/forms/GrowForms';
import { ReminderFormModal } from '../../components/forms/PersonalForms';
import { ActivityTimeline } from '../../components/grow/ActivityTimeline';
import { ExpenseList, money } from '../../components/grow/ExpenseList';
import { ContextHelp } from '../../components/academy/ContextHelp';
import { GrowEquipmentCard, GrowStrainsCard, GrowTasksCard } from '../../components/grow/GrowContextCards';
import { MeasurementCharts } from '../../components/grow/MeasurementCharts';
import { ThresholdsModal } from '../../components/forms/ThresholdsModal';
import { type DayMarker, MonthCalendar } from '../../components/grow/MonthCalendar';
import { PhaseTimeline } from '../../components/grow/PhaseTimeline';
import { PhotoGrid } from '../../components/photos/PhotoGrid';
import { PhotoImg } from '../../components/photos/PhotoImg';
import { PhotoUploadModal } from '../../components/photos/PhotoUpload';
import { Card } from '../../components/ui/Card';
import { Chip, PhaseChip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { occurrencesInRange } from '../../lib/calendar';
import { addDays, daysBetween, fmtDate, fmtDateLong, fmtDateTime, monthGrid, startOfMonth, today } from '../../lib/dates';
import { deleteGrow, updateRecord } from '../../lib/db/repo';
import type { Activity, GrowProject, Plant } from '../../lib/db/types';
import { ACTIVITY_LABEL, PLANT_TYPE_LABEL, REMINDER_CATEGORY_LABEL, SETTING_LABEL, STATUS_LABEL } from '../../lib/grow/labels';
import { PHASE_COLOR, currentPhase, growDay, phaseSpans } from '../../lib/grow/phases';
import { METRICS, metricSeries } from '../../lib/grow/series';
import { fmt } from '../../lib/format';
import { ShareButton } from '../../components/collab/ShareDialog';

type Tab = 'overview' | 'plants' | 'photos' | 'log' | 'measurements' | 'calendar' | 'expenses';
const TABS: { id: Tab; label: string; icon: ReactNode }[] = [
  { id: 'overview', label: 'Übersicht', icon: <LayoutGrid className="size-4" /> },
  { id: 'plants', label: 'Pflanzen', icon: <Sprout className="size-4" /> },
  { id: 'photos', label: 'Fotos', icon: <Images className="size-4" /> },
  { id: 'log', label: 'Verlauf', icon: <History className="size-4" /> },
  { id: 'measurements', label: 'Messwerte', icon: <Ruler className="size-4" /> },
  { id: 'calendar', label: 'Kalender', icon: <CalendarDays className="size-4" /> },
  { id: 'expenses', label: 'Ausgaben', icon: <Receipt className="size-4" /> },
];

export function PlantCard({ plant, growId }: { plant: Plant; growId: string }) {
  const { data } = useData();
  const grow = data.grows.find((g) => g.id === growId);
  const t = today();
  const photos = data.photos.filter((p) => p.plantId === plant.id).sort((a, b) => b.takenAt.localeCompare(a.takenAt));
  const acts = data.activities.filter((a) => a.plantId === plant.id);
  const dates = Object.keys(plant.phaseDates).length ? plant.phaseDates : (grow?.phaseDates ?? {});
  const phase = currentPhase(dates, t);
  const heights = metricSeries(acts, 'heightCm');
  const lastHeight = heights.at(-1);
  const strain = plant.strainId ? data.strains.find((s) => s.id === plant.strainId)?.name : plant.strainName;
  const day = growDay(plant.startDate, t, grow?.completedDate);
  return (
    <a href={href(`grows/${growId}/plants/${plant.id}`)} className="group flex gap-3 rounded-xl border border-white/[0.06] bg-ink-900/60 p-2.5 transition-colors hover:border-white/[0.12]">
      <PhotoImg photoId={plant.coverPhotoId ?? photos[0]?.id} alt={plant.name} className="size-20 shrink-0 rounded-lg" />
      <div className="min-w-0 flex-1 py-0.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[14px] font-semibold text-ink-50">{plant.name}</div>
            <div className="truncate text-[11px] text-ink-400">{strain || 'Sorte nicht angegeben'}</div>
          </div>
          {day !== undefined && <span className="shrink-0 font-mono text-[11px] text-ink-400">Tag {day}</span>}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <PhaseChip phase={phase} short />
          {plant.type !== 'unknown' && <Chip>{PLANT_TYPE_LABEL[plant.type]}</Chip>}
          {lastHeight && <Chip>{fmt(lastHeight.value)} cm</Chip>}
          {plant.outcome?.dryWeightG !== undefined && <Chip tone="amber">{fmt(plant.outcome.dryWeightG)} g trocken</Chip>}
        </div>
      </div>
    </a>
  );
}

function StatusMenu({ grow, extra = [] }: { grow: GrowProject; extra?: { icon: ReactNode; label: string; run: () => void }[] }) {
  const toast = useToast();
  const confirm = useConfirm();
  const [open, setOpen] = useState(false);
  const item = (icon: ReactNode, label: string, run: () => void, danger?: boolean) => (
    <button
      type="button"
      role="menuitem"
      className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] ${danger ? 'text-rose-300 hover:bg-rose-500/10' : 'text-ink-200 hover:bg-white/[0.05]'}`}
      onClick={() => {
        setOpen(false);
        run();
      }}
    >
      {icon}
      {label}
    </button>
  );
  const setStatus = async (status: GrowProject['status']) => {
    try {
      await updateRecord('grows', grow.id, {
        status,
        completedDate: status === 'active' ? undefined : (grow.completedDate ?? today()),
      });
      toast(`Status: ${STATUS_LABEL[status]}`);
    } catch (e) {
      toast(errorText(e), { tone: 'error' });
    }
  };
  const remove = async () => {
    const ok = await confirm({
      title: `„${grow.name}“ löschen?`,
      message: 'Der Grow wird mit allen Pflanzen, Einträgen, Fotos, Ausgaben und verknüpften Erinnerungen dauerhaft von diesem Gerät gelöscht. Verknüpfte Sammlungs-Einträge bleiben erhalten. Tipp: Vorher ein Backup erstellen oder stattdessen archivieren.',
      confirmLabel: 'Endgültig löschen',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await deleteGrow(grow.id);
      toast('Grow gelöscht');
      navigate('grows', { replace: true });
    } catch (e) {
      toast(errorText(e), { tone: 'error' });
    }
  };
  return (
    <div className="relative" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOpen(false)}>
      <button type="button" className="btn-ghost p-2" aria-label="Weitere Aktionen" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-2 w-56 rounded-xl border border-white/[0.08] bg-ink-850 p-1 shadow-2xl">
          {extra.length > 0 && (
            <div className="sm:hidden">
              {extra.map((x) => (
                <div key={x.label}>{item(x.icon, x.label, x.run)}</div>
              ))}
              <div className="my-1 h-px bg-white/[0.06]" />
            </div>
          )}
          {grow.status !== 'completed' && item(<CheckCircle2 className="size-4" />, 'Als abgeschlossen markieren', () => setStatus('completed'))}
          {grow.status !== 'archived' && item(<Archive className="size-4" />, 'Archivieren', () => setStatus('archived'))}
          {grow.status !== 'active' && item(<ArchiveRestore className="size-4" />, 'Wieder aktivieren', () => setStatus('active'))}
          <div className="my-1 h-px bg-white/[0.06]" />
          {item(<Trash2 className="size-4" />, 'Grow löschen', remove, true)}
        </div>
      )}
    </div>
  );
}

export function GrowDetail({ growId }: { growId: string }) {
  const { data, settings } = useData();
  const route = useRoute();
  const quick = useQuickActions();
  const tab = (TABS.some((t) => t.id === route.query.get('tab')) ? route.query.get('tab') : 'overview') as Tab;
  const [modal, setModal] = useState<'edit' | 'activity' | 'photo' | 'reminder' | 'thresholds' | null>(null);
  const [month, setMonth] = useState(startOfMonth(today()));
  const [selectedDay, setSelectedDay] = useState<string>();
  const [photoPlant, setPhotoPlant] = useState('');

  const grow = data.grows.find((g) => g.id === growId);
  const plants = useMemo(() => data.plants.filter((p) => p.growId === growId).sort((a, b) => a.name.localeCompare(b.name, 'de')), [data.plants, growId]);
  const activities = useMemo(() => data.activities.filter((a) => a.growId === growId), [data.activities, growId]);
  const photos = useMemo(() => data.photos.filter((p) => p.growId === growId), [data.photos, growId]);
  const expenses = useMemo(() => data.expenses.filter((e) => e.growId === growId), [data.expenses, growId]);
  const reminders = useMemo(() => data.reminders.filter((r) => r.growId === growId), [data.reminders, growId]);

  if (!grow) {
    return (
      <EmptyState
        title="Grow nicht gefunden"
        text="Der Grow wurde gelöscht oder der Link ist ungültig."
        action={
          <a href={href('grows')} className="btn-primary">
            Zu den Growlogs
          </a>
        }
      />
    );
  }

  const t = today();
  const day = growDay(grow.startDate, t, grow.completedDate);
  const phase = currentPhase(grow.phaseDates, t);
  const spans = phaseSpans(grow.phaseDates, t, grow.completedDate);
  const currentSpan = spans.at(-1);
  const sortedPhotos = [...photos].sort((a, b) => b.takenAt.localeCompare(a.takenAt));
  const cover = grow.coverPhotoId ?? sortedPhotos[0]?.id;
  const expenseTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const lastActivity = [...activities].sort((a, b) => b.date.localeCompare(a.date))[0];

  // Neueste Messwerte je Größe
  const latest = METRICS.map((m) => ({ m, p: metricSeries(activities, m.key).at(-1) })).filter((x) => x.p);

  // Kalender-Markierungen: Aktivitäten, Fotos, Erinnerungen
  const grid = monthGrid(month);
  const markers = new Map<string, DayMarker[]>();
  const add = (d: string, mk: DayMarker) => markers.set(d, [...(markers.get(d) ?? []), mk]);
  for (const a of activities) add(a.date.slice(0, 10), { color: a.type === 'issue' ? '#fbbf24' : a.type === 'watering' ? '#38bdf8' : a.type === 'feeding' ? '#c084fc' : '#5fe39a', label: ACTIVITY_LABEL[a.type] });
  for (const p of photos) add(p.takenAt.slice(0, 10), { color: '#dfe7e3', label: 'Foto' });
  for (const o of occurrencesInRange(reminders, grid[0]!, grid[41]!)) add(o.date, { color: o.done ? '#5f6d68' : '#fb923c', label: `Erinnerung: ${o.reminder.title}` });
  for (const [p, d] of Object.entries(grow.phaseDates)) add(d!, { color: PHASE_COLOR[p as keyof typeof PHASE_COLOR], label: `Meilenstein` });
  const dayActs: Activity[] = selectedDay ? activities.filter((a) => a.date.startsWith(selectedDay)) : [];
  const dayPhotos = selectedDay ? photos.filter((p) => p.takenAt.startsWith(selectedDay)) : [];
  const dayReminders = selectedDay ? occurrencesInRange(reminders, selectedDay, selectedDay) : [];

  const filteredPhotos = photoPlant ? photos.filter((p) => p.plantId === photoPlant) : photos;

  return (
    <div>
      {/* Hero */}
      <section className="relative -mx-4 -mt-5 mb-6 overflow-hidden sm:mx-0 sm:mt-0 sm:rounded-2xl sm:border sm:border-white/[0.06] animate-fade-up">
        <div className="relative h-56 sm:h-72">
          <PhotoImg photoId={cover} variant="full" alt={`Titelbild ${grow.name}`} className="h-full w-full" />
          <div className="absolute inset-0 bg-gradient-to-t from-ink-950 via-ink-950/55 to-ink-950/10" />
        </div>
        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-6">
          <nav aria-label="Brotkrumen" className="mb-2 text-xs text-ink-300">
            <a href={href('grows')} className="hover:text-ink-50">
              Growlogs
            </a>
            <span className="mx-1.5 text-ink-500">/</span>
            <span className="text-ink-200">{grow.name}</span>
          </nav>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div className="min-w-0">
              <h1 className="truncate text-2xl font-semibold tracking-tight text-white sm:text-3xl">{grow.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                <PhaseChip phase={phase} />
                <Chip tone={grow.status === 'active' ? 'green' : grow.status === 'completed' ? 'sky' : 'neutral'}>{STATUS_LABEL[grow.status]}</Chip>
                <Chip>{SETTING_LABEL[grow.setting]}</Chip>
                {grow.medium && <Chip>{grow.medium}</Chip>}
                {grow.environment && <Chip>{grow.environment}</Chip>}
              </div>
            </div>
            <div className="flex shrink-0 items-stretch gap-2">
              <div className="rounded-xl border border-white/10 bg-black/45 px-4 py-2 text-center backdrop-blur">
                <div className="text-[10px] uppercase tracking-[0.14em] text-ink-400">{grow.completedDate ? 'Dauer' : 'Tag'}</div>
                <div className="font-mono text-3xl font-semibold leading-tight text-white">{day ?? '–'}</div>
                <div className="text-[10px] text-ink-400">seit {fmtDate(grow.startDate)}</div>
              </div>
              {currentSpan && (
                <div className="hidden rounded-xl border border-white/10 bg-black/45 px-4 py-2 text-center backdrop-blur sm:block">
                  <div className="text-[10px] uppercase tracking-[0.14em] text-ink-400">in Phase</div>
                  <div className="font-mono text-3xl font-semibold leading-tight text-white">{currentSpan.days}</div>
                  <div className="text-[10px] text-ink-400">Tage</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Aktionen */}
      <div className="mb-5 flex items-center gap-2 sm:flex-wrap">
        <button type="button" className="btn-primary" onClick={() => quick({ kind: 'log', growId })}>
          <NotebookPen className="size-4" /> Schnell-Log
        </button>
        <button type="button" className="btn-ghost" onClick={() => setModal('activity')}>
          <Plus className="size-4" /> Eintrag
        </button>
        <button type="button" className="btn-ghost hidden sm:inline-flex" onClick={() => setModal('photo')}>
          <Camera className="size-4" /> Fotos
        </button>
        <button type="button" className="btn-ghost hidden sm:inline-flex" onClick={() => quick({ kind: 'plant', growId })}>
          <Sprout className="size-4" /> Pflanze
        </button>
        <button type="button" className="btn-ghost hidden sm:inline-flex" onClick={() => setModal('edit')}>
          <Pencil className="size-4" /> Bearbeiten
        </button>
        <a href={href(`grows/${growId}/report`)} className="btn-ghost hidden sm:inline-flex">
          <FileText className="size-4" /> Bericht
        </a>
        <ShareButton store="grows" ids={[growId]} />
        <a href={href(`grows/${growId}/experiments`)} className="btn-ghost hidden sm:inline-flex">
          <FlaskConical className="size-4" /> Experimente
        </a>
        <div className="ml-auto">
          <StatusMenu
            grow={grow}
            extra={[
              { icon: <Camera className="size-4" />, label: 'Fotos hochladen', run: () => setModal('photo') },
              { icon: <Sprout className="size-4" />, label: 'Pflanze hinzufügen', run: () => quick({ kind: 'plant', growId }) },
              { icon: <Pencil className="size-4" />, label: 'Grow bearbeiten', run: () => setModal('edit') },
              { icon: <FileText className="size-4" />, label: 'Bericht', run: () => navigate(`grows/${growId}/report`) },
              { icon: <FlaskConical className="size-4" />, label: 'Experimente', run: () => navigate(`grows/${growId}/experiments`) },
            ]}
          />
        </div>
      </div>

      {/* Tabs */}
      <nav aria-label="Grow-Bereiche" className="no-print sticky top-[3.6rem] z-20 -mx-4 mb-6 border-b border-white/[0.05] bg-ink-950/85 px-4 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-10 lg:px-10">
        <div className="-mb-px flex gap-1 overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((x) => (
            <button
              key={x.id}
              type="button"
              aria-current={tab === x.id ? 'page' : undefined}
              onClick={() => setQuery(route, { tab: x.id === 'overview' ? undefined : x.id })}
              className={`flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${tab === x.id ? 'bg-white/[0.06] text-ink-50' : 'text-ink-400 hover:bg-white/[0.03] hover:text-ink-200'}`}
            >
              <span className={tab === x.id ? 'text-leaf-400' : ''}>{x.icon}</span>
              {x.label}
              {x.id === 'plants' && <span className="text-[11px] text-ink-500">{plants.length}</span>}
              {x.id === 'photos' && <span className="text-[11px] text-ink-500">{photos.length}</span>}
            </button>
          ))}
        </div>
      </nav>

      {tab === 'overview' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              ['Pflanzen', String(plants.length)],
              ['Fotos', String(photos.length)],
              ['Einträge', String(activities.length)],
              ['Ausgaben', money(expenseTotal, settings.currency)],
            ].map(([k, v]) => (
              <div key={k} className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
                <div className="text-xs text-ink-400">{k}</div>
                <div className="mt-1 truncate font-mono text-xl font-semibold tabular text-ink-50">{v}</div>
              </div>
            ))}
          </div>
          <Card title="Phasen" subtitle="Aus erfassten Meilensteinen berechnet – keine Prognose">
            <PhaseTimeline dates={grow.phaseDates} endDate={grow.completedDate} />
          </Card>
          <Card title="Dokumentation" subtitle="Was ist erfasst? Bestandsaufnahme, keine Bewertung des Grows">
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {growCompleteness(grow, { plants, activities, photos, expenses: data.expenses.filter((e) => e.growId === growId) }).map((c) => (
                <li key={c.id} className="flex items-start gap-2.5 rounded-xl border border-white/[0.05] bg-white/[0.015] px-3 py-2.5">
                  <span className={`mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-bold ${c.state === 'ok' ? 'bg-leaf-500/15 text-leaf-300' : c.state === 'partial' ? 'bg-amber-400/15 text-amber-300' : 'bg-white/[0.05] text-ink-400'}`} aria-hidden>
                    {c.state === 'ok' ? '✓' : c.state === 'partial' ? '◐' : '–'}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-[13px] text-ink-100">
                      {c.label}
                      <span className="sr-only">: {c.state === 'ok' ? 'vollständig' : c.state === 'partial' ? 'teilweise' : 'fehlt'}</span>
                    </span>
                    <span className="block text-[11px] text-ink-400">{c.detail}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Card>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
            <div className="space-y-5">
              <Card
                title="Pflanzen"
                icon={<Sprout className="size-4" />}
                actions={
                  <button type="button" className="btn-ghost py-1.5 text-xs" onClick={() => quick({ kind: 'plant', growId })}>
                    <Plus className="size-3.5" /> Pflanze
                  </button>
                }
              >
                {plants.length === 0 ? (
                  <EmptyState compact title="Noch keine Pflanzen" text="Jede Pflanze bekommt ein eigenes Profil mit Fotos und Messwerten." />
                ) : (
                  <div className="grid gap-2.5 sm:grid-cols-2">
                    {plants.map((p) => (
                      <PlantCard key={p.id} plant={p} growId={growId} />
                    ))}
                  </div>
                )}
              </Card>
              <Card
                title="Neueste Einträge"
                icon={<History className="size-4" />}
                actions={
                  <button type="button" className="btn-ghost py-1.5 text-xs" onClick={() => setQuery(route, { tab: 'log' })}>
                    Verlauf
                  </button>
                }
              >
                <ActivityTimeline activities={activities} growId={growId} limit={5} filterable={false} />
              </Card>
            </div>
            <div className="space-y-5">
              <Card title="Neueste Fotos" icon={<Images className="size-4" />} actions={<button type="button" className="btn-ghost py-1.5 text-xs" onClick={() => setQuery(route, { tab: 'photos' })}>Alle</button>}>
                {photos.length === 0 ? (
                  <EmptyState compact icon={<Camera />} title="Keine Fotos" action={<button type="button" className="btn-ghost" onClick={() => setModal('photo')}><Camera className="size-4" /> Fotos hinzufügen</button>} />
                ) : (
                  <PhotoGrid photos={sortedPhotos.slice(0, 9)} group={false} dense />
                )}
              </Card>
              <Card title="Letzte Messwerte" icon={<Ruler className="size-4" />}>
                {latest.length === 0 ? (
                  <p className="hint">Noch keine Messwerte erfasst.</p>
                ) : (
                  <dl className="grid grid-cols-2 gap-2">
                    {latest.map(({ m, p }) => (
                      <div key={m.key} className="rounded-lg border border-white/[0.06] bg-white/[0.015] px-3 py-2">
                        <dt className="text-[11px] text-ink-500">{m.label}</dt>
                        <dd className="font-mono text-[15px] tabular text-ink-50">
                          {fmt(p!.value)} <span className="text-xs text-ink-400">{m.unit}</span>
                        </dd>
                        <dd className="text-[10px] text-ink-500">{fmtDateTime(p!.date)}</dd>
                      </div>
                    ))}
                  </dl>
                )}
                {lastActivity && <p className="hint mt-3">Letzte Aktivität: {fmtDateTime(lastActivity.date)} ({daysBetween(lastActivity.date.slice(0, 10), t)} Tage her)</p>}
              </Card>
              <GrowTasksCard reminders={reminders} today={t} onAdd={() => setModal('reminder')} />
              <GrowStrainsCard plants={plants} strains={data.strains} />
              <GrowEquipmentCard plants={plants} inventory={data.inventory} />
              {(grow.description || grow.notes) && (
                <Card title="Notizen">
                  {grow.description && <p className="text-[13px] leading-relaxed text-ink-200">{grow.description}</p>}
                  {grow.notes && <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-400">{grow.notes}</p>}
                </Card>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'plants' && (
        <Card
          title="Pflanzen"
          subtitle={`${plants.length} in diesem Grow`}
          actions={
            <div className="flex gap-2">
              {plants.length > 0 && (
                <a href={href(`labels?grow=${encodeURIComponent(growId)}`)} className="btn-ghost py-1.5">
                  <QrCode className="size-4" /> Etiketten
                </a>
              )}
              <button type="button" className="btn-primary py-1.5" onClick={() => quick({ kind: 'plant', growId })}>
                <Plus className="size-4" /> Pflanze
              </button>
            </div>
          }
        >
          {plants.length === 0 ? (
            <EmptyState icon={<Sprout />} title="Noch keine Pflanzen" />
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {plants.map((p) => (
                <PlantCard key={p.id} plant={p} growId={growId} />
              ))}
            </div>
          )}
        </Card>
      )}

      {tab === 'photos' && (
        <Card
          title="Foto-Zeitleiste"
          subtitle={`${filteredPhotos.length} eigene Fotos`}
          actions={
            <>
              <a href={href(`photos?grow=${growId}&view=timelapse`)} className="btn-ghost py-1.5 text-xs">
                <Clapperboard className="size-3.5" /> Zeitraffer
              </a>
              <a href={href(`photos?grow=${growId}&view=compare`)} className="btn-ghost py-1.5 text-xs">
                <Columns2 className="size-3.5" /> Vergleich
              </a>
              <button type="button" className="btn-primary py-1.5 text-xs" onClick={() => setModal('photo')}>
                <Camera className="size-3.5" /> Hochladen
              </button>
            </>
          }
        >
          {plants.length > 0 && (
            <div className="mb-4 flex gap-1.5 overflow-x-auto [scrollbar-width:none]">
              {[{ id: '', name: 'Alle' }, ...plants].map((p) => (
                <button key={p.id} type="button" aria-pressed={photoPlant === p.id} onClick={() => setPhotoPlant(p.id)} className={`shrink-0 rounded-full border px-2.5 py-1 text-xs ${photoPlant === p.id ? 'border-leaf-500/40 bg-leaf-500/15 text-leaf-200' : 'border-white/[0.08] text-ink-400'}`}>
                  {p.name}
                </button>
              ))}
            </div>
          )}
          {filteredPhotos.length === 0 ? <EmptyState icon={<Camera />} title="Noch keine Fotos" /> : <PhotoGrid photos={filteredPhotos} />}
        </Card>
      )}

      {tab === 'log' && (
        <Card
          title="Verlauf"
          subtitle="Alle Einträge chronologisch"
          actions={
            <button type="button" className="btn-primary py-1.5" onClick={() => setModal('activity')}>
              <Plus className="size-4" /> Eintrag
            </button>
          }
        >
          <ActivityTimeline activities={activities} growId={growId} />
        </Card>
      )}

      {tab === 'measurements' && (
        <Card title="Messwerte" subtitle="Dokumentierte Werte je Pflanze bzw. für den ganzen Grow" actions={<ContextHelp ids={['ph-ec', 'klima-vpd', 'licht-ppfd-dli', 'mangel-erkennen']} />}>
          <MeasurementCharts activities={activities} thresholds={grow.thresholds} onEditThresholds={() => setModal('thresholds')} fileName={`grow-${grow.name}`} />
        </Card>
      )}

      {tab === 'calendar' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
          <Card
            title="Grow-Kalender"
            actions={
              <button type="button" className="btn-ghost py-1.5 text-xs" onClick={() => setModal('reminder')}>
                <Plus className="size-3.5" /> Erinnerung
              </button>
            }
          >
            <MonthCalendar month={month} onMonth={setMonth} markers={markers} selected={selectedDay} onSelect={setSelectedDay} />
            <div className="mt-4 flex flex-wrap gap-3 text-[11px] text-ink-400">
              {[
                ['#5fe39a', 'Eintrag'],
                ['#38bdf8', 'Gießen'],
                ['#c084fc', 'Düngen'],
                ['#fbbf24', 'Problem'],
                ['#dfe7e3', 'Foto'],
                ['#fb923c', 'Erinnerung'],
              ].map(([c, l]) => (
                <span key={l} className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full" style={{ background: c }} />
                  {l}
                </span>
              ))}
            </div>
          </Card>
          <Card title={selectedDay ? fmtDateLong(selectedDay) : 'Tag auswählen'} subtitle={selectedDay && day !== undefined ? `Tag ${daysBetween(grow.startDate, selectedDay) + 1} des Grows` : undefined}>
            {!selectedDay ? (
              <p className="hint">Einen Tag im Kalender antippen, um Einträge, Fotos und Erinnerungen zu sehen.</p>
            ) : dayActs.length + dayPhotos.length + dayReminders.length === 0 ? (
              <EmptyState compact title="Nichts an diesem Tag" action={<button type="button" className="btn-ghost" onClick={() => setModal('reminder')}><Plus className="size-4" /> Erinnerung</button>} />
            ) : (
              <div className="space-y-4">
                {dayReminders.map((o) => (
                  <div key={o.reminder.id} className="flex items-center justify-between rounded-lg border border-orange-300/15 bg-orange-300/[0.05] px-3 py-2 text-[13px]">
                    <span className="text-ink-100">{o.reminder.title}</span>
                    <span className="text-[11px] text-ink-400">{REMINDER_CATEGORY_LABEL[o.reminder.category]} {o.done ? '· erledigt' : ''}</span>
                  </div>
                ))}
                {dayActs.length > 0 && <ActivityTimeline activities={dayActs} growId={growId} filterable={false} />}
                {dayPhotos.length > 0 && <PhotoGrid photos={dayPhotos} group={false} dense />}
              </div>
            )}
          </Card>
        </div>
      )}

      {tab === 'expenses' && (
        <Card title="Ausgaben" subtitle="Für diesen Grow erfasste Kosten">
          <ExpenseList expenses={expenses} growId={growId} />
        </Card>
      )}

      {modal === 'edit' && <GrowFormModal open onClose={() => setModal(null)} grow={grow} />}
      {modal === 'thresholds' && <ThresholdsModal grow={grow} onClose={() => setModal(null)} />}
      {modal === 'activity' && <ActivityFormModal open onClose={() => setModal(null)} growId={growId} />}
      {modal === 'photo' && <PhotoUploadModal open onClose={() => setModal(null)} target={{ growId }} selectable />}
      {modal === 'reminder' && <ReminderFormModal open onClose={() => setModal(null)} growId={growId} date={selectedDay && selectedDay >= t ? selectedDay : addDays(t, 0)} />}
    </div>
  );
}
