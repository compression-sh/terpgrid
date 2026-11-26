/**
 * Darstellung öffentlicher Laborproben (Smith et al. 2022) – Zuordnung der Quellspalten zu
 * Atlas-Verbindungen und Cannabinoid-Bezeichnungen. Muss zu server/src/catalog/samples.ts passen (Test).
 */
import type { LabReport } from '../db/types';
import { toPercent, totalCbd, totalThc } from '../lab';
import { matchTerpene } from './terpenes';

export const SAMPLE_CANNABINOIDS: { key: string; label: string }[] = [
  { key: 'thc_total', label: 'Gesamt-THC' },
  { key: 'cbd_total', label: 'Gesamt-CBD' },
  { key: 'cbg_total', label: 'Gesamt-CBG' },
  { key: 'cbc_total', label: 'Gesamt-CBC' },
  { key: 'cbn_total', label: 'Gesamt-CBN' },
  { key: 'thcv_total', label: 'Gesamt-THCV' },
];

/** Quellspalte → Atlas-ID; isomerSum = Summe mehrerer Isomere (nicht die genannte Einzelform). */
export const SAMPLE_TERPENES: { column: string; atlasId: string; label: string; isomerSum?: string }[] = [
  { column: 'myrcene', atlasId: 'myrcene', label: 'Myrcen' },
  { column: 'caryophyllene', atlasId: 'caryophyllene', label: 'β-Caryophyllen' },
  { column: 'limonene', atlasId: 'limonene', label: 'Limonen' },
  { column: 'humulene', atlasId: 'humulene', label: 'α-Humulen' },
  { column: 'linalool', atlasId: 'linalool', label: 'Linalool' },
  { column: 'a_pinene', atlasId: 'alpha-pinene', label: 'α-Pinen' },
  { column: 'b_pinene', atlasId: 'beta-pinene', label: 'β-Pinen' },
  { column: 'terpinolene', atlasId: 'terpinolene', label: 'Terpinolen' },
  { column: 'tot_ocimene', atlasId: 'beta-ocimene', label: 'Ocimen', isomerSum: 'Summe aller Ocimen-Isomere' },
  { column: 'bisabolol', atlasId: 'bisabolol', label: 'Bisabolol' },
  { column: 'tot_nerolidol_ct', atlasId: 'trans-nerolidol', label: 'Nerolidol', isomerSum: 'Summe aus cis- und trans-Nerolidol' },
  { column: 'camphene', atlasId: 'camphene', label: 'Camphen' },
  { column: 'a_terpinene', atlasId: 'alpha-terpinene', label: 'α-Terpinen' },
  { column: 'g_terpinene', atlasId: 'gamma-terpinene', label: 'γ-Terpinen' },
];

export const REGION_LABEL: Record<string, string> = { AK: 'Alaska', CA: 'Kalifornien', FL: 'Florida', MI: 'Michigan', OR: 'Oregon', WA: 'Washington' };

/**
 * Werte eines eigenen (privaten) Laborberichts in % (w/w) je Quellspalte – nur für die Anzeige im Browser.
 * Isomer-Summen werden nicht mit Einzelwerten des eigenen Berichts verglichen.
 */
export function ownReportPercent(r: LabReport): { cannabinoids: Record<string, number>; terpenes: Record<string, number> } {
  const cannabinoids: Record<string, number> = {};
  // Gleiche Rechnung wie Lab Insights (berechnet vor deklariert), danach in % umgerechnet
  const thc = toPercent(totalThc(r).computed ?? totalThc(r).declared, r.unit);
  const cbd = toPercent(totalCbd(r).computed ?? totalCbd(r).declared, r.unit);
  if (thc !== undefined) cannabinoids.thc_total = Math.round(thc * 100) / 100;
  if (cbd !== undefined) cannabinoids.cbd_total = Math.round(cbd * 100) / 100;
  const terpenes: Record<string, number> = {};
  for (const t of r.terpenes) {
    const id = matchTerpene(t.name)?.id;
    const col = SAMPLE_TERPENES.find((x) => x.atlasId === id && !x.isomerSum);
    const v = toPercent(t.value, r.unit);
    if (col && v !== undefined) terpenes[col.column] = Math.round(v * 1000) / 1000;
  }
  return { cannabinoids, terpenes };
}
