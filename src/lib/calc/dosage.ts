import {
  HEALTH_CANADA_EDIBLE_PACKAGE_LIMIT_MG,
  HEALTH_CANADA_START_DOSE_MG,
  STANDARD_THC_UNIT_MG,
} from './constants';

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
    label: 'Einstiegsbereich',
    minMg: 0,
    maxMg: HEALTH_CANADA_START_DOSE_MG,
    tone: 'ok',
    description:
      'Entspricht der Health-Canada-Empfehlung für den Einstieg (≤ 2,5 mg). Auch hier sind Wirkungen möglich – besonders ohne Toleranz.',
  },
  {
    level: 'low',
    label: 'Niedrig',
    minMg: HEALTH_CANADA_START_DOSE_MG,
    maxMg: STANDARD_THC_UNIT_MG,
    tone: 'info',
    description:
      'Bis zu einer "Standard THC Unit" (5 mg). Für Unerfahrene bereits spürbar; nicht nachdosieren, bevor die volle Wirkung erreicht ist.',
  },
  {
    level: 'moderate',
    label: 'Moderat',
    minMg: STANDARD_THC_UNIT_MG,
    maxMg: HEALTH_CANADA_EDIBLE_PACKAGE_LIMIT_MG,
    tone: 'caution',
    description:
      'Bis zur kanadischen Höchstmenge pro Edible-Packung (10 mg). Für Personen ohne Toleranz können unangenehme Wirkungen auftreten.',
  },
  {
    level: 'high',
    label: 'Hoch',
    minMg: HEALTH_CANADA_EDIBLE_PACKAGE_LIMIT_MG,
    maxMg: 20,
    tone: 'warn',
    description:
      'Über der Health-Canada-Packungsgrenze. Deutlich erhöhtes Risiko für Angst, Herzrasen, Übelkeit und starke Beeinträchtigung – besonders bei geringer Toleranz.',
  },
  {
    level: 'veryHigh',
    label: 'Sehr hoch',
    minMg: 20,
    maxMg: 50,
    tone: 'danger',
    description:
      'Ein Vielfaches der Einstiegsdosis. Hohe Wahrscheinlichkeit starker, lang anhaltender Wirkungen; ohne ausgeprägte Toleranz nicht zu empfehlen.',
  },
  {
    level: 'extreme',
    label: 'Extrem',
    minMg: 50,
    maxMg: Number.POSITIVE_INFINITY,
    tone: 'danger',
    description:
      'Sehr hohe Mengen können zu akuter Überdosierung mit Panik, Verwirrtheit, Erbrechen, Kreislaufproblemen oder psychotischen Symptomen führen. Bei Notfällen ärztliche Hilfe holen.',
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
      `Die mögliche Obergrenze (${fmt(high)} mg) liegt bei oder über ${HEALTH_CANADA_EDIBLE_PACKAGE_LIMIT_MG} mg – der Höchstmenge, die Health Canada für eine ganze Edible-Packung zulässt.`,
    );
  }
  if (high > 2 * mid && mid > 0) {
    warnings.push('Die Unsicherheit ist groß: Die tatsächliche Dosis kann mehr als doppelt so hoch sein wie der Mittelwert.');
  }
  if (mid > HEALTH_CANADA_START_DOSE_MG) {
    warnings.push(
      `Für Einsteigende empfiehlt Health Canada höchstens ${fmt(HEALTH_CANADA_START_DOSE_MG)} mg THC. Gegebenenfalls nur einen Teil der Portion essen.`,
    );
  }
  if (highBand.level === 'veryHigh' || highBand.level === 'extreme') {
    warnings.push('Erhebliches Risiko einer Überdosierung. Wirkungen können über 12 Stunden anhalten.');
  }
  return { band, lowBand, highBand, units: standardUnits(mid), warnings };
}

function fmt(n: number): string {
  return n.toLocaleString('de-DE', { maximumFractionDigits: 1 });
}

/**
 * Hinweise zu Toleranz und individuellen Unterschieden (aus Health Canada /
 * LRCUG zusammengefasst).
 */
export const INDIVIDUAL_FACTORS: { title: string; text: string }[] = [
  {
    title: 'Toleranz',
    text: 'Regelmäßiger Konsum führt zu Toleranz gegenüber vielen THC-Wirkungen. Nach Konsumpausen sinkt sie wieder – frühere Mengen können dann zu stark sein.',
  },
  {
    title: 'Körper & Stoffwechsel',
    text: 'Körpergewicht, Fettanteil, Leberstoffwechsel (CYP-Enzyme) und Genetik beeinflussen Aufnahme und Abbau von THC deutlich.',
  },
  {
    title: 'Mageninhalt',
    text: 'Bei Edibles verändern Mahlzeiten und Fettgehalt die Aufnahme. Der Wirkeintritt kann sich verzögern und die Wirkung stärker oder schwächer ausfallen.',
  },
  {
    title: 'Mischkonsum',
    text: 'Alkohol und andere Substanzen verstärken die Beeinträchtigung. Wechselwirkungen mit Medikamenten sind möglich.',
  },
  {
    title: 'Set & Setting',
    text: 'Stimmung, Erwartung und Umgebung beeinflussen das Erleben. Psychische Vorerkrankungen erhöhen das Risiko unangenehmer Reaktionen.',
  },
  {
    title: 'Risikogruppen',
    text: 'Jugendliche, Schwangere und Stillende sowie Personen mit (familiärer) Psychose-Vorgeschichte sollten laut LRCUG auf Cannabis verzichten.',
  },
];

/** Warum Edible-mg und Joint-mg nicht gleichgesetzt werden dürfen. */
export const EDIBLE_VS_SMOKING_FACTS: string[] = [
  'Beim Rauchen erreicht nur ein Teil des THC den Blutkreislauf (typisch ca. 10–35 %). Beim Essen sind es nur ca. 4–12 % – trotzdem wirken Edibles oft stärker und länger.',
  'Grund ist der Leberstoffwechsel: Oral aufgenommenes THC wird vermehrt in 11-Hydroxy-THC umgewandelt, das selbst psychoaktiv ist.',
  'Edibles wirken verzögert (30 Min. bis 2 Std.) und deutlich länger (bis zu 12 Std., Restwirkungen bis 24 Std.).',
  'Eine mg-Angabe für einen Joint (theoretischer Gehalt) und für ein Edible (eingenommene Menge) beschreiben grundverschiedene Dinge.',
];
