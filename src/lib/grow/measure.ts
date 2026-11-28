import { t, labels } from '../../i18n';
/**
 * Umrechnungen und abgeleitete Größen für Messwerte – alle Formeln offen gelegt.
 * Abgeleitete Werte (VPD, DLI) werden nie gespeichert, sondern aus den erfassten
 * Rohwerten berechnet und als „berechnet“ gekennzeichnet.
 */
import type { EcUnit, MeasureContext, Measurements } from '../db/types';

export const CONTEXT_LABEL = labels('labels.measureContext', ['water', 'nutrient', 'runoff', 'substrate', 'other'] as MeasureContext[]);

export const EC_UNITS: { id: EcUnit; label: string; hint: string }[] = [
  { id: 'mS/cm', label: 'mS/cm', get hint() { return t('grow.ec.ms'); } },
  { id: 'µS/cm', label: 'µS/cm', hint: '1000 µS/cm = 1 mS/cm' },
  { id: 'ppm500', get label() { return t('grow.ec.p500'); }, get hint() { return t('grow.ec.p500h'); } },
  { id: 'ppm700', get label() { return t('grow.ec.p700'); }, get hint() { return t('grow.ec.p700h'); } },
];

/** Umrechnung in mS/cm. ppm-Werte hängen von der Skala des Messgeräts ab – daher muss sie gewählt werden. */
export function ecToMsCm(value: number, unit: EcUnit): number {
  const v = unit === 'mS/cm' ? value : unit === 'µS/cm' ? value / 1000 : unit === 'ppm500' ? value / 500 : value / 700;
  return Math.round(v * 1000) / 1000;
}

export function msCmTo(value: number, unit: EcUnit): number {
  const v = unit === 'mS/cm' ? value : unit === 'µS/cm' ? value * 1000 : unit === 'ppm500' ? value * 500 : value * 700;
  return Math.round(v * 1000) / 1000;
}

/** Plausible Eingabegrenzen je Einheit (entspricht 0–20 mS/cm). */
export const EC_LIMITS: Record<EcUnit, number> = { 'mS/cm': 20, 'µS/cm': 20_000, ppm500: 10_000, ppm700: 14_000 };

/** Sättigungsdampfdruck in kPa (Tetens-Gleichung). */
export function svpKPa(tC: number): number {
  return 0.61078 * Math.exp((17.27 * tC) / (tC + 237.3));
}

export interface VpdResult {
  value: number;
  /** leaf = mit (gemessener oder geschätzter) Blatttemperatur; air = Blatt = Luft angenommen */
  basis: 'leaf' | 'leaf-estimated' | 'air';
  formula: string;
}

/**
 * Dampfdruckdefizit (kPa): VPD = SVP(T_Blatt) − SVP(T_Luft) × rF/100.
 * Ohne Blatttemperatur wird T_Blatt = T_Luft angenommen (Luft-VPD) und so gekennzeichnet.
 */
export function vpd(m: Pick<Measurements, 'temperatureC' | 'humidityPct' | 'leafTempC' | 'leafTempEstimated'>): VpdResult | undefined {
  const tv = m.temperatureC;
  const rh = m.humidityPct;
  if (tv === undefined || rh === undefined || !Number.isFinite(tv) || !Number.isFinite(rh) || rh < 0 || rh > 100) return undefined;
  const leaf = m.leafTempC;
  const tl = leaf !== undefined && Number.isFinite(leaf) ? leaf : tv;
  const value = Math.round((svpKPa(tl) - svpKPa(tv) * (rh / 100)) * 100) / 100;
  return {
    value,
    basis: leaf === undefined ? 'air' : m.leafTempEstimated ? 'leaf-estimated' : 'leaf',
    get formula() { return t('grow.ec.vpdFormula'); },
  };
}

/**
 * Tageslichtintegral (mol/m²/Tag) = PPFD × Lichtstunden × 3600 / 10⁶.
 * Annahme: konstante PPFD während der gesamten Lichtphase (ein Messpunkt).
 */
export function dli(m: Pick<Measurements, 'ppfd' | 'photoperiodH'>): number | undefined {
  if (m.ppfd === undefined || m.photoperiodH === undefined || m.ppfd < 0 || m.photoperiodH < 0 || m.photoperiodH > 24) return undefined;
  return Math.round(((m.ppfd * m.photoperiodH * 3600) / 1e6) * 10) / 10;
}

export const VPD_BASIS_LABEL = labels('labels.vpdBasis', ['leaf', 'leaf-estimated', 'air'] as VpdResult['basis'][]);
