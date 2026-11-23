import { ImagePlus, Loader2, ShieldCheck, Upload } from 'lucide-react';
import { type DragEvent, useId, useRef, useState } from 'react';
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
  const plants = data.plants.filter((p) => p.growId === growId);

  async function handle(files: File[]) {
    const images = files.filter((f) => f.type.startsWith('image/') || /\.(jpe?g|png|webp|heic|heif|avif|gif)$/i.test(f.name));
    if (images.length === 0) {
      toast('Keine Bilddateien ausgewählt.', { tone: 'error' });
      return;
    }
    const res: Result = { ok: 0, errors: [], gpsRemoved: 0, savedBytes: 0, originalBytes: 0 };
    const ids: string[] = [];
    setResult(null);
    setBusy({ done: 0, total: images.length });
    for (const file of images) {
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
      } catch (e) {
        res.errors.push(errorText(e));
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
      subtitle="Bleiben ausschließlich auf diesem Gerät gespeichert."
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
              <button type="button" className="btn-primary mt-4" onClick={() => inputRef.current?.click()}>
                <Upload className="size-4" /> Fotos wählen
              </button>
            </>
          )}
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
            Seriennummern. Das Aufnahmedatum wird vorher ausgelesen und separat gespeichert. Nichts wird hochgeladen.
          </span>
        </div>
      </div>
    </Modal>
  );
}
