import { ImageOff, Sprout } from 'lucide-react';
import { usePhotoUrl } from './usePhotoUrl';
import { t } from '../../i18n';

interface Props {
  photoId?: string;
  variant?: 'thumb' | 'full';
  alt: string;
  className?: string;
  /** Platzhalter ist deutlich als solcher erkennbar (kein echtes Foto). */
  placeholder?: 'leaf' | 'none';
  fit?: 'cover' | 'contain';
}

export function PhotoImg({ photoId, variant = 'thumb', alt, className = '', placeholder = 'leaf', fit = 'cover' }: Props) {
  const { url, loading } = usePhotoUrl(photoId, variant);
  if (!photoId || (!url && !loading)) {
    if (placeholder === 'none') return null;
    return (
      <div
        className={`grid place-items-center bg-[repeating-linear-gradient(135deg,rgb(255_255_255/0.018)_0_8px,transparent_8px_16px)] text-ink-600 ${className}`}
        role="img"
        aria-label={photoId ? t('photos.img.unavailable') : t('photos.img.placeholder')}
        title={photoId ? t('photos.img.unavailable') : t('photos.img.placeholder2')}
      >
        {photoId ? <ImageOff className="size-5" /> : <Sprout className="size-5" />}
      </div>
    );
  }
  if (!url) return <div className={`animate-pulse bg-ink-800 ${className}`} aria-busy="true" aria-label={t('photos.img.loading')} />;
  return <img src={url} alt={alt} loading="lazy" decoding="async" draggable={false} className={`${fit === 'cover' ? 'object-cover' : 'object-contain'} ${className}`} />;
}
