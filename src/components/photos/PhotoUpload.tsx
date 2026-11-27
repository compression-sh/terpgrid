import { Ban, Camera, CheckCircle2, CircleAlert, ImagePlus, Loader2, RotateCcw, ShieldCheck, Upload } from 'lucide-react';
import { type DragEvent, useEffect, useId, useRef, useState } from 'react';
import { useIsServerMode } from '../../app/auth';
import { useData } from '../../app/DataProvider';
import { errorText, useToast } from '../../app/Toasts';
import { nowLocal } from '../../lib/dates';
import { addPhoto, createRecord, updateRecord } from '../../lib/db/repo';
import { type ImageQuality, MAX_EDGE, formatBytes, formatSupportNote, processImage } from '../../lib/media/images';
import { SelectField, TextArea } from '../forms/Fields';
import { Callout } from '../ui/Callout';
import { Modal } from '../ui/Modal';
import { t } from '../../i18n';

export interface PhotoTarget {
  growId?: string;
  plantId?: string;
  strainId?: string;
  journalId?: string;
  inventoryId?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  target?: PhotoTarget;
  /** Auswahl von Grow/Pflanze erlauben (globaler Upload). */
  selectable?: boolean;
  onUploaded?: (photoIds: string[]) => void;
}

type ItemStatus = 'queued' | 'processing' | 'saved' | 'error' | 'cancelled';
interface UploadItem {
  key: string;
  file: File;
  status: ItemStatus;
  error?: string;
  preview?: string;
  photoId?: string;
  note?: string;
  hint?: string | null;
}

interface Result {
  ok: number;
  errors: string[];
  gpsRemoved: number;
  savedBytes: number;
  originalBytes: number;
}

/**
 * Mehrfach-Upload mit Drag & Drop (Desktop) und Kamera-/Galerieauswahl (Mobil).
 * Bilder werden lokal verkleinert und neu kodiert – Metadaten (inkl. GPS) entfallen.
 */
export function PhotoUploadModal({ open, onClose, target = {}, selectable, onUploaded }: Props) {
  const { data } = useData();
  const toast = useToast();
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const [growId, setGrowId] = useState(target.growId ?? '');
  const [plantId, setPlantId] = useState(target.plantId ?? '');
  const [note, setNote] = useState('');
  const [logActivity, setLogActivity] = useState(true);
  const [busy, setBusy] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [drag, setDrag] = useState(false);
  const [items, setItems] = useState<UploadItem[]>([]);
  const [quality, setQuality] = useState<ImageQuality>('standard');
  // Warteschlange nur im Arbeitsspeicher: unbearbeitete Originale werden nie gespeichert
  const cancelRef = useRef(false);
  const cameraRef = useRef<HTMLInputElement>(null);
  const server = useIsServerMode();
  const plants = data.plants.filter((p) => p.growId === growId);
  // Vorschau-URLs erst freigeben, wenn der Dialog geschlossen wird (nicht bei jeder Statusänderung)
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => () => itemsRef.current.forEach((i) => i.preview && URL.revokeObjectURL(i.preview)), []);
  const setStatus = (key: string, status: ItemStatus, error?: string, photoId?: string) => setItems((list) => list.map((i) => (i.key === key ? { ...i, status, error, ...(photoId ? { photoId } : {}) } : i)));
  const saveItemNote = async (it: UploadItem, text: string) => {
    if (!it.photoId) return;
    setItems((list) => list.map((i) => (i.key === it.key ? { ...i, note: text } : i)));
    await updateRecord('photos', it.photoId, { note: text.trim() || note.trim() }).catch((e) => toast(errorText(e), { tone: 'error' }));
  };

  async function handle(files: File[]) {
    const images = files.filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|avif|gif)$/i.test(f.name));
    if (images.length === 0) {
      toast(t('photos.up.noImages'), { tone: 'error' });
      return;
    }
    const batch: UploadItem[] = images.map((file, i) => ({
      key: `${Date.now()}-${i}-${file.name}`,
      file,
      status: 'queued',
      hint: formatSupportNote(file),
      preview: images.length <= 24 && !/\.(heic|heif)$/i.test(file.name) ? URL.createObjectURL(file) : undefined,
    }));
    setItems((list) => [...list.filter((x) => !['error', 'cancelled'].includes(x.status) || !images.includes(x.file)), ...batch]);
    cancelRef.current = false;
    const res: Result = { ok: 0, errors: [], gpsRemoved: 0, savedBytes: 0, originalBytes: 0 };
    const ids: string[] = [];
    setResult(null);
    setBusy({ done: 0, total: images.length });
    let downgraded = 0;
    for (const item of batch) {
      const file = item.file;
      if (cancelRef.current) {
        setStatus(item.key, 'cancelled');
        continue;
      }
      setStatus(item.key, 'processing');
      try {
        const img = await processImage(file, { quality });
        if (img.downgraded) downgraded++;
        const photo = await addPhoto(
          {
            ...target,
            growId: (selectable ? growId : target.growId) || undefined,
            plantId: (selectable ? plantId : target.plantId) || undefined,
            takenAt: img.takenAt,
            note: note.trim(),
            width: img.width,
            height: img.height,
            size: img.full.byteLength,
            mime: img.mime,
            originalName: img.originalName,
          },
          { full: img.full, thumb: img.thumb },
        );
        ids.push(photo.id);
        res.ok++;
        if (img.hadGps) res.gpsRemoved++;
        res.savedBytes += img.full.byteLength + img.thumb.byteLength;
        res.originalBytes += img.originalSize;
        setStatus(item.key, 'saved', undefined, photo.id);
      } catch (e) {
        const msg = errorText(e);
        res.errors.push(msg);
        setStatus(item.key, 'error', msg);
      }
      setBusy((b) => (b ? { ...b, done: b.done + 1 } : b));
    }
    // Optional ein Foto-Ereignis in der Grow-Zeitleiste anlegen.
    const gid = selectable ? growId : target.growId;
    const pid = selectable ? plantId : target.plantId;
    if (logActivity && gid && ids.length) {
      await createRecord('activities', {
        growId: gid,
        plantId: pid || undefined,
        type: 'photo',
        date: nowLocal(),
        title: t('photos.up.added', { count: ids.length }),
        notes: note.trim(),
        photoIds: ids,
      }).catch(() => {});
    }
    setBusy(null);
    setResult(res);
    if (downgraded) toast(t('photos.up.downgraded', { count: downgraded, px: MAX_EDGE }), { tone: 'info' });
    if (cancelRef.current) toast(t('photos.up.cancelled'), { tone: 'info' });
    if (res.ok) {
      toast(t('photos.up.saved', { count: res.ok }));
      onUploaded?.(ids);
    }
  }

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDrag(false);
    if (busy) return;
    handle([...e.dataTransfer.files]);
  };

  return (
    <Modal
      open={open}
      onClose={() => !busy && onClose()}
      title={t('photos.up.title')}
      subtitle={server ? t('photos.up.hintServer') : t('photos.up.hintLocal')}
      size="md"
      footer={
        busy ? (
          <button type="button" className="btn-ghost" onClick={() => (cancelRef.current = true)}>
            <Ban className="size-4" /> Restliche abbrechen
          </button>
        ) : (
          <button type="button" className="btn-ghost" onClick={onClose}>
            {result ? t('photos.up.done') : t('common.close')}
          </button>
        )
      }
    >
      <div className="space-y-4">
        {selectable && (
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label={t('photos.up.grow')}
              value={growId}
              onChange={(v) => {
                setGrowId(v);
                setPlantId('');
              }}
              options={data.grows.map((g) => ({ value: g.id, label: g.name }))}
              placeholder={t('photos.up.unassigned')}
            />
            <SelectField label={t('photos.up.plant')} value={plantId} onChange={setPlantId} options={plants.map((p) => ({ value: p.id, label: p.name }))} placeholder={growId ? t('photos.up.wholeGrow') : '—'} disabled={!growId} />
          </div>
        )}
        <TextArea label={t('photos.up.note')} value={note} onChange={setNote} rows={2} maxLength={300} />
        <fieldset className="space-y-1.5" disabled={!!busy}>
          <legend className="label mb-1">{t('photos.up.quality')}</legend>
          <label className="flex cursor-pointer items-start gap-2 text-[13px] text-ink-200">
            <input type="radio" name="photo-quality" className="mt-0.5 accent-leaf-500" checked={quality === 'standard'} onChange={() => setQuality('standard')} />
            <span>
              Optimiert (empfohlen) <span className="text-ink-500">· max. {MAX_EDGE} px, spart Speicher und Datenvolumen</span>
            </span>
          </label>
          <label className="flex cursor-pointer items-start gap-2 text-[13px] text-ink-200">
            <input type="radio" name="photo-quality" className="mt-0.5 accent-leaf-500" checked={quality === 'original'} onChange={() => setQuality('original')} />
            <span>
              {t('photos.up.original')} <span className="text-ink-500">· {t('photos.up.originalHint')}</span>
            </span>
          </label>
        </fieldset>
        {(selectable ? growId : target.growId) && (
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-300">
            <input type="checkbox" className="accent-leaf-500" checked={logActivity} onChange={(e) => setLogActivity(e.target.checked)} />
            {t('photos.up.timeline')}
          </label>
        )}

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDrag(true);
          }}
          onDragLeave={() => setDrag(false)}
          onDrop={onDrop}
          className={`relative grid place-items-center rounded-2xl border-2 border-dashed px-4 py-10 text-center transition-colors ${
            drag ? 'border-leaf-400/60 bg-leaf-500/[0.06]' : 'border-white/[0.1] bg-white/[0.015]'
          }`}
        >
          {busy ? (
            <div className="flex flex-col items-center gap-3" role="status" aria-live="polite">
              <Loader2 className="size-6 animate-spin text-leaf-400" />
              <div className="text-sm text-ink-200">
                Verarbeite {busy.done + 1 > busy.total ? busy.total : busy.done + 1} von {busy.total} …
              </div>
              <div className="h-1.5 w-48 overflow-hidden rounded-full bg-ink-700">
                <div className="h-full bg-leaf-500 transition-all" style={{ width: `${(busy.done / busy.total) * 100}%` }} />
              </div>
            </div>
          ) : (
            <>
              <ImagePlus className="size-7 text-ink-400" />
              <p className="mt-3 text-sm text-ink-200">
                <span className="hidden sm:inline">{t('photos.up.drop')} </span>
                <label htmlFor={inputId} className="cursor-pointer font-medium text-leaf-400 hover:text-leaf-300">
                  {t('photos.up.choose')}
                </label>
              </p>
              <p className="hint mt-1">{t('photos.up.formats')}</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button type="button" className="btn-primary" onClick={() => inputRef.current?.click()}>
                  <Upload className="size-4" /> {t('photos.upload.choose')}
                </button>
                <button type="button" className="btn-ghost sm:hidden" onClick={() => cameraRef.current?.click()}>
                  <Camera className="size-4" /> Kamera
                </button>
              </div>
            </>
          )}
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = '';
              if (files.length) handle(files);
            }}
          />
          <input
            ref={inputRef}
            id={inputId}
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={(e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = '';
              if (files.length) handle(files);
            }}
          />
        </div>

        {items.length > 0 && (
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2" aria-label={t('photos.up.status')}>
            {items.map((i) => (
              <li key={i.key} className="flex items-center gap-2.5 rounded-lg border border-white/[0.05] bg-white/[0.015] p-1.5 pr-2.5">
                {i.preview ? <img src={i.preview} alt="" className="size-9 shrink-0 rounded-md object-cover" /> : <span className="size-9 shrink-0 rounded-md bg-white/[0.04]" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] text-ink-100">{i.file.name}</span>
                  <span className={`block text-[11px] ${i.status === 'error' ? 'text-rose-300' : 'truncate text-ink-500'}`}>
                    {i.status === 'queued'
                      ? (i.hint ?? t('photos.up.waiting'))
                      : i.status === 'processing'
                        ? quality === 'original' ? t('photos.up.cleaning') : t('photos.up.reducing')
                        : i.status === 'saved'
                          ? t('photos.up.savedDevice') + (server ? t('photos.up.willSync') : '')
                          : i.status === 'cancelled'
                            ? t('photos.up.aborted')
                            : i.error}
                  </span>
                  {i.status === 'saved' && i.photoId && (
                    <input
                      className="input-base mt-1 py-1 text-[12px]"
                      aria-label={t('photos.up.descFor', { name: i.file.name })}
                      placeholder={t('photos.up.descOptional')}
                      maxLength={300}
                      defaultValue={i.note ?? ''}
                      onBlur={(e) => e.target.value !== (i.note ?? '') && void saveItemNote(i, e.target.value)}
                    />
                  )}
                </span>
                {i.status === 'processing' && <Loader2 className="size-4 shrink-0 animate-spin text-leaf-400" />}
                {i.status === 'saved' && <CheckCircle2 className="size-4 shrink-0 text-leaf-400" />}
                {i.status === 'error' && <CircleAlert className="size-4 shrink-0 text-rose-300" />}
              </li>
            ))}
          </ul>
        )}
        {!busy && items.some((i) => i.status === 'error' || i.status === 'cancelled') && (
          <button type="button" className="btn-ghost" onClick={() => handle(items.filter((i) => i.status === 'error' || i.status === 'cancelled').map((i) => i.file))}>
            <RotateCcw className="size-4" /> {t('photos.upload.retry')}
          </button>
        )}

        {result && (
          <div className="space-y-2">
            {result.ok > 0 && (
              <Callout tone="ok" title={t('photos.up.saved', { count: result.ok })}>
                {formatBytes(result.originalBytes)} → {formatBytes(result.savedBytes)} lokal belegt.
                {result.gpsRemoved > 0 && t('photos.up.gps', { count: result.gpsRemoved })}
              </Callout>
            )}
            {result.errors.map((e) => (
              <Callout key={e} tone="warn">
                {e}
              </Callout>
            ))}
          </div>
        )}

        <div className="flex gap-2.5 rounded-xl border border-white/[0.05] bg-white/[0.015] p-3 text-xs leading-relaxed text-ink-400">
          <ShieldCheck className="mt-0.5 size-4 shrink-0 text-leaf-400" />
          <span>
            {t('photos.up.privacyA', { how: quality === 'original' ? t('photos.up.full') : t('photos.up.reduced', { px: MAX_EDGE }) })}{' '}
            {server ? t('photos.up.serverOnly') : t('photos.up.nothingUploaded')}
          </span>
        </div>
      </div>
    </Modal>
  );
}
