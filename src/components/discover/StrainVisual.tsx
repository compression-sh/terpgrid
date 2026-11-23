import { useState } from 'react';
import type { CatalogImage } from '../../lib/catalog/types';

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Abstrakter, deterministischer Platzhalter (botanisches Linienmotiv).
 * Klar als Platzhalter erkennbar – kein Foto, keine Sortenbehauptung.
 */
export function AbstractPlaceholder({ seed, className = '', label = true }: { seed: string; className?: string; label?: boolean }) {
  const h = hash(seed);
  const hue = 140 + (h % 40) - 20;
  const rot = h % 360;
  const petals = 5 + (h % 4);
  const spread = 18 + (h % 14);
  return (
    <div className={`relative overflow-hidden bg-ink-900 ${className}`} role="img" aria-label="Platzhalter – kein lizenziertes Sortenbild verfügbar">
      <svg viewBox="0 0 200 200" preserveAspectRatio="xMidYMid slice" className="absolute inset-0 h-full w-full">
        <defs>
          <radialGradient id={`pg-${h}`} cx="50%" cy="45%" r="70%">
            <stop offset="0" stopColor={`hsl(${hue} 45% 22%)`} />
            <stop offset="1" stopColor="hsl(150 15% 5%)" />
          </radialGradient>
        </defs>
        <rect width="200" height="200" fill={`url(#pg-${h})`} />
        <g transform={`translate(100 108) rotate(${rot % 30 - 15})`} fill="none" stroke={`hsl(${hue} 55% 62%)`} strokeOpacity="0.32" strokeWidth="0.8">
          {Array.from({ length: petals }, (_, i) => {
            const a = -90 + (i - (petals - 1) / 2) * spread;
            const len = 70 - Math.abs(i - (petals - 1) / 2) * 9;
            return <path key={i} transform={`rotate(${a + 90})`} d={`M0 0 C ${len * 0.22} ${-len * 0.35}, ${len * 0.12} ${-len * 0.85}, 0 ${-len} C ${-len * 0.12} ${-len * 0.85}, ${-len * 0.22} ${-len * 0.35}, 0 0 Z M0 0 L0 ${-len * 0.95}`} />;
          })}
        </g>
        <g fill={`hsl(${hue} 50% 60%)`} fillOpacity="0.12">
          {Array.from({ length: 6 }, (_, i) => (
            <rect key={i} x={14 + i * 8} y={176} width="3" height="3" rx="0.6" />
          ))}
        </g>
      </svg>
      {label && <span className="absolute bottom-2 left-2 rounded bg-black/40 px-1.5 py-0.5 text-[9px] uppercase tracking-wider text-ink-400">Kein Bild</span>}
    </div>
  );
}

/** Externes Sortenbild mit Fallback; ohne Referrer, lazy. */
export function StrainVisual({ image, name, className = '', eager, fit = 'cover' }: { image?: CatalogImage; name: string; className?: string; eager?: boolean; fit?: 'cover' | 'contain' }) {
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  if (!image || failed) return <AbstractPlaceholder seed={name} className={className} />;
  return (
    <div className={`relative overflow-hidden bg-ink-900 ${className}`}>
      {!loaded && <div className="absolute inset-0 animate-pulse bg-gradient-to-br from-ink-800 to-ink-900" aria-hidden />}
      <img
        src={image.url}
        alt={image.alt || `${name} (Bild laut StrainAPI)`}
        width={image.width}
        height={image.height}
        loading={eager ? 'eager' : 'lazy'}
        decoding="async"
        referrerPolicy="no-referrer"
        draggable={false}
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={`h-full w-full transition-opacity duration-500 ${fit === 'cover' ? 'object-cover' : 'object-contain'} ${loaded ? 'opacity-100' : 'opacity-0'}`}
      />
    </div>
  );
}
