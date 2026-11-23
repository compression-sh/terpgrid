import type { Range } from './calc/potency';

const cache = new Map<string, Intl.NumberFormat>();
function nf(min: number, max: number): Intl.NumberFormat {
  const key = `${min}-${max}`;
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat('de-DE', { minimumFractionDigits: min, maximumFractionDigits: max });
    cache.set(key, f);
  }
  return f;
}

/**
 * Formatiert Zahlen mit sinnvoller, nicht scheinpräziser Stellenzahl:
 * < 1 → 2 Nachkommastellen, < 10 → 1, ab 100 → 0.
 */
export function fmt(value: number, digits?: number): string {
  if (!Number.isFinite(value)) return '–';
  if (digits !== undefined) return nf(0, digits).format(value);
  const abs = Math.abs(value);
  if (abs === 0) return '0';
  if (abs < 1) return nf(0, 2).format(value);
  if (abs < 100) return nf(0, 1).format(value);
  return nf(0, 0).format(value);
}

export function fmtRange(r: Range, unit = ''): string {
  const u = unit ? ` ${unit}` : '';
  return `${fmt(r.low)}–${fmt(r.high)}${u}`;
}

export function fmtPercent(fraction: number, digits = 0): string {
  return `${nf(0, digits).format(fraction * 100)} %`;
}
