import { Camera, Check, Leaf } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../app/DataProvider';
import { errorText, useToast } from '../../app/Toasts';
import { nowLocal } from '../../lib/dates';
import { currentDatabaseName } from '../../lib/db/database';
import { createRecord } from '../../lib/db/repo';
import { type ActivityType, OBSERVATION_KINDS, type ObservationKind } from '../../lib/db/types';
import { ACTIVITY_LABEL, OBSERVATION_LABEL } from '../../lib/grow/labels';
import { PhotoUploadModal } from '../photos/PhotoUpload';
import { Modal } from '../ui/Modal';
import { type MeasurementState, MeasurementFields, buildMeasurements, initialMeasurementState, measurementErrors } from './MeasurementFields';
import { t } from '../../i18n';

const TYPES: ActivityType[] = ['observation', 'measurement', 'watering', 'feeding', 'issue', 'custom'];

interface Draft {
  target: string;
  type: ActivityType;
  note: string;
  title: string;
  obs: ObservationKind[];
  ms: MeasurementState;
  date: string;
}

/** Entwurf nur in diesem Tab und nur für dieses Konto (Schlüssel = Kontodatenbank). */
const draftKey = () => `terpgrid.quicklog.${currentDatabaseName()}`;
function loadDraft(): Draft | null {
  try {
    const d = JSON.parse(sessionStorage.getItem(draftKey()) ?? 'null');
    return d && typeof d === 'object' && typeof d.target === 'string' ? (d as Draft) : null;
  } catch {
    return null;
  }
}

/**
 * Schnell-Log: Beobachtung, Messung, Pflege oder Notiz in wenigen Taps – optimiert für mobil.
 * Speichert lokal sofort (offline möglich) und synchronisiert danach; ein Entwurf bleibt erhalten,
 * wenn das Fenster versehentlich geschlossen wird.
 */
export function QuickLogModal({ onClose, plantId, growId }: { onClose: () => void; plantId?: string; growId?: string }) {
  const { data } = useData();
  const toast = useToast();
  const active = useMemo(() => new Set(data.grows.filter((g) => g.status === 'active').map((g) => g.id)), [data.grows]);
  // Pflanzen aktiver Grows, zuletzt dokumentierte zuerst
  const targets = useMemo(() => {
    const last = new Map<string, string>();
    for (const a of data.activities) if (a.plantId && a.date > (last.get(a.plantId) ?? '')) last.set(a.plantId, a.date);
    return data.plants.filter((p) => active.has(p.growId)).sort((a, b) => (last.get(b.id) ?? '').localeCompare(last.get(a.id) ?? '') || a.name.localeCompare(b.name, 'de'));
  }, [data.plants, data.activities, active]);
  const initialTarget = plantId ? `p:${plantId}` : growId ? `g:${growId}` : targets[0] ? `p:${targets[0].id}` : data.grows.find((g) => active.has(g.id)) ? `g:${data.grows.find((g) => active.has(g.id))!.id}` : '';
  const [draft, setDraft] = useState<Draft>(() => {
    const saved = loadDraft();
    return saved && (!plantId || saved.target === `p:${plantId}`) ? saved : { target: initialTarget, type: 'observation', note: '', title: '', obs: [], ms: initialMeasurementState(), date: nowLocal() };
  });
  const [restored] = useState(() => !!loadDraft());
  const [saving, setSaving] = useState(false);
  const [photoFor, setPhotoFor] = useState<{ growId: string; plantId?: string } | null>(null);

  useEffect(() => {
    try {
      sessionStorage.setItem(draftKey(), JSON.stringify(draft));
    } catch {
      /* Entwurf ist optional */
    }
  }, [draft]);

  const set = (p: Partial<Draft>) => setDraft((d) => ({ ...d, ...p }));
  const [kind, id] = draft.target.split(':') as ['p' | 'g', string];
  const plant = kind === 'p' ? data.plants.find((p) => p.id === id) : undefined;
  const gid = plant?.growId ?? (kind === 'g' ? id : undefined);
  const invalid = !gid || measurementErrors(draft.ms) > 0 || !draft.date;
  const measurements = buildMeasurements(draft.ms);
  const empty = !draft.note.trim() && !draft.title.trim() && !measurements && draft.obs.length === 0 && draft.type !== 'watering';

  async function save(withPhoto: boolean) {
    if (invalid || (empty && !withPhoto)) return;
    setSaving(true);
    try {
      if (!empty) {
        await createRecord('activities', {
          growId: gid!,
          plantId: plant?.id,
          type: draft.type,
          date: draft.date,
          title: draft.title.trim(),
          notes: draft.note.trim(),
          measurements,
          observations: draft.obs.length ? draft.obs : undefined,
        });
      }
      sessionStorage.removeItem(draftKey());
      toast(empty ? t('grow.quick.addPhoto') : t('grow.quick.saved', { type: ACTIVITY_LABEL[draft.type] }) + (navigator.onLine === false ? t('grow.quick.offline') : ''));
      if (withPhoto) setPhotoFor({ growId: gid!, plantId: plant?.id });
      else onClose();
    } catch (e) {
      toast(errorText(e), { tone: 'error' });
    } finally {
      setSaving(false);
    }
  }

  if (photoFor) return <PhotoUploadModal open onClose={onClose} target={photoFor} />;

  return (
    <Modal
      open
      onClose={onClose}
      title={t('grow.quick.title')}
      subtitle={restored ? t('grow.quick.draftRestored') : t('grow.quick.subtitle')}
      size="lg"
      footer={
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            className="btn-ghost"
            onClick={() => {
              sessionStorage.removeItem(draftKey());
              onClose();
            }}
          >
            {t('grow.quick.discard')}
          </button>
          <button type="button" className="btn-ghost" disabled={invalid || saving} onClick={() => save(true)}>
            <Camera className="size-4" /> {empty ? t('grow.quick.photoOnly') : t('grow.quick.savePhoto')}
          </button>
          <button type="button" className="btn-primary" disabled={invalid || empty || saving} onClick={() => save(false)}>
            <Check className="size-4" /> Speichern
          </button>
        </div>
      }
    >
      {!initialTarget && targets.length === 0 ? (
        <p className="text-[13px] text-ink-400">{t('grow.quick.needGrow')}</p>
      ) : (
        <div className="space-y-5">
          <fieldset>
            <legend className="label mb-1.5">{t('grow.quick.for')}</legend>
            <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:thin]">
              {targets.slice(0, 20).map((p) => {
                const on = draft.target === `p:${p.id}`;
                return (
                  <button key={p.id} type="button" aria-pressed={on} onClick={() => set({ target: `p:${p.id}` })} className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-[13px] ${on ? 'border-leaf-500/40 bg-leaf-500/15 text-leaf-100' : 'border-white/[0.08] text-ink-300'}`}>
                    <Leaf className="size-3.5" /> {p.name}
                    <span className="text-[11px] text-ink-500">{data.grows.find((g) => g.id === p.growId)?.name}</span>
                  </button>
                );
              })}
              {data.grows
                .filter((g) => active.has(g.id))
                .map((g) => {
                  const on = draft.target === `g:${g.id}`;
                  return (
                    <button key={g.id} type="button" aria-pressed={on} onClick={() => set({ target: `g:${g.id}` })} className={`min-h-11 shrink-0 rounded-xl border border-dashed px-3 text-[13px] ${on ? 'border-leaf-500/40 bg-leaf-500/15 text-leaf-100' : 'border-white/[0.1] text-ink-400'}`}>
                      Ganzer Grow: {g.name}
                    </button>
                  );
                })}
            </div>
          </fieldset>

          <fieldset>
            <legend className="label mb-1.5">{t('grow.quick.kind')}</legend>
            <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6">
              {TYPES.map((ty) => (
                <button key={ty} type="button" aria-pressed={draft.type === ty} onClick={() => set({ type: ty })} className={`min-h-11 rounded-xl border px-2 text-[12px] ${draft.type === ty ? 'border-leaf-500/40 bg-leaf-500/15 text-leaf-100' : 'border-white/[0.08] text-ink-300'}`}>
                  {ACTIVITY_LABEL[ty]}
                </button>
              ))}
            </div>
          </fieldset>

          {(draft.type === 'observation' || draft.type === 'issue') && (
            <fieldset>
              <legend className="label mb-1.5">{t('grow.quick.observedQ')}</legend>
              <div className="flex flex-wrap gap-1.5">
                {OBSERVATION_KINDS.map((k) => {
                  const on = draft.obs.includes(k);
                  return (
                    <button key={k} type="button" aria-pressed={on} onClick={() => set({ obs: on ? draft.obs.filter((x) => x !== k) : [...draft.obs, k] })} className={`min-h-9 rounded-full border px-3 text-[12px] ${on ? 'border-sky-400/40 bg-sky-400/10 text-sky-100' : 'border-white/[0.08] text-ink-400'}`}>
                      {OBSERVATION_LABEL[k]}
                    </button>
                  );
                })}
              </div>
              <p className="hint mt-1.5">{t('grow.quick.noDiagnosis')}</p>
            </fieldset>
          )}

          <label className="block space-y-1">
            <span className="label">{t('grow.quick.note')}</span>
            <textarea className="input-base min-h-[5.5rem]" value={draft.note} onChange={(e) => set({ note: e.target.value })} placeholder={draft.type === 'issue' ? t('grow.quick.issuePh') : t('grow.quick.notePh')} maxLength={4000} />
          </label>

          {(draft.type === 'measurement' || draft.type === 'watering' || draft.type === 'feeding') && (
            <fieldset className="rounded-xl border border-white/[0.06] p-3">
              <legend className="px-1 text-[13px] font-medium text-ink-200">{t('grow.quick.measurements')}</legend>
              <MeasurementFields state={draft.ms} onChange={(ms) => set({ ms })} />
            </fieldset>
          )}

          <label className="block space-y-1">
            <span className="label">{t('grow.quick.time')}</span>
            <input type="datetime-local" className="input-base" value={draft.date} onChange={(e) => set({ date: e.target.value })} />
          </label>
        </div>
      )}
    </Modal>
  );
}
