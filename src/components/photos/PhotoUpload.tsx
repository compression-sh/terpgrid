import { Camera, CheckCircle2, CircleAlert, ImagePlus, Loader2, RotateCcw, ShieldCheck, Upload } from 'lucide-react';
import { type DragEvent, useEffect, useId, useRef, useState } from 'react';
import { useIsServerMode } from '../../app/auth';
import { useData } from '../../app/DataProvider';
import { errorText, useToast } from '../../app/Toasts';
import { nowLocal } from '../../lib/dates';
import { addPhoto, createRecord } from '../../lib/db/repo';
import { formatBytes, processImage } from '../../lib/media/images';
import { SelectField, TextArea } from '../forms/Fields';
import { Callout } from '../ui/Callout';
import { Modal } from '../ui/Modal';

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

type ItemStatus = 'queued' | 'processing' | 'saved' | 'error';
interface UploadItem {
  key: string;
  file: File;
  status: ItemStatus;
  error?: string;
  preview?: string;
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
  const cameraRef = useRef<HTMLInputElement>(null);
  const server = useIsServerMode();
  const plants = data.plants.filter((p) => p.growId === growId);
  // Vorschau-URLs erst freigeben, wenn der Dialog geschlossen wird (nicht bei jeder Statusänderung)
  const itemsRef = useRef(items);
  itemsRef.current = items;
  useEffect(() => () => itemsRef.current.forEach((i) => i.preview && URL.revokeObjectURL(i.preview)), []);
  const setStatus = (key: string, status: ItemStatus, error?: string) => setItems((list) => list.map((i) => (i.key === key ? { ...i, status, error } : i)));

  async function handle(files: File[]) {
    const images = files.filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|avif|gif)$/i.test(f.name));
    if (images.length === 0) {
      toast('Keine Bilddateien ausgewählt.', { tone: 'error' });
      return;
    }
    const batch: UploadItem[] = images.map((file, i) => ({ key: `${Date.now()}-${i}-${file.name}`, file, status: 'queued', preview: images.length <= 24 ? URL.createObjectURL(file) : undefined }));
    setItems((list) => [...list.filter((x) => x.status !== 'error' || !images.includes(x.file)), ...batch]);
    const res: Result = { ok: 0, errors: [], gpsRemoved: 0, savedBytes: 0, originalBytes: 0 };
    const ids: string[] = [];
    setResult(null);
    setBusy({ done: 0, total: images.length });
    for (const item of batch) {
      const file = item.file;
      setStatus(item.key, 'processing');
      try {
        const img = await processImage(file);
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
        setStatus(item.key, 'saved');
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
        title: ids.length === 1 ? 'Foto hinzugefügt' : `${ids.length} Fotos hinzugefügt`,
        notes: note.trim(),
        photoIds: ids,
      }).catch(() => {});
    }
    setBusy(null);
    setResult(res);
    if (res.ok) {
      toast(res.ok === 1 ? 'Foto gespeichert' : `${res.ok} Fotos gespeichert`);
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
      title="Fotos hochladen"
      subtitle={server ? 'Werden auf diesem Gerät verarbeitet und verschlüsselt mit deinem Server synchronisiert.' : 'Bleiben ausschließlich auf diesem Gerät gespeichert.'}
      size="md"
      footer={
        <button type="button" className="btn-ghost" onClick={onClose} disabled={!!busy}>
          {result ? 'Fertig' : 'Schließen'}
        </button>
      }
    >
      <div className="space-y-4">
        {selectable && (
          <div className="grid gap-4 sm:grid-cols-2">
            <SelectField
              label="Grow"
              value={growId}
              onChange={(v) => {
                setGrowId(v);
                setPlantId('');
              }}
              options={data.grows.map((g) => ({ value: g.id, label: g.name }))}
              placeholder="Ohne Zuordnung"
            />
            <SelectField label="Pflanze" value={plantId} onChange={setPlantId} options={plants.map((p) => ({ value: p.id, label: p.name }))} placeholder={growId ? 'Ganzer Grow' : '—'} disabled={!growId} />
          </div>
        )}
        <TextArea label="Notiz (für alle Fotos dieses Uploads)" value={note} onChange={setNote} rows={2} maxLength={300} />
        {(selectable ? growId : target.growId) && (
          <label className="flex cursor-pointer items-center gap-2 text-[13px] text-ink-300">
            <input type="checkbox" className="accent-leaf-500" checked={logActivity} onChange={(e) => setLogActivity(e.target.checked)} />
            Als Foto-Eintrag in der Grow-Zeitleiste vermerken
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
                <span className="hidden sm:inline">Bilder hierher ziehen oder </span>
                <label htmlFor={inputId} className="cursor-pointer font-medium text-leaf-400 hover:text-leaf-300">
                  Dateien auswählen
                </label>
              </p>
              <p className="hint mt-1">JPEG, PNG, WebP · mehrere gleichzeitig möglich</p>
              <div className="mt-4 flex flex-wrap justify-center gap-2">
                <button type="button" className="btn-primary" onClick={() => inputRef.current?.click()}>
                  <Upload className="size-4" /> Fotos wählen
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
          <ul className="grid grid-cols-1 gap-1.5 sm:grid-cols-2" aria-label="Upload-Status je Datei">
            {items.map((i) => (
              <li key={i.key} className="flex items-center gap-2.5 rounded-lg border border-white/[0.05] bg-white/[0.015] p-1.5 pr-2.5">
                {i.preview ? <img src={i.preview} alt="" className="size-9 shrink-0 rounded-md object-cover" /> : <span className="size-9 shrink-0 rounded-md bg-white/[0.04]" />}
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] text-ink-100">{i.file.name}</span>
                  <span className={`block truncate text-[11px] ${i.status === 'error' ? 'text-rose-300' : 'text-ink-500'}`}>
                    {i.status === 'queued' ? 'Wartet …' : i.status === 'processing' ? 'Wird verkleinert und bereinigt …' : i.status === 'saved' ? `Gespeichert${server ? ' · wird synchronisiert' : ''}` : i.error}
                  </span>
                </span>
                {i.status === 'processing' && <Loader2 className="size-4 shrink-0 animate-spin text-leaf-400" />}
                {i.status === 'saved' && <CheckCircle2 className="size-4 shrink-0 text-leaf-400" />}
                {i.status === 'error' && <CircleAlert className="size-4 shrink-0 text-rose-300" />}
              </li>
            ))}
          </ul>
        )}
        {!busy && items.some((i) => i.status === 'error') && (
          <button type="button" className="btn-ghost" onClick={() => handle(items.filter((i) => i.status === 'error').map((i) => i.file))}>
            <RotateCcw className="size-4" /> Fehlgeschlagene erneut versuchen
          </button>
        )}

        {result && (
          <div className="space-y-2">
            {result.ok > 0 && (
              <Callout tone="ok" title={`${result.ok} ${result.ok === 1 ? 'Foto' : 'Fotos'} gespeichert`}>
                {formatBytes(result.originalBytes)} → {formatBytes(result.savedBytes)} lokal belegt.
                {result.gpsRemoved > 0 && ` Bei ${result.gpsRemoved} ${result.gpsRemoved === 1 ? 'Foto' : 'Fotos'} wurden Standortdaten (GPS) entfernt.`}
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
            Fotos werden auf max. 2048 px verkleinert und neu kodiert. Dabei werden alle eingebetteten Metadaten entfernt – auch Standort, Kameramodell und
            Seriennummern. Das Aufnahmedatum wird vorher ausgelesen und separat gespeichert.{' '}
            {server ? 'Nur das bereinigte Bild wird verschlüsselt auf deinem Server gespeichert – das Original verlässt dein Gerät nicht.' : 'Nichts wird hochgeladen.'}
          </span>
        </div>
      </div>
    </Modal>
  );
}
