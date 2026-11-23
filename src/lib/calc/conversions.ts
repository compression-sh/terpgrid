import { MG_PER_G, PERCENT } from './constants';
import { gramsForMg, mgFromPercent, percentFromMg } from './potency';

/** g → mg */
export function gToMg(g: number): number {
  return g * MG_PER_G;
}

/** mg → g */
export function mgToG(mg: number): number {
  return mg / MG_PER_G;
}

/** Prozent → mg pro Gramm (z. B. 20 % = 200 mg/g). */
export function percentToMgPerG(percent: number): number {
  return (percent / PERCENT) * MG_PER_G;
}

/** mg pro Gramm → Prozent. */
export function mgPerGToPercent(mgPerG: number): number {
  return (mgPerG / MG_PER_G) * PERCENT;
}

export { gramsForMg, mgFromPercent, percentFromMg };

/**
 * Konzentrations-Rechner: Welche THC-Menge bzw. welcher Gehalt ergibt sich beim
 * Mischen/Verdünnen? (z. B. Cannabutter mit normaler Butter strecken)
 * c_neu = (c1·m1 + c2·m2) / (m1 + m2)
 */
export function mixConcentration(parts: { grams: number; mgPerGram: number }[]): {
  totalGrams: number;
  totalMg: number;
  mgPerGram: number;
} {
  const totalGrams = parts.reduce((s, p) => s + Math.max(0, p.grams), 0);
  const totalMg = parts.reduce((s, p) => s + Math.max(0, p.grams) * Math.max(0, p.mgPerGram), 0);
  return { totalGrams, totalMg, mgPerGram: totalGrams > 0 ? totalMg / totalGrams : 0 };
}

/**
 * Wie viel neutrales Fett muss hinzugefügt werden, um eine Ausgangskonzentration
 * auf eine Zielkonzentration zu verdünnen?
 * m_add = m · (c / c_ziel − 1)
 */
export function dilutionToTarget(grams: number, mgPerGram: number, targetMgPerGram: number): number {
  if (targetMgPerGram <= 0) return Number.POSITIVE_INFINITY;
  if (targetMgPerGram >= mgPerGram) return 0;
  return grams * (mgPerGram / targetMgPerGram - 1);
}

/** Verhältnis Cannabis : Fett als "1 : x" und als g pro 100 g Fett. */
export function cannabisToFatRatio(cannabisGrams: number, fatGrams: number): {
  oneTo: number;
  per100g: number;
} {
  if (cannabisGrams <= 0 || fatGrams <= 0) return { oneTo: 0, per100g: 0 };
  return { oneTo: fatGrams / cannabisGrams, per100g: (cannabisGrams / fatGrams) * 100 };
}

/** Fettmenge für ein gewünschtes Verhältnis g Cannabis pro 100 g Fett. */
export function fatForRatio(cannabisGrams: number, per100g: number): number {
  if (per100g <= 0) return Number.POSITIVE_INFINITY;
  return (cannabisGrams / per100g) * 100;
}
