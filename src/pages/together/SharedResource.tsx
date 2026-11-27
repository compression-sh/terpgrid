import { Camera, Download, EyeOff, FileText, ImageOff, Loader2, Lock, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { type ReactNode, useEffect, useState } from 'react';
import { useConfirm } from '../../app/Confirm';
import { useLoad, useSpaceSession } from '../../app/collab';
import { href, navigate } from '../../app/router';
import { errorText, useToast } from '../../app/Toasts';
import { CommentsPanel } from '../../components/collab/Comments';
import { AccessBadge, OriginBadge, SectionTitle, relTime } from '../../components/collab/ui';
import { MeasurementCharts } from '../../components/grow/MeasurementCharts';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { type Access, type SpaceStore, collab } from '../../lib/collab/api';
import { ACCESS_HINT, ACCESS_LABEL, STORE_SINGULAR, entryTitle } from '../../lib/collab/labels';
import { type SpaceEntry, type SpaceSession, newSpaceId } from '../../lib/collab/spaceSync';
import type { Activity, ActivityType } from '../../lib/db/types';
import { ACTIVITY_TYPES } from '../../lib/db/types';
import { ACTIVITY_LABEL, INVENTORY_CATEGORY_LABEL, SETTING_LABEL } from '../../lib/grow/labels';
import { processImage } from '../../lib/media/images';
import { intlLocale } from '../../i18n';

/* ───────────── Fotos (autorisiert, nur im Arbeitsspeicher) ───────────── */

const urlCache = new Map<string, Promise<string>>();
function spacePhotoUrl(spaceId: string, id: string, variant: 'thumb' | 'full'): Promise<string> {
  const key = `${spaceId}/${id}/${variant}`;
  let p = urlCache.get(key);
  if (!p) {
    p = collab.file(spaceId, 'photo', id, variant).then((buf) => URL.createObjectURL(new Blob([buf])));
    p.catch(() => urlCache.delete(key));
    urlCache.set(key, p);
  }
  return p;
}

function SpacePhoto({ spaceId, id, alt, variant = 'thumb', className = '' }: { spaceId: string; id: string; alt: string; variant?: 'thumb' | 'full'; className?: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let alive = true;
    spacePhotoUrl(spaceId, id, variant)
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [spaceId, id, variant]);
  if (failed)
    return (
      <span className={`grid place-items-center bg-ink-800 text-ink-500 ${className}`} role="img" aria-label="Foto nicht verfügbar">
        <ImageOff className="size-5" />
      </span>
    );
  if (!url) return <span className={`skeleton block ${className}`} />;
  return <img src={url} alt={alt} className={`object-cover ${className}`} loading="lazy" />;
}

/* ───────────── Editor (anlegen/bearbeiten) ───────────── */

type F = { key: string; label: string; type?: 'text' | 'textarea' | 'date' | 'number' | 'select'; options?: [string, string][]; required?: boolean };
const FIELDS: Partial<Record<SpaceStore, F[]>> = {
  grows: [
    { key: 'name', label: 'Name', required: true },
    { key: 'description', label: 'Beschreibung', type: 'textarea' },
    { key: 'startDate', label: 'Start', type: 'date' },
    { key: 'setting', label: 'Umgebung', type: 'select', options: Object.entries(SETTING_LABEL) },
    { key: 'medium', label: 'Medium' },
    { key: 'notes', label: 'Notizen', type: 'textarea' },
  ],
  plants: [
    { key: 'name', label: 'Name', required: true },
    { key: 'strainName', label: 'Sorte' },
    { key: 'startDate', label: 'Start', type: 'date' },
    { key: 'notes', label: 'Notizen', type: 'textarea' },
  ],
  strains: [
    { key: 'name', label: 'Name', required: true },
    { key: 'breeder', label: 'Breeder' },
    { key: 'genetics', label: 'Genetik' },
    { key: 'flavorNotes', label: 'Aroma & Geschmack', type: 'textarea' },
    { key: 'observations', label: 'Beobachtungen', type: 'textarea' },
  ],
  journal: [
    { key: 'date', label: 'Datum', type: 'date', required: true },
    { key: 'strainName', label: 'Sorte' },
    { key: 'notes', label: 'Notizen', type: 'textarea' },
  ],
  inventory: [
    { key: 'name', label: 'Name', required: true },
    { key: 'category', label: 'Kategorie', type: 'select', options: Object.entries(INVENTORY_CATEGORY_LABEL) },
    { key: 'manufacturer', label: 'Hersteller' },
    { key: 'notes', label: 'Notizen', type: 'textarea' },
  ],
  notes: [
    { key: 'title', label: 'Titel', required: true },
    { key: 'text', label: 'Notiz', type: 'textarea' },
  ],
  tasks: [
    { key: 'title', label: 'Aufgabe', required: true },
    { key: 'date', label: 'Fällig am', type: 'date' },
    { key: 'notes', label: 'Details', type: 'textarea' },
  ],
  labReports: [
    { key: 'title', label: 'Titel', required: true },
    { key: 'labName', label: 'Labor' },
    { key: 'testDate', label: 'Testdatum', type: 'date' },
    { key: 'notes', label: 'Notizen', type: 'textarea' },
  ],
};
const DEFAULTS: Partial<Record<SpaceStore, Record<string, unknown>>> = {
  grows: { status: 'active', setting: 'indoor', phaseDates: {}, notes: '', description: '' },
  plants: { type: 'unknown', phaseDates: {}, notes: '' },
  strains: { terpenes: [], aromas: [], flavorNotes: '', observations: '', favorite: false },
  journal: { method: 'other', moods: [], durationNote: '', notes: '' },
  inventory: { category: 'other', unit: 'Stück', notes: '' },
  tasks: { category: 'other', repeat: { kind: 'none' }, completedDates: [], notes: '' },
  notes: { text: '' },
  labReports: { unit: 'percent', origin: 'lab', terpenes: [], notes: '' },
};

export function EntryEditor({
  spaceId,
  session,
  store,
  entry,
  parent,
  onClose,
  onSaved,
}: {
  spaceId: string;
  session: SpaceSession;
  store: SpaceStore;
  entry?: SpaceEntry;
  parent?: Record<string, string>;
  onClose: () => void;
  onSaved?: (id: string) => void;
}) {
  const toast = useToast();
  const fields = FIELDS[store] ?? [];
  const today = new Date().toISOString().slice(0, 10);
  const [values, setValues] = useState<Record<string, unknown>>(() => entry?.data ?? { ...(DEFAULTS[store] ?? {}), ...(parent ?? {}), ...(store === 'journal' ? { date: new Date().toISOString() } : {}), ...(['grows', 'plants'].includes(store) ? { startDate: today } : {}) });
  void spaceId;
  const valid = fields.every((f) => !f.required || String(values[f.key] ?? '').trim());
  const save = () => {
    try {
      const id = entry?.id ?? newSpaceId();
      session.save(store, { ...values, id });
      onSaved?.(id);
      onClose();
    } catch (e) {
      toast(errorText(e), { tone: 'error' });
    }
  };
  return (
    <Modal
      open
      onClose={onClose}
      title={`${STORE_SINGULAR[store]} ${entry ? 'bearbeiten' : 'anlegen'}`}
      subtitle="Wird im Bereich mit dem Bereichsschlüssel gespeichert – nicht in deinen privaten Daten."
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn-primary" disabled={!valid} onClick={save}>
            Speichern
          </button>
        </>
      }
    >
      <div className="space-y-3">
        {fields.map((f) => {
          const v = values[f.key];
          const str = f.type === 'date' && typeof v === 'string' ? v.slice(0, 10) : ((v as string | number | undefined) ?? '');
          const set = (x: string) => setValues((cur) => ({ ...cur, [f.key]: f.type === 'date' && f.key === 'date' && store === 'journal' ? new Date(`${x}T12:00:00`).toISOString() : x }));
          return (
            <label key={f.key} className="block space-y-1.5">
              <span className="label">
                {f.label}
                {f.required && <span className="text-rose-300"> *</span>}
              </span>
              {f.type === 'textarea' ? (
                <textarea className="input-base min-h-20 resize-y" maxLength={5000} value={String(str)} onChange={(e) => set(e.target.value)} />
              ) : f.type === 'select' ? (
                <select className="input-base" value={String(str)} onChange={(e) => set(e.target.value)}>
                  {f.options!.map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </select>
              ) : (
                <input className="input-base" type={f.type === 'date' ? 'date' : 'text'} maxLength={200} value={String(str)} onChange={(e) => set(e.target.value)} />
              )}
            </label>
          );
        })}
      </div>
    </Modal>
  );
}

function ActivityEditor({ session, parent, onClose }: { session: SpaceSession; parent: { growId?: string; plantId?: string }; onClose: () => void }) {
  const [type, setType] = useState<ActivityType>('observation');
  const [title, setTitle] = useState('');
  const [notes, setNotes] = useState('');
  const [m, setM] = useState<Record<string, string>>({});
  const num = (k: string) => (m[k] && Number.isFinite(Number(m[k].replace(',', '.'))) ? Number(m[k].replace(',', '.')) : undefined);
  const save = () => {
    const measurements = Object.fromEntries(
      [
        ['heightCm', num('heightCm')],
        ['temperatureC', num('temperatureC')],
        ['humidityPct', num('humidityPct')],
        ['ph', num('ph')],
        ['ecMsCm', num('ecMsCm')],
      ].filter(([, v]) => v !== undefined),
    );
    session.save('activities', { id: newSpaceId(), ...parent, type, title, notes, date: new Date().toISOString(), ...(Object.keys(measurements).length ? { measurements } : {}) });
    onClose();
  };
  return (
    <Modal
      open
      onClose={onClose}
      title="Eintrag hinzufügen"
      subtitle="Beobachtung, Messung oder Pflege – sichtbar für alle, die diesen Grow sehen dürfen."
      footer={
        <>
          <button type="button" className="btn-ghost" onClick={onClose}>
            Abbrechen
          </button>
          <button type="button" className="btn-primary" onClick={save}>
            Speichern
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <label className="block space-y-1.5">
          <span className="label">Art</span>
          <select className="input-base" value={type} onChange={(e) => setType(e.target.value as ActivityType)}>
            {ACTIVITY_TYPES.filter((t) => t !== 'photo').map((t) => (
              <option key={t} value={t}>
                {ACTIVITY_LABEL[t]}
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="label">Titel</span>
          <input className="input-base" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="block space-y-1.5">
          <span className="label">Notizen</span>
          <textarea className="input-base min-h-20 resize-y" maxLength={5000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
          {(
            [
              ['heightCm', 'Höhe cm'],
              ['temperatureC', 'Temp. °C'],
              ['humidityPct', 'rF %'],
              ['ph', 'pH'],
              ['ecMsCm', 'EC mS/cm'],
            ] as const
          ).map(([k, l]) => (
            <label key={k} className="block space-y-1">
              <span className="text-[11.5px] text-ink-400">{l}</span>
              <input className="input-base" inputMode="decimal" value={m[k] ?? ''} onChange={(e) => setM({ ...m, [k]: e.target.value })} />
            </label>
          ))}
        </div>
      </div>
    </Modal>
  );
}

/* ───────────── Detailansicht ───────────── */

export function SharedResourcePage({ spaceId, store, id }: { spaceId: string; store: SpaceStore; id: string }) {
  const toast = useToast();
  const confirm = useConfirm();
  const session = useSpaceSession(spaceId);
  const detail = useLoad(() => collab.space(spaceId), [spaceId]);
  const [editing, setEditing] = useState(false);
  const [child, setChild] = useState<SpaceStore | 'activity' | null>(null);
  const [uploading, setUploading] = useState(false);
  const e = session?.get(store, id);
  const perms = detail.data?.permissions ?? {};
  const role = detail.data?.space.role;
  const canWrite = !!e && !!role && (role === 'owner' || (perms['resource.update'] && e.access !== 'readonly'));

  // Bereichsdaten ändern sich in der Sitzung (Rendering über useSpaceSession) – günstig zu berechnen
  const plants = session && store === 'grows' ? session.list('plants').filter((p) => p.data.growId === id) : [];
  const activities = session ? session.list('activities').filter((a) => (store === 'grows' ? a.data.growId === id : store === 'plants' ? a.data.plantId === id : false)) : [];
  const photoOf: Partial<Record<SpaceStore, string>> = { grows: 'growId', plants: 'plantId', journal: 'journalId', strains: 'strainId', inventory: 'inventoryId' };
  const photos = session && photoOf[store] ? session.list('photos').filter((p) => p.data[photoOf[store]!] === id) : [];
  const notes = session && store === 'grows' ? [...session.list('notes'), ...session.list('tasks')].filter((n) => n.data.growId === id) : [];

  if (!session || session.state.phase === 'loading' || !detail.data) return <div className="skeleton h-72" />;
  if (session.state.phase === 'revoked' || detail.error) return <EmptyState icon={<Lock />} title="Kein Zugriff" text="Dieser Eintrag ist für dich nicht (mehr) sichtbar." action={<a className="btn-primary" href={href('together')}>Zur Übersicht</a>} />;
  if (!e)
    return (
      <EmptyState
        icon={<EyeOff />}
        title="Eintrag nicht verfügbar"
        text="Dieser Eintrag wurde gelöscht oder ist für deine Rolle nicht freigegeben."
        action={
          <a className="btn-primary" href={href(`together/spaces/${spaceId}`)}>
            Zum Bereich
          </a>
        }
      />
    );

  const remove = async () => {
    const ok = await confirm({
      title: `${STORE_SINGULAR[store]} löschen?`,
      message: `„${entryTitle(store, e.data)}“ wird für alle Mitglieder gelöscht${store === 'grows' || store === 'plants' ? ' – einschließlich zugehöriger Pflanzen, Einträge und Fotos' : ''}. Kommentare werden ausgeblendet. Exportierte Kopien anderer Mitglieder bleiben bei ihnen.`,
      confirmLabel: 'Löschen',
      tone: 'danger',
    });
    if (!ok) return;
    session.remove(store, id);
    navigate(`together/spaces/${spaceId}`);
  };
  const setAccess = async (access: Access) => {
    try {
      await collab.setAccess(spaceId, store, id, access);
      await session.syncNow();
      toast(`Zugriffsstufe: ${ACCESS_LABEL[access]}`);
    } catch (err) {
      toast(errorText(err), { tone: 'error' });
    }
  };
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setUploading(true);
    try {
      for (const file of [...files].slice(0, 10)) {
        const img = await processImage(file);
        const pid = newSpaceId();
        const link = store === 'grows' ? { growId: id } : store === 'plants' ? { plantId: id, ...(e.data.growId ? { growId: e.data.growId as string } : {}) } : store === 'journal' ? { journalId: id } : store === 'strains' ? { strainId: id } : { inventoryId: id };
        session.save('photos', { id: pid, ...link, takenAt: img.takenAt, note: '', width: img.width, height: img.height, size: img.full.byteLength, mime: img.mime });
        await session.syncNow();
        if (session.get('photos', pid)?.pending) throw new Error('Foto-Eintrag konnte nicht gespeichert werden (offline?).');
        await collab.uploadFile(spaceId, 'photo', pid, 'full', img.full, img.mime);
        await collab.uploadFile(spaceId, 'photo', pid, 'thumb', img.thumb, img.mime);
      }
      toast('Fotos hochgeladen');
    } catch (err) {
      toast(errorText(err), { tone: 'error' });
    } finally {
      setUploading(false);
    }
  };
  const parentGrow = store === 'plants' && typeof e.data.growId === 'string' ? session.get('grows', e.data.growId) : undefined;
  const canPhotos = ['grows', 'plants', 'journal', 'strains', 'inventory'].includes(store);

  return (
    <div className="space-y-5">
      <PageHeader
        crumbs={[{ label: 'Gemeinsam', to: 'together' }, { label: detail.data.space.name, to: `together/spaces/${spaceId}` }, ...(parentGrow ? [{ label: entryTitle('grows', parentGrow.data), to: `together/spaces/${spaceId}/grows/${parentGrow.id}` }] : []), { label: entryTitle(store, e.data) }]}
        title={entryTitle(store, e.data)}
        subtitle={STORE_SINGULAR[store]}
        meta={
          <div className="flex flex-wrap gap-1.5">
            <OriginBadge origin={e.origin} />
            <AccessBadge access={e.access} />
            {e.updatedAt && <span className="text-[11.5px] text-ink-500">geändert {relTime(e.updatedAt)}</span>}
            {e.pending && <span className="text-[11.5px] text-amber-300">wartet auf Abgleich</span>}
          </div>
        }
        actions={
          canWrite && (
            <div className="flex gap-2">
              <button type="button" className="btn-ghost" onClick={() => setEditing(true)}>
                <Pencil className="size-4" /> Bearbeiten
              </button>
              <button type="button" className="btn-ghost p-2" aria-label="Löschen" onClick={remove}>
                <Trash2 className="size-4" />
              </button>
            </div>
          )
        }
      />
      {e.origin === 'copy' && <p className="text-[12px] text-ink-400">Geteilte Kopie: unabhängig vom privaten Original – spätere private Änderungen werden nicht übertragen.</p>}

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="space-y-5">
          <section className="card p-4 sm:p-5" aria-label="Details">
            <Details store={store} data={e.data} spaceId={spaceId} />
          </section>

          {store === 'grows' && (
            <section className="card p-4 sm:p-5" aria-label="Pflanzen">
              <SectionTitle action={canWrite && <button type="button" className="btn-ghost py-1 text-[12px]" onClick={() => setChild('plants')}><Plus className="size-3.5" /> Pflanze</button>}>Pflanzen ({plants.length})</SectionTitle>
              {plants.length === 0 ? (
                <p className="text-[12.5px] text-ink-400">Keine Pflanzen.</p>
              ) : (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {plants.map((p) => (
                    <li key={p.id}>
                      <a className="block rounded-xl border border-white/[0.06] px-3 py-2 hover:border-white/[0.12]" href={href(`together/spaces/${spaceId}/plants/${encodeURIComponent(p.id)}`)}>
                        <span className="block truncate text-[13px] font-medium text-ink-100">{entryTitle('plants', p.data)}</span>
                        <span className="block truncate text-[11.5px] text-ink-400">{(p.data.strainName as string) || 'Sorte unbekannt'}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {(store === 'grows' || store === 'plants') && (
            <section className="card p-4 sm:p-5" aria-label="Einträge">
              <SectionTitle action={canWrite && <button type="button" className="btn-ghost py-1 text-[12px]" onClick={() => setChild('activity')}><Plus className="size-3.5" /> Eintrag</button>}>Einträge ({activities.length})</SectionTitle>
              {activities.some((a) => (a.data as unknown as Activity).measurements) && (
                <div className="mb-4">
                  <MeasurementCharts activities={activities.map((a) => a.data as unknown as Activity)} splitByPlant={store === 'grows'} fileName="messwerte-bereich" plantName={(pid) => (session.get('plants', pid) ? entryTitle('plants', session.get('plants', pid)!.data) : undefined)} />
                </div>
              )}
              {activities.length === 0 ? (
                <p className="text-[12.5px] text-ink-400">Noch keine Einträge.</p>
              ) : (
                <ol className="space-y-2">
                  {activities
                    .sort((a, b) => String(b.data.date ?? '').localeCompare(String(a.data.date ?? '')))
                    .slice(0, 50)
                    .map((a) => {
                      const act = a.data as unknown as Activity;
                      const meas = act.measurements;
                      return (
                        <li key={a.id} className="rounded-xl border border-white/[0.05] bg-white/[0.015] px-3 py-2">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="text-[13px] font-medium text-ink-100">{act.title || ACTIVITY_LABEL[act.type] || 'Eintrag'}</span>
                            <span className="text-[11.5px] text-ink-500">{new Date(act.date).toLocaleString(intlLocale(), { dateStyle: 'medium', timeStyle: 'short' })}</span>
                          </div>
                          {act.notes && <p className="mt-0.5 whitespace-pre-wrap text-[12.5px] text-ink-300">{act.notes}</p>}
                          {meas && (
                            <p className="mt-1 font-mono text-[11.5px] tabular text-ink-400">
                              {[meas.heightCm !== undefined && `${meas.heightCm} cm`, meas.temperatureC !== undefined && `${meas.temperatureC} °C`, meas.humidityPct !== undefined && `${meas.humidityPct} % rF`, meas.ph !== undefined && `pH ${meas.ph}`, meas.ecMsCm !== undefined && `EC ${meas.ecMsCm}`]
                                .filter(Boolean)
                                .join(' · ')}
                            </p>
                          )}
                          <a href={href(`together/spaces/${spaceId}/activities/${encodeURIComponent(a.id)}`)} className="mt-1 inline-flex text-[11.5px] text-leaf-300 hover:underline">
                            Kommentare
                          </a>
                        </li>
                      );
                    })}
                </ol>
              )}
            </section>
          )}

          {canPhotos && (
            <section className="card p-4 sm:p-5" aria-label="Fotos">
              <SectionTitle
                action={
                  canWrite && (
                    <label className="btn-ghost cursor-pointer py-1 text-[12px]">
                      {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Camera className="size-3.5" />} Fotos hinzufügen
                      <input type="file" accept="image/*" multiple className="sr-only" disabled={uploading} onChange={(ev) => void upload(ev.target.files)} />
                    </label>
                  )
                }
              >
                Fotos ({photos.length})
              </SectionTitle>
              {photos.length === 0 ? (
                <p className="text-[12.5px] text-ink-400">Keine Fotos.</p>
              ) : (
                <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                  {photos.map((p) => (
                    <a key={p.id} href={href(`together/spaces/${spaceId}/photos/${encodeURIComponent(p.id)}`)} className="block overflow-hidden rounded-lg border border-white/[0.06]">
                      <SpacePhoto spaceId={spaceId} id={p.id} alt={(p.data.note as string) || 'Foto'} className="aspect-square w-full" />
                    </a>
                  ))}
                </div>
              )}
            </section>
          )}

          {store === 'grows' && notes.length > 0 && (
            <section className="card p-4 sm:p-5" aria-label="Notizen und Aufgaben">
              <SectionTitle>Notizen & Aufgaben</SectionTitle>
              <ul className="space-y-1.5">
                {notes.map((n) => (
                  <li key={n.id}>
                    <a className="text-[13px] text-ink-200 hover:text-leaf-200" href={href(`together/spaces/${spaceId}/${n.store}/${encodeURIComponent(n.id)}`)}>
                      {STORE_SINGULAR[n.store]}: {entryTitle(n.store, n.data)}
                    </a>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>

        <div className="space-y-5">
          {role === 'owner' && !e.data.growId && !e.data.plantId && store !== 'activities' && store !== 'photos' && (
            <section className="card space-y-2 p-4" aria-label="Zugriffsstufe">
              <SectionTitle>Zugriffsstufe</SectionTitle>
              {(['members', 'editors', 'readonly'] as Access[]).map((a) => (
                <label key={a} className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2 ${e.access === a ? 'border-leaf-500/40 bg-leaf-500/[0.07]' : 'border-white/[0.06] hover:border-white/[0.12]'}`}>
                  <input type="radio" name="access" className="mt-1 accent-[var(--color-leaf-400)]" checked={e.access === a} onChange={() => void setAccess(a)} />
                  <span>
                    <span className="flex items-center gap-1.5 text-[13px] font-medium text-ink-100">
                      {a === 'members' ? <Users className="size-3.5" /> : a === 'editors' ? <EyeOff className="size-3.5" /> : <Lock className="size-3.5" />} {ACCESS_LABEL[a]}
                    </span>
                    <span className="block text-[11.5px] text-ink-400">{ACCESS_HINT[a]}</span>
                  </span>
                </label>
              ))}
              <p className="hint">Gilt auch für alle zugehörigen Pflanzen, Einträge, Fotos und Kommentare.</p>
            </section>
          )}
          <section className="card p-4 sm:p-5">
            <CommentsPanel spaceId={spaceId} store={store} target={id} />
          </section>
        </div>
      </div>

      {editing && <EntryEditor spaceId={spaceId} session={session} store={store} entry={e} onClose={() => setEditing(false)} />}
      {child === 'plants' && <EntryEditor spaceId={spaceId} session={session} store="plants" parent={{ growId: id }} onClose={() => setChild(null)} />}
      {child === 'activity' && <ActivityEditor session={session} parent={store === 'grows' ? { growId: id } : { plantId: id, ...(e.data.growId ? { growId: e.data.growId as string } : {}) }} onClose={() => setChild(null)} />}
    </div>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[8rem_1fr] gap-3 py-1.5 text-[13px]">
      <dt className="text-ink-400">{label}</dt>
      <dd className="min-w-0 whitespace-pre-wrap break-words text-ink-100">{children}</dd>
    </div>
  );
}

function Details({ store, data, spaceId }: { store: SpaceStore; data: Record<string, unknown>; spaceId: string }) {
  const s = (k: string) => (typeof data[k] === 'string' && data[k] ? (data[k] as string) : null);
  const date = (k: string) => (s(k) ? new Date(s(k)!).toLocaleDateString(intlLocale()) : null);
  if (store === 'photos')
    return (
      <div className="space-y-3">
        <SpacePhoto spaceId={spaceId} id={String(data.id)} alt={s('note') ?? 'Foto'} variant="full" className="max-h-[70vh] w-full rounded-lg object-contain" />
        {s('note') && <p className="text-[13px] text-ink-200">{s('note')}</p>}
        <p className="text-[12px] text-ink-500">{date('takenAt')}</p>
      </div>
    );
  const rows: [string, ReactNode][] = [];
  const add = (label: string, v: ReactNode) => v !== null && v !== undefined && v !== '' && rows.push([label, v]);
  switch (store) {
    case 'grows':
      add('Beschreibung', s('description'));
      add('Start', date('startDate'));
      add('Umgebung', s('setting') && SETTING_LABEL[s('setting') as keyof typeof SETTING_LABEL]);
      add('Medium', s('medium'));
      add('Notizen', s('notes'));
      break;
    case 'plants':
      add('Sorte', s('strainName'));
      add('Start', date('startDate'));
      add('Notizen', s('notes'));
      break;
    case 'activities':
      add('Art', s('type') && ACTIVITY_LABEL[s('type') as ActivityType]);
      add('Datum', date('date'));
      add('Notizen', s('notes'));
      break;
    case 'strains':
      add('Breeder', s('breeder'));
      add('Genetik', s('genetics'));
      add('Terpene', Array.isArray(data.terpenes) && data.terpenes.length ? (data.terpenes as { name: string }[]).map((t) => t.name).join(', ') : null);
      add('Aromen', Array.isArray(data.aromas) && data.aromas.length ? (data.aromas as string[]).join(', ') : null);
      add('Aroma & Geschmack', s('flavorNotes'));
      add('Beobachtungen', s('observations'));
      break;
    case 'journal':
      add('Datum', date('date'));
      add('Sorte', s('strainName'));
      add('Notizen', s('notes'));
      break;
    case 'inventory':
      add('Kategorie', s('category') && INVENTORY_CATEGORY_LABEL[s('category') as keyof typeof INVENTORY_CATEGORY_LABEL]);
      add('Hersteller', s('manufacturer'));
      add('Modell', s('model'));
      add('Menge', typeof data.quantity === 'number' ? `${data.quantity} ${s('unit') ?? ''}` : null);
      add('Notizen', s('notes'));
      break;
    case 'labReports':
      add('Labor', s('labName'));
      add('Testdatum', date('testDate'));
      add('THC / THCA', [data.thc, data.thca].some((x) => typeof x === 'number') ? `${data.thc ?? '–'} / ${data.thca ?? '–'}` : null);
      add('CBD / CBDA', [data.cbd, data.cbda].some((x) => typeof x === 'number') ? `${data.cbd ?? '–'} / ${data.cbda ?? '–'}` : null);
      add('Terpene', Array.isArray(data.terpenes) && data.terpenes.length ? (data.terpenes as { name: string; value: number }[]).map((t) => `${t.name} ${t.value}`).join(', ') : null);
      add('Notizen', s('notes'));
      if (s('documentId'))
        add(
          'Dokument',
          <button
            type="button"
            className="inline-flex items-center gap-1 text-leaf-300 hover:underline"
            onClick={async () => {
              const buf = await collab.file(spaceId, 'labdoc', s('documentId')!, 'doc');
              const a = document.createElement('a');
              a.href = URL.createObjectURL(new Blob([buf], { type: s('documentMime') ?? 'application/octet-stream' }));
              a.download = s('documentName') ?? 'laborbericht';
              a.click();
              setTimeout(() => URL.revokeObjectURL(a.href), 2000);
            }}
          >
            <Download className="size-3.5" /> {s('documentName') ?? 'Herunterladen'}
          </button>,
        );
      break;
    case 'notes':
      add('Notiz', s('text'));
      break;
    case 'tasks':
      add('Fällig', date('date'));
      add('Erledigt', Array.isArray(data.completedDates) && data.completedDates.length ? 'ja' : 'nein');
      add('Details', s('notes'));
      break;
  }
  if (!rows.length) return <p className="flex items-center gap-2 text-[12.5px] text-ink-400"><FileText className="size-4" /> Keine weiteren Angaben.</p>;
  return (
    <dl className="divide-y divide-white/[0.04]">
      {rows.map(([l, v]) => (
        <Row key={l} label={l}>
          {v}
        </Row>
      ))}
    </dl>
  );
}

