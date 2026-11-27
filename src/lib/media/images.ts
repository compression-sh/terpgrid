/**
 * Bildimport im Browser:
 * - Aufnahmedatum aus EXIF lesen (falls vorhanden)
 * - Neu-Kodierung über <canvas> → entfernt ALLE Metadaten (inkl. GPS/Standort)
 * - Skalierung auf max. 2048 px Kantenlänge (JPEG/WebP, Qualität 0,86)
 * - Vorschaubild mit max. 480 px
 *
 * Einschränkungen: Formate, die der Browser nicht dekodieren kann (z. B. HEIC in
 * Chrome/Firefox), werden abgelehnt. Die Original-Datei wird nie gespeichert.
 */
import { nowLocal } from '../dates';
import { readExif } from './exif';
import { intlLocale } from '../../i18n';

export const MAX_EDGE = 2048;
export const THUMB_EDGE = 480;
export const QUALITY = 0.86;
export const MAX_INPUT_BYTES = 40 * 1024 * 1024;
/** „Originalauflösung“: keine Verkleinerung, nur Begrenzung auf die Canvas-Grenze mobiler Browser (iOS ≈ 16,7 MP). */
export const ORIGINAL_MAX_PIXELS = 16_000_000;
export const ORIGINAL_QUALITY = 0.92;
/** Obergrenze je gespeichertem Bild (unter dem Standard-Uploadlimit des Servers von 20 MB). */
export const MAX_STORED_BYTES = 18 * 1024 * 1024;

export type ImageQuality = 'standard' | 'original';

/** Formate, die Browser je nach Plattform unterschiedlich dekodieren (für Hinweise). */
export function formatSupportNote(file: { name: string; type: string }): string | null {
  if (/\.(heic|heif)$/i.test(file.name) || /image\/hei[cf]/.test(file.type))
    return 'HEIC/HEIF wird nur von Safari (iPhone, iPad, Mac) dekodiert. In anderen Browsern bitte als JPEG exportieren (iOS: Einstellungen → Kamera → Formate → „Maximale Kompatibilität“).';
  if (/\.(tiff?|dng|cr2|nef|arw|raw|psd|svg)$/i.test(file.name)) return 'RAW-, TIFF-, PSD- und SVG-Dateien werden nicht unterstützt. Bitte als JPEG, PNG oder WebP exportieren.';
  return null;
}

/** Zielgröße für „Originalauflösung“: unverändert, außer über der Pixelgrenze. */
export function fitPixels(width: number, height: number, maxPixels: number): { width: number; height: number } {
  const scale = Math.min(1, Math.sqrt(maxPixels / (width * height)));
  return { width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale)) };
}

export interface ProcessedImage {
  full: ArrayBuffer;
  thumb: ArrayBuffer;
  mime: string;
  width: number;
  height: number;
  takenAt: string;
  hadGps: boolean;
  originalName: string;
  originalSize: number;
}

/** Zielgröße unter Beibehaltung des Seitenverhältnisses. */
export function fitWithin(width: number, height: number, maxEdge: number): { width: number; height: number } {
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

function lastModifiedLocal(file: File): string {
  return file.lastModified ? nowLocal(new Date(file.lastModified)) : nowLocal();
}

async function decode(file: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* Fallback unten */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function encode(source: CanvasImageSource, w: number, h: number, maxEdge: number, quality = QUALITY): Promise<{ buf: ArrayBuffer; mime: string; width: number; height: number }> {
  const size = Number.isFinite(maxEdge) ? fitWithin(w, h, maxEdge) : fitPixels(w, h, ORIGINAL_MAX_PIXELS);
  const canvas = document.createElement('canvas');
  canvas.width = size.width;
  canvas.height = size.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas wird nicht unterstützt.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, size.width, size.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
  if (!blob) throw new Error('Bild konnte nicht kodiert werden.');
  return { buf: await blob.arrayBuffer(), mime: blob.type || 'image/jpeg', width: size.width, height: size.height };
}

export async function processImage(file: File, opts: { quality?: ImageQuality } = {}): Promise<ProcessedImage & { downgraded?: boolean }> {
  if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|gif|avif|heic|heif)$/i.test(file.name)) {
    throw new Error(`„${file.name}“ ist keine Bilddatei.`);
  }
  const unsupported = /\.(tiff?|dng|cr2|nef|arw|raw|psd|svg)$/i.test(file.name) ? formatSupportNote(file) : null;
  if (unsupported) throw new Error(`„${file.name}“: ${unsupported}`);
  if (file.size > MAX_INPUT_BYTES) throw new Error(`„${file.name}“ ist größer als 40 MB.`);
  const raw = await file.arrayBuffer();
  const exif = readExif(raw);
  let bitmap: ImageBitmap | HTMLImageElement;
  try {
    bitmap = await decode(file);
  } catch {
    throw new Error(
      /\.(heic|heif)$/i.test(file.name)
        ? `„${file.name}“: HEIC wird von diesem Browser nicht unterstützt. Bitte als JPEG exportieren (iOS: Einstellungen → Kamera → Formate → „Maximale Kompatibilität“).`
        : `„${file.name}“ konnte nicht gelesen werden.`,
    );
  }
  const w = 'naturalWidth' in bitmap ? bitmap.naturalWidth : bitmap.width;
  const h = 'naturalHeight' in bitmap ? bitmap.naturalHeight : bitmap.height;
  let full = opts.quality === 'original' ? await encode(bitmap, w, h, Infinity, ORIGINAL_QUALITY) : await encode(bitmap, w, h, MAX_EDGE);
  let downgraded = false;
  if (full.buf.byteLength > MAX_STORED_BYTES) {
    // Zu groß für die Synchronisation → Standardgröße statt eines Fehlers
    full = await encode(bitmap, w, h, MAX_EDGE);
    downgraded = true;
  }
  const thumb = await encode(bitmap, w, h, THUMB_EDGE);
  if ('close' in bitmap) bitmap.close();
  return {
    full: full.buf,
    thumb: thumb.buf,
    mime: full.mime,
    width: full.width,
    height: full.height,
    takenAt: exif.dateTimeOriginal ?? lastModifiedLocal(file),
    hadGps: exif.hasGps,
    originalName: file.name,
    originalSize: file.size,
    downgraded,
  };
}

export function formatBytes(bytes?: number): string {
  if (bytes === undefined || !Number.isFinite(bytes)) return '–';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = bytes / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toLocaleString(intlLocale(), { maximumFractionDigits: v < 10 ? 1 : 0 })} ${units[i]}`;
}
