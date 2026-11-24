import {
  AlertTriangle,
  Camera,
  Droplets,
  Eye,
  FlaskRound,
  type LucideIcon,
  MoreHorizontal,
  Pencil,
  Ruler,
  Shovel,
  Sparkles,
  Thermometer,
  Trash2,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useConfirm } from '../../app/Confirm';
import { useLookup } from '../../app/DataProvider';
import { errorText, useToast } from '../../app/Toasts';
import { href } from '../../app/router';
import { fmtDateLong } from '../../lib/dates';
import { deleteSimple } from '../../lib/db/repo';
import { ACTIVITY_TYPES, type Activity, type ActivityType } from '../../lib/db/types';
import { ACTIVITY_LABEL, OBSERVATION_LABEL } from '../../lib/grow/labels';
import { METRICS } from '../../lib/grow/series';
import { CONTEXT_LABEL, EC_UNITS } from '../../lib/grow/measure';
import { fmt } from '../../lib/format';
import { ActivityFormModal } from '../forms/GrowForms';
import { PhotoImg } from '../photos/PhotoImg';
import { PhotoViewer } from '../photos/PhotoViewer';
import { EmptyState } from '../ui/EmptyState';

export const ACTIVITY_ICON: Record<ActivityType, LucideIcon> = {
  observation: Eye,
  photo: Camera,
  watering: Droplets,
  feeding: FlaskRound,
  repotting: Shovel,
  environment: Thermometer,
  measurement: Ruler,
  issue: AlertTriangle,
  custom: Sparkles,
};

const TONE: Partial<Record<ActivityType, string>> = {
  watering: 'text-sky-300 border-sky-400/20 bg-sky-400/[0.07]',
  feeding: 'text-violet-300 border-violet-400/20 bg-violet-400/[0.07]',
  issue: 'text-amber-300 border-amber-400/25 bg-amber-400/[0.08]',
  photo: 'text-leaf-300 border-leaf-500/20 bg-leaf-500/[0.07]',
  measurement: 'text-orange-200 border-orange-300/20 bg-orange-300/[0.06]',
};

function MeasurementPills({ a }: { a: Activity }) {
  const m = a.measurements;
  if (!m && a.volumeMl === undefined && !a.observations?.length) return null;
  const pills: string[] = [];
  if (a.volumeMl !== undefined) pills.push(`${fmt(a.volumeMl)} ml`);
  for (const d of METRICS) {
    const v = m?.[d.key];
    if (typeof v !== 'number') continue;
    const ctx = d.contextKey && m?.[d.contextKey] ? ` · ${CONTEXT_LABEL[m[d.contextKey]!]}` : '';
    const orig = d.key === 'ecMsCm' && m?.ecInput ? ` (${fmt(m.ecInput.value)} ${EC_UNITS.find((u) => u.id === m.ecInput!.unit)?.label})` : '';
    const est = d.key === 'leafTempC' && m?.leafTempEstimated ? ' geschätzt' : '';
    pills.push(`${d.label} ${fmt(v)}${d.unit ? ` ${d.unit}` : ''}${orig}${est}${ctx}`);
  }
  for (const c of m?.custom ?? []) pills.push(`${c.label} ${fmt(c.value)}${c.unit ? ` ${c.unit}` : ''}`);
  for (const o of a.observations ?? []) pills.push(OBSERVATION_LABEL[o]);
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {pills.map((p) => (
        <span key={p} className="rounded-md border border-white/[0.06] bg-white/[0.02] px-1.5 py-0.5 font-mono text-[11px] text-ink-200">
          {p}
        </span>
      ))}
    </div>
  );
}

function RowMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative" onBlur={(e) => !e.currentTarget.contains(e.relatedTarget as Node) && setOpen(false)}>
      <button type="button" className="btn-ghost border-transparent bg-transparent p-1.5" aria-label="Aktionen" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <MoreHorizontal className="size-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-20 mt-1 w-40 rounded-lg border border-white/[0.08] bg-ink-850 p-1 shadow-xl">
          <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-ink-200 hover:bg-white/[0.05]" onClick={() => { setOpen(false); onEdit(); }}>
            <Pencil className="size-3.5" /> Bearbeiten
          </button>
          <button type="button" role="menuitem" className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[13px] text-rose-300 hover:bg-rose-500/10" onClick={() => { setOpen(false); onDelete(); }}>
            <Trash2 className="size-3.5" /> Löschen
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Chronologische Zeitleiste aller Aktivitäten (neueste zuerst), nach Tagen gruppiert.
 * Jeder Eintrag ist bearbeit- und löschbar.
 */
export function ActivityTimeline({ activities, growId, showPlant = true, limit, filterable = true }: { activities: Activity[]; growId: string; showPlant?: boolean; limit?: number; filterable?: boolean }) {
  const lookup = useLookup();
  const toast = useToast();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<Activity | null>(null);
  const [filter, setFilter] = useState<ActivityType | 'all'>('all');
  const [viewer, setViewer] = useState<{ ids: string[]; index: number } | null>(null);

  const sorted = useMemo(
    () => [...activities].filter((a) => filter === 'all' || a.type === filter).sort((a, b) => b.date.localeCompare(a.date)),
    [activities, filter],
  );
  const shown = limit ? sorted.slice(0, limit) : sorted;
  const groups = useMemo(() => {
    const map = new Map<string, Activity[]>();
    for (const a of shown) map.set(a.date.slice(0, 10), [...(map.get(a.date.slice(0, 10)) ?? []), a]);
    return [...map.entries()];
  }, [shown]);
  const types = useMemo(() => ACTIVITY_TYPES.filter((t) => activities.some((a) => a.type === t)), [activities]);

  async function remove(a: Activity) {
    const ok = await confirm({
      title: 'Eintrag löschen?',
      message: `„${a.title || ACTIVITY_LABEL[a.type]}“ vom ${fmtDateLong(a.date.slice(0, 10))} wird entfernt. Verknüpfte Fotos bleiben erhalten.`,
      confirmLabel: 'Löschen',
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await deleteSimple('activities', a.id);
      toast('Eintrag gelöscht');
    } catch (e) {
      toast(errorText(e), { tone: 'error' });
    }
  }

  const viewerPhotos = viewer ? viewer.ids.map((id) => lookup.photo.get(id)).filter((p): p is NonNullable<typeof p> => !!p) : [];

  return (
    <div>
      {filterable && types.length > 1 && (
        <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
          {(['all', ...types] as const).map((t) => (
            <button
              key={t}
              type="button"
              aria-pressed={filter === t}
              onClick={() => setFilter(t)}
              className={`shrink-0 rounded-full border px-2.5 py-1 text-xs ${filter === t ? 'border-leaf-500/40 bg-leaf-500/15 text-leaf-200' : 'border-white/[0.08] text-ink-400 hover:text-ink-200'}`}
            >
              {t === 'all' ? 'Alle' : ACTIVITY_LABEL[t]}
            </button>
          ))}
        </div>
      )}
      {shown.length === 0 ? (
        <EmptyState compact title="Noch keine Einträge" text="Gießen, Düngen, Messungen, Beobachtungen – alles mit Zeitstempel." />
      ) : (
        <div className="space-y-5">
          {groups.map(([day, items]) => (
            <section key={day}>
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-ink-500">{fmtDateLong(day)}</h4>
              <ol className="relative space-y-2 before:absolute before:inset-y-2 before:left-[15px] before:w-px before:bg-white/[0.06]">
                {items.map((a) => {
                  const Icon = ACTIVITY_ICON[a.type];
                  const plant = a.plantId ? lookup.plant.get(a.plantId) : undefined;
                  const photos = (a.photoIds ?? []).filter((id) => lookup.photo.has(id));
                  return (
                    <li key={a.id} className="relative flex gap-3">
                      <span className={`relative z-10 mt-0.5 grid size-8 shrink-0 place-items-center rounded-full border ${TONE[a.type] ?? 'border-white/[0.08] bg-ink-850 text-ink-300'}`}>
                        <Icon className="size-3.5" />
                      </span>
                      <div className="min-w-0 flex-1 rounded-xl border border-white/[0.05] bg-white/[0.015] px-3.5 py-2.5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="text-[13px] font-medium text-ink-100">{a.title || ACTIVITY_LABEL[a.type]}</div>
                            <div className="text-[11px] text-ink-500">
                              {a.date.slice(11, 16)} · {ACTIVITY_LABEL[a.type]}
                              {showPlant && (
                                <>
                                  {' · '}
                                  {plant ? (
                                    <a className="hover:text-ink-200" href={href(`grows/${growId}/plants/${plant.id}`)}>
                                      {plant.name}
                                    </a>
                                  ) : (
                                    'ganzer Grow'
                                  )}
                                </>
                              )}
                            </div>
                          </div>
                          <RowMenu onEdit={() => setEditing(a)} onDelete={() => remove(a)} />
                        </div>
                        {a.notes && <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-300">{a.notes}</p>}
                        <MeasurementPills a={a} />
                        {photos.length > 0 && (
                          <div className="mt-2.5 flex gap-1.5 overflow-x-auto">
                            {photos.slice(0, 6).map((id, i) => (
                              <button key={id} type="button" className="size-16 shrink-0 overflow-hidden rounded-lg border border-white/[0.06]" onClick={() => setViewer({ ids: photos, index: i })} aria-label="Foto öffnen">
                                <PhotoImg photoId={id} alt="" className="h-full w-full" />
                              </button>
                            ))}
                            {photos.length > 6 && <span className="grid size-16 shrink-0 place-items-center rounded-lg border border-white/[0.06] text-xs text-ink-400">+{photos.length - 6}</span>}
                          </div>
                        )}
                      </div>
                    </li>
                  );
                })}
              </ol>
            </section>
          ))}
          {limit && sorted.length > limit && <p className="hint text-center">{sorted.length - limit} ältere Einträge im Verlauf</p>}
        </div>
      )}
      {editing && <ActivityFormModal open onClose={() => setEditing(null)} activity={editing} growId={growId} />}
      {viewer && viewerPhotos.length > 0 && <PhotoViewer photos={viewerPhotos} index={Math.min(viewer.index, viewerPhotos.length - 1)} onIndex={(i) => setViewer({ ...viewer, index: i })} onClose={() => setViewer(null)} />}
    </div>
  );
}
