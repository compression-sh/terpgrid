import { ChevronLeft, ChevronRight, Download, ImageIcon, Pencil, Star, Trash2, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useConfirm } from '../../app/Confirm';
import { useLookup } from '../../app/DataProvider';
import { errorText, useToast } from '../../app/Toasts';
import { fmtDateTime } from '../../lib/dates';
import { getOne } from '../../lib/db/database';
import { deletePhotos, updateRecord } from '../../lib/db/repo';
import type { Photo } from '../../lib/db/types';
import { phaseAt } from '../../lib/grow/phases';
import { formatBytes } from '../../lib/media/images';
import { PhaseChip } from '../ui/Chip';
import { PhotoImg } from './PhotoImg';
import { forgetPhoto } from './usePhotoUrl';
import { t } from '../../i18n';

/** Phase eines Fotos aus den Meilensteinen der Pflanze (falls vorhanden) bzw. des Grows. */
export function usePhotoPhase() {
  const lookup = useLookup();
  return useCallback(
    (p: Photo) => {
      const plant = p.plantId ? lookup.plant.get(p.plantId) : undefined;
      const grow = p.growId ? lookup.grow.get(p.growId) : undefined;
      const dates = plant && Object.keys(plant.phaseDates).length ? plant.phaseDates : grow?.phaseDates;
      return dates ? phaseAt(dates, p.takenAt) : undefined;
    },
    [lookup],
  );
}

/**
 * Vollbild-Ansicht mit Pfeiltasten-/Wischnavigation, Metadaten-Bearbeitung,
 * Titelbild setzen, Download und Löschen.
 */
export function PhotoViewer({ photos, index, onIndex, onClose }: { photos: Photo[]; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const lookup = useLookup();
  const toast = useToast();
  const confirm = useConfirm();
  const phaseOf = usePhotoPhase();
  const ref = useRef<HTMLDialogElement>(null);
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState('');
  const [takenAt, setTakenAt] = useState('');
  const touchX = useRef<number | null>(null);
  const photo = photos[index];

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  useEffect(() => {
    setEditing(false);
    if (photo) {
      setNote(photo.note);
      setTakenAt(photo.takenAt);
    }
  }, [photo]);
  useEffect(() => {
    if (index >= photos.length) {
      if (photos.length === 0) onClose();
      else onIndex(photos.length - 1);
    }
  }, [photos.length, index, onIndex, onClose]);

  const prev = useCallback(() => index > 0 && onIndex(index - 1), [index, onIndex]);
  const next = useCallback(() => index < photos.length - 1 && onIndex(index + 1), [index, photos.length, onIndex]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing) return;
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [prev, next, editing]);

  if (!photo) return null;
  const grow = photo.growId ? lookup.grow.get(photo.growId) : undefined;
  const plant = photo.plantId ? lookup.plant.get(photo.plantId) : undefined;
  const strain = photo.strainId ? lookup.strain.get(photo.strainId) : undefined;
  const phase = phaseOf(photo);
  const isGrowCover = grow?.coverPhotoId === photo.id;
  const isPlantCover = plant?.coverPhotoId === photo.id;

  async function save() {
    try {
      await updateRecord('photos', photo!.id, { note: note.trim(), takenAt: takenAt || photo!.takenAt });
      setEditing(false);
      toast(t('photos.view.updated'));
    } catch (e) {
      toast(errorText(e), { tone: 'error' });
    }
  }

  async function remove() {
    const ok = await confirm({
      title: t('photos.view.deleteTitle'),
      message: t('photos.view.deleteText'),
      confirmLabel: t('common.delete'),
      tone: 'danger',
    });
    if (!ok) return;
    try {
      await deletePhotos([photo!.id]);
      forgetPhoto(photo!.id);
      toast(t('photos.view.deleted'));
    } catch (e) {
      toast(errorText(e), { tone: 'error' });
    }
  }

  async function download() {
    const d = await getOne('photoData', photo!.id);
    if (!d) return;
    const url = URL.createObjectURL(new Blob([d.full], { type: d.mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `terpgrid-${photo!.takenAt.replace(/[:T]/g, '-')}.jpg`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function setCover(kind: 'grow' | 'plant') {
    try {
      if (kind === 'grow' && grow) await updateRecord('grows', grow.id, { coverPhotoId: isGrowCover ? undefined : photo!.id });
      if (kind === 'plant' && plant) await updateRecord('plants', plant.id, { coverPhotoId: isPlantCover ? undefined : photo!.id });
      toast(t('photos.view.coverUpdated'));
    } catch (e) {
      toast(errorText(e), { tone: 'error' });
    }
  }

  return (
    <dialog
      ref={ref}
      aria-label={t('photos.view.title')}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      className="m-0 h-dvh max-h-none w-screen max-w-none bg-black/95 p-0 text-ink-100 backdrop:bg-black"
    >
      <div className="flex h-full flex-col lg:flex-row">
        <div
          className="relative min-h-0 flex-1 select-none"
          onTouchStart={(e) => (touchX.current = e.touches[0]?.clientX ?? null)}
          onTouchEnd={(e) => {
            const start = touchX.current;
            const end = e.changedTouches[0]?.clientX;
            if (start !== null && end !== undefined && Math.abs(end - start) > 50) (end < start ? next : prev)();
            touchX.current = null;
          }}
        >
          <PhotoImg key={photo.id} photoId={photo.id} variant="full" alt={photo.note || t('photos.view.alt', { date: fmtDateTime(photo.takenAt) })} fit="contain" className="absolute inset-0 h-full w-full" />
          <button type="button" onClick={onClose} aria-label={t('common.close')} className="absolute right-3 top-3 grid size-10 place-items-center rounded-full bg-black/60 text-ink-100 backdrop-blur hover:bg-black/80">
            <X className="size-5" />
          </button>
          {index > 0 && (
            <button type="button" onClick={prev} aria-label={t('photos.view.prev')} className="absolute left-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/60 backdrop-blur hover:bg-black/80">
              <ChevronLeft className="size-5" />
            </button>
          )}
          {index < photos.length - 1 && (
            <button type="button" onClick={next} aria-label={t('photos.view.next')} className="absolute right-3 top-1/2 grid size-11 -translate-y-1/2 place-items-center rounded-full bg-black/60 backdrop-blur hover:bg-black/80">
              <ChevronRight className="size-5" />
            </button>
          )}
          <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/60 px-3 py-1 font-mono text-xs text-ink-200 backdrop-blur">
            {index + 1} / {photos.length}
          </div>
        </div>

        <aside className="max-h-[42dvh] shrink-0 overflow-y-auto border-t border-white/[0.08] bg-ink-950 p-5 lg:max-h-none lg:w-80 lg:border-l lg:border-t-0">
          <div className="flex items-center gap-2 text-xs text-ink-400">
            <ImageIcon className="size-3.5" /> Eigenes Foto · {photo.width}×{photo.height} · {formatBytes(photo.size)}
          </div>
          <div className="mt-2 text-lg font-semibold text-ink-50">{fmtDateTime(photo.takenAt)}</div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {phase && <PhaseChip phase={phase} />}
            {grow && (
              <a href={`#/grows/${grow.id}`} onClick={onClose} className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[11px] text-ink-300 hover:text-ink-50">
                {grow.name}
              </a>
            )}
            {plant && (
              <a href={`#/grows/${plant.growId}/plants/${plant.id}`} onClick={onClose} className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[11px] text-ink-300 hover:text-ink-50">
                {plant.name}
              </a>
            )}
            {strain && <span className="rounded-full border border-white/[0.08] px-2 py-0.5 text-[11px] text-ink-300">{strain.name}</span>}
          </div>

          {editing ? (
            <div className="mt-4 space-y-3">
              <label className="block space-y-1.5">
                <span className="label">{t('photos.view.takenAt')}</span>
                <input type="datetime-local" className="input-base" value={takenAt} onChange={(e) => setTakenAt(e.target.value)} />
              </label>
              <label className="block space-y-1.5">
                <span className="label">{t('photos.view.note')}</span>
                <textarea className="input-base" rows={3} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
              </label>
              <div className="flex gap-2">
                <button type="button" className="btn-primary" onClick={save}>
                  {t('common.save.button')}
                </button>
                <button type="button" className="btn-ghost" onClick={() => setEditing(false)}>
                  {t('common.cancel')}
                </button>
              </div>
            </div>
          ) : (
            <p className="mt-4 whitespace-pre-wrap text-[13px] leading-relaxed text-ink-300">{photo.note || <span className="text-ink-500">{t('photos.view.noNote')}</span>}</p>
          )}

          <div className="mt-5 grid grid-cols-2 gap-2">
            <button type="button" className="btn-ghost" onClick={() => setEditing(true)} disabled={editing}>
              <Pencil className="size-4" /> Bearbeiten
            </button>
            <button type="button" className="btn-ghost" onClick={download}>
              <Download className="size-4" /> {t('common.save.button')}
            </button>
            {grow && (
              <button type="button" className="btn-ghost col-span-2" onClick={() => setCover('grow')}>
                <Star className={`size-4 ${isGrowCover ? 'fill-amber-300 text-amber-300' : ''}`} /> {isGrowCover ? t('photos.view.growCover') : t('photos.view.setGrowCover')}
              </button>
            )}
            {plant && (
              <button type="button" className="btn-ghost col-span-2" onClick={() => setCover('plant')}>
                <Star className={`size-4 ${isPlantCover ? 'fill-amber-300 text-amber-300' : ''}`} /> {isPlantCover ? t('photos.view.plantCover') : t('photos.view.setPlantCover')}
              </button>
            )}
            <button type="button" className="btn-ghost col-span-2 text-rose-300 hover:text-rose-200" onClick={remove}>
              <Trash2 className="size-4" /> Foto löschen
            </button>
          </div>
        </aside>
      </div>
    </dialog>
  );
}
