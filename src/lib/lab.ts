import { labels } from '../i18n';
/**
 * Laborberichte (Lab Insights): Umrechnungen für Cannabinoid-Gesamtgehalte.
 *
 * Gesamt-THC = THC + 0,877 × THCA   (Molmassenverhältnis THC/THCA)
 * Gesamt-CBD = CBD + 0,877 × CBDA   (Molmassenverhältnis CBD/CBDA, 314,46/358,47)
 *
 * Wird nur berechnet, wenn die Säureform tatsächlich angegeben ist. Weist der
 * Bericht bereits einen Gesamtwert aus, wird dieser separat angezeigt und nicht
 * nochmals umgerechnet.
 */
import { THCA_TO_THC_FACTOR } from './calc/constants';
import type { ConcentrationUnit, LabReport } from './db/types';

export const CBDA_TO_CBD_FACTOR = 0.877;
export const MOLAR_MASS_CBD = 314.46;
export const MOLAR_MASS_CBDA = 358.47;

export interface TotalResult {
  /** berechneter Gesamtwert (nur bei vorhandener Säureform oder neutraler Form) */
  computed?: number;
  /** im Bericht deklarierter Gesamtwert */
  declared?: number;
  /** Erklärung, wie der Wert zustande kommt */
  basis: 'computed' | 'neutral-only' | 'acid-only' | 'declared-only' | 'missing';
  /** Abweichung zwischen deklariertem und berechnetem Wert (Prozentpunkte bzw. mg/g) */
  difference?: number;
}

export function totalCannabinoid(neutral: number | undefined, acid: number | undefined, factor: number, declared?: number): TotalResult {
  const has = (v?: number) => typeof v === 'number' && Number.isFinite(v) && v >= 0;
  let computed: number | undefined;
  let basis: TotalResult['basis'];
  if (has(neutral) && has(acid)) {
    computed = neutral! + factor * acid!;
    basis = 'computed';
  } else if (has(neutral)) {
    // Ohne Angabe zur Säureform ist der Gesamtwert nur eine Untergrenze.
    computed = neutral;
    basis = 'neutral-only';
  } else if (has(acid)) {
    computed = factor * acid!;
    basis = 'acid-only';
  } else {
    basis = has(declared) ? 'declared-only' : 'missing';
  }
  const round = (v?: number) => (v === undefined ? undefined : Math.round(v * 1000) / 1000);
  return {
    computed: round(computed),
    declared: has(declared) ? declared : undefined,
    basis,
    difference: computed !== undefined && has(declared) ? round(declared! - computed) : undefined,
  };
}

export const totalThc = (r: Pick<LabReport, 'thc' | 'thca' | 'declaredTotalThc'>) => totalCannabinoid(r.thc, r.thca, THCA_TO_THC_FACTOR, r.declaredTotalThc);
export const totalCbd = (r: Pick<LabReport, 'cbd' | 'cbda' | 'declaredTotalCbd'>) => totalCannabinoid(r.cbd, r.cbda, CBDA_TO_CBD_FACTOR, r.declaredTotalCbd);

/** 1 % (w/w) = 10 mg/g */
export function convertUnit(value: number, from: ConcentrationUnit, to: ConcentrationUnit): number {
  if (from === to) return value;
  return from === '%' ? value * 10 : value / 10;
}

export function toPercent(value: number | undefined, unit: ConcentrationUnit): number | undefined {
  return value === undefined ? undefined : convertUnit(value, unit, '%');
}

/** Plausibilitätsprüfungen (Hinweise, keine Korrektur). */
export function plausibilityIssues(r: Pick<LabReport, 'unit' | 'thc' | 'thca' | 'cbd' | 'cbda' | 'cbg' | 'cbn' | 'terpenes'>): string[] {
  const issues: string[] = [];
  const pct = (v?: number) => toPercent(v, r.unit) ?? 0;
  const cannabinoidSum = pct(r.thc) + pct(r.thca) + pct(r.cbd) + pct(r.cbda) + pct(r.cbg) + pct(r.cbn);
  if (cannabinoidSum > 100) issues.push('Die Summe der Cannabinoide liegt über 100 %. Einheit prüfen (% oder mg/g?).');
  const terpSum = r.terpenes.reduce((s, t) => s + pct(t.value), 0);
  if (terpSum > 15) issues.push('Die Terpensumme ist ungewöhnlich hoch (> 15 %). Einheit prüfen.');
  if ([r.thc, r.thca, r.cbd, r.cbda, r.cbg, r.cbn].some((v) => v !== undefined && v < 0)) issues.push('Negative Werte sind nicht zulässig.');
  return issues;
}

export const LAB_ORIGIN_LABEL = labels('labels.labOrigin', ['document', 'manual', 'unverified'] as const);
