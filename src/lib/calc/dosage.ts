import {
  HEALTH_CANADA_EDIBLE_PACKAGE_LIMIT_MG,
  HEALTH_CANADA_START_DOSE_MG,
  STANDARD_THC_UNIT_MG,
} from './constants';
import { t, intlLocale } from '../../i18n';

/**
 * Vorsichtige Referenzbereiche für ORAL aufgenommenes THC (Edibles).
 *
 * Grundlage:
 * - Health Canada: Einstieg mit ≤ 2,5 mg THC; max. 10 mg THC pro Packung.
 * - Freeman & Lorenzetti (2020): "Standard THC Unit" = 5 mg.
 *
 * Die Bereiche sind eine Orientierung zur Risikoeinschätzung – KEINE Vorhersage
 * der Wirkung. Sie gelten ausdrücklich nicht für Rauchen/Verdampfen.
 */
export type DoseLevel = 'start' | 'low' | 'moderate' | 'high' | 'veryHigh' | 'extreme';

export interface DoseBand {
  level: DoseLevel;
  label: string;
  minMg: number;
  /** Obergrenze exklusiv; Infinity für die letzte Stufe. */
  maxMg: number;
  tone: 'ok' | 'info' | 'caution' | 'warn' | 'danger';
  description: string;
}

export const EDIBLE_DOSE_BANDS: DoseBand[] = [
  {
    level: 'start',
    get label() { return t('lab.dose.start'); },
    minMg: 0,
    maxMg: HEALTH_CANADA_START_DOSE_MG,
    tone: 'ok',
    get description() { return t('lab.dose.startText'); },
  },
  {
    level: 'low',
    get label() { return t('lab.dose.low'); },
    minMg: HEALTH_CANADA_START_DOSE_MG,
    maxMg: STANDARD_THC_UNIT_MG,
    tone: 'info',
    get description() { return t('lab.dose.lowText'); },
  },
  {
    level: 'moderate',
    get label() { return t('lab.dose.moderate'); },
    minMg: STANDARD_THC_UNIT_MG,
    maxMg: HEALTH_CANADA_EDIBLE_PACKAGE_LIMIT_MG,
    tone: 'caution',
    get description() { return t('lab.dose.moderateText'); },
  },
  {
    level: 'high',
    get label() { return t('lab.dose.high'); },
    minMg: HEALTH_CANADA_EDIBLE_PACKAGE_LIMIT_MG,
    maxMg: 20,
    tone: 'warn',
    get description() { return t('lab.dose.highText'); },
  },
  {
    level: 'veryHigh',
    get label() { return t('lab.dose.veryHigh'); },
    minMg: 20,
    maxMg: 50,
    tone: 'danger',
    get description() { return t('lab.dose.veryHighText'); },
  },
  {
    level: 'extreme',
    get label() { return t('lab.dose.extreme'); },
    minMg: 50,
    maxMg: Number.POSITIVE_INFINITY,
    tone: 'danger',
    get description() { return t('lab.dose.extremeText'); },
  },
];

export function classifyEdibleDose(mg: number): DoseBand {
  const value = Number.isFinite(mg) && mg > 0 ? mg : 0;
  const band = EDIBLE_DOSE_BANDS.find((b) => value >= b.minMg && value < b.maxMg);
  return band ?? EDIBLE_DOSE_BANDS[EDIBLE_DOSE_BANDS.length - 1]!;
}

/** Vielfaches einer Standard-THC-Einheit (5 mg). */
export function standardUnits(mg: number): number {
  return mg / STANDARD_THC_UNIT_MG;
}

/**
 * Logarithmische Position (0–1) einer Dosis auf einer Skala von 0,5 bis 100 mg –
 * für die Visualisierung, damit kleine Dosen nicht zusammengedrückt werden.
 */
export function doseScalePosition(mg: number, minMg = 0.5, maxMg = 100): number {
  if (!Number.isFinite(mg) || mg <= minMg) return 0;
  if (mg >= maxMg) return 1;
  return Math.log(mg / minMg) / Math.log(maxMg / minMg);
}

export interface DoseAssessment {
  band: DoseBand;
  /** Band für die Unter- bzw. Obergrenze, falls ein Bereich angegeben wurde. */
  lowBand: DoseBand;
  highBand: DoseBand;
  units: number;
  warnings: string[];
}

/**
 * Bewertet eine Edible-Dosis (optional mit Unsicherheitsbereich).
 * Maßgeblich für Warnungen ist die OBERGRENZE – Vorsicht vor Unterschätzung.
 */
export function assessEdibleDose(mid: number, low = mid, high = mid): DoseAssessment {
  const band = classifyEdibleDose(mid);
  const lowBand = classifyEdibleDose(low);
  const highBand = classifyEdibleDose(high);
  const warnings: string[] = [];

  if (high >= HEALTH_CANADA_EDIBLE_PACKAGE_LIMIT_MG) {
    warnings.push(
      t('lab.dose.wPackage', { high: fmt(high), limit: HEALTH_CANADA_EDIBLE_PACKAGE_LIMIT_MG }),
    );
  }
  if (high > 2 * mid && mid > 0) {
    warnings.push(t('lab.dose.wUncertainty'));
  }
  if (mid > HEALTH_CANADA_START_DOSE_MG) {
    warnings.push(
      t('lab.dose.wStart', { n: fmt(HEALTH_CANADA_START_DOSE_MG) }),
    );
  }
  if (highBand.level === 'veryHigh' || highBand.level === 'extreme') {
    warnings.push(t('lab.dose.wOverdose'));
  }
  return { band, lowBand, highBand, units: standardUnits(mid), warnings };
}

function fmt(n: number): string {
  return n.toLocaleString(intlLocale(), { maximumFractionDigits: 1 });
}

/**
 * Hinweise zu Toleranz und individuellen Unterschieden (aus Health Canada /
 * LRCUG zusammengefasst).
 */
export const INDIVIDUAL_FACTORS: { title: string; text: string }[] = [
  {
    get title() { return t('lab.factor.tolerance'); },
    get text() { return t('lab.factor.toleranceText'); },
  },
  {
    get title() { return t('lab.factor.body'); },
    get text() { return t('lab.factor.bodyText'); },
  },
  {
    get title() { return t('lab.factor.stomach'); },
    get text() { return t('lab.factor.stomachText'); },
  },
  {
    get title() { return t('lab.factor.mixing'); },
    get text() { return t('lab.factor.mixingText'); },
  },
  {
    get title() { return t('lab.factor.set'); },
    get text() { return t('lab.factor.setText'); },
  },
  {
    get title() { return t('lab.factor.risk'); },
    get text() { return t('lab.factor.riskText'); },
  },
];

/** Warum Edible-mg und Joint-mg nicht gleichgesetzt werden dürfen. */
export const edibleVsSmokingFacts = (): string[] => [t('lab.dose.fact1'), t('lab.dose.fact2'), t('lab.dose.fact3'), t('lab.dose.fact4')];
