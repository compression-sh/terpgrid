/**
 * Darstellung öffentlicher Laborproben (Smith et al. 2022) – Zuordnung der Quellspalten zu
 * Atlas-Verbindungen und Cannabinoid-Bezeichnungen. Muss zu server/src/catalog/samples.ts passen (Test).
 */
import type { LabReport } from '../db/types';
import { toPercent, totalCbd, totalThc } from '../lab';
import { matchTerpene } from './terpenes';
import { t } from '../../i18n';

export const SAMPLE_CANNABINOIDS: { key: string; label: string }[] = [
  { key: 'thc_total', get label() { return t('discover.total', { c: 'THC' }); } },
  { key: 'cbd_total', get label() { return t('discover.total', { c: 'CBD' }); } },
  { key: 'cbg_total', get label() { return t('discover.total', { c: 'CBG' }); } },
  { key: 'cbc_total', get label() { return t('discover.total', { c: 'CBC' }); } },
  { key: 'cbn_total', get label() { return t('discover.total', { c: 'CBN' }); } },
  { key: 'thcv_total', get label() { return t('discover.total', { c: 'THCV' }); } },
];

/** Quellspalte → Atlas-ID; isomerSum = Summe mehrerer Isomere (nicht die genannte Einzelform). */
export const SAMPLE_TERPENES: { column: string; atlasId: string; label: string; isomerSum?: string }[] = [
  { column: 'myrcene', atlasId: 'myrcene', get label() { return t('discover.terp.myrcene'); } },
  { column: 'caryophyllene', atlasId: 'caryophyllene', get label() { return t('discover.terp.caryophyllene'); } },
  { column: 'limonene', atlasId: 'limonene', get label() { return t('discover.terp.limonene'); } },
  { column: 'humulene', atlasId: 'humulene', get label() { return t('discover.terp.humulene'); } },
  { column: 'linalool', atlasId: 'linalool', label: 'Linalool' },
  { column: 'a_pinene', atlasId: 'alpha-pinene', get label() { return t('discover.terp.aPinene'); } },
  { column: 'b_pinene', atlasId: 'beta-pinene', get label() { return t('discover.terp.bPinene'); } },
  { column: 'terpinolene', atlasId: 'terpinolene', get label() { return t('discover.terp.terpinolene'); } },
  { column: 'tot_ocimene', atlasId: 'beta-ocimene', get label() { return t('discover.terp.ocimene'); }, get isomerSum() { return t('discover.terp.ocimeneSum'); } },
  { column: 'bisabolol', atlasId: 'bisabolol', label: 'Bisabolol' },
  { column: 'tot_nerolidol_ct', atlasId: 'trans-nerolidol', label: 'Nerolidol', get isomerSum() { return t('discover.terp.nerolidolSum'); } },
  { column: 'camphene', atlasId: 'camphene', get label() { return t('discover.terp.camphene'); } },
  { column: 'a_terpinene', atlasId: 'alpha-terpinene', get label() { return t('discover.terp.aTerpinene'); } },
  { column: 'g_terpinene', atlasId: 'gamma-terpinene', get label() { return t('discover.terp.gTerpinene'); } },
];

export const REGION_LABEL: Record<string, string> = { AK: 'Alaska', get CA() { return t('discover.region.CA'); }, FL: 'Florida', MI: 'Michigan', OR: 'Oregon', WA: 'Washington' };

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
