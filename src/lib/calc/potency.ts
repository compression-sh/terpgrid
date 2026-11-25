import { MG_PER_G, PERCENT, THCA_TO_THC_FACTOR } from './constants';

/** Ein Schätzwert mit unterer/oberer Grenze. */
export interface Range {
  low: number;
  mid: number;
  high: number;
}

export function makeRange(low: number, mid: number, high: number): Range {
  return { low: Math.min(low, mid), mid, high: Math.max(high, mid) };
}

/**
 * Wie wurde der THC-Gehalt angegeben?
 * - `total`: Gesamt-THC (bereits "potentielles THC" inkl. umgerechnetem THCA,
 *   so steht es auf den meisten Laborzertifikaten/Etiketten). Faktor 0,877 wird
 *   NICHT erneut angewandt.
 * - `separate`: freies Δ9-THC und THCA getrennt. THCA wird mit 0,877 umgerechnet.
 */
export type PotencyMode = 'total' | 'separate';

export interface PotencyInput {
  mode: PotencyMode;
  /** Gesamt-THC in % (mode = total) bzw. freies Δ9-THC in % (mode = separate). */
  thcPercent: number;
  /** THCA in % – nur bei mode = separate relevant. */
  thcaPercent?: number;
}

export interface PotencyBreakdown {
  /** Theoretisches Gesamt-THC in % (max. erreichbar bei 100 % Decarboxylierung). */
  totalThcPercent: number;
  /** Bereits als THC vorliegender Anteil in %. */
  freeThcPercent: number;
  /** Aus THCA maximal entstehendes THC in % (THCA × 0,877). */
  thcFromThcaPercent: number;
  /** Ob der Gesamtwert die Aufteilung frei/THCA kennt. */
  splitKnown: boolean;
}

/**
 * Berechnet das theoretisch maximal verfügbare THC.
 * Formel (separat): THC_total = THC + 0,877 × THCA
 */
export function totalThcPercent(input: PotencyInput): PotencyBreakdown {
  if (input.mode === 'total') {
    return {
      totalThcPercent: input.thcPercent,
      freeThcPercent: 0,
      thcFromThcaPercent: input.thcPercent,
      splitKnown: false,
    };
  }
  const thca = input.thcaPercent ?? 0;
  const fromThca = thca * THCA_TO_THC_FACTOR;
  return {
    totalThcPercent: input.thcPercent + fromThca,
    freeThcPercent: input.thcPercent,
    thcFromThcaPercent: fromThca,
    splitKnown: true,
  };
}

/** mg THC in einer Materialmenge bei gegebenem Prozentgehalt. */
export function mgFromPercent(grams: number, percent: number): number {
  return grams * MG_PER_G * (percent / PERCENT);
}

/** Prozentgehalt aus mg Wirkstoff und Gramm Material. */
export function percentFromMg(mg: number, grams: number): number {
  if (grams <= 0) return 0;
  return (mg / (grams * MG_PER_G)) * PERCENT;
}

/** Gramm Material, die eine bestimmte mg-Menge bei gegebenem Prozentgehalt enthalten. */
export function gramsForMg(mg: number, percent: number): number {
  if (percent <= 0) return Number.POSITIVE_INFINITY;
  return mg / (MG_PER_G * (percent / PERCENT));
}

export type PotencyCategory = 'niedrig' | 'mittel' | 'hoch' | 'sehr hoch' | 'extrem';

export interface PotencyClassification {
  category: PotencyCategory;
  description: string;
  /** Position 0–1 auf der Skala 0–35 % (Konzentrate darüber). */
  scalePosition: number;
}

/**
 * Grobe, nicht-offizielle Einordnung der Blüten-Potenz.
 * Health Canada beschreibt einen Anstieg des durchschnittlichen THC-Gehalts von
 * ca. 3 % (1980er) auf ca. 15 % heute, mit einzelnen Sorten über 30 %.
 */
export function classifyFlowerPotency(totalThc: number): PotencyClassification {
  const scalePosition = Math.min(1, Math.max(0, totalThc / 35));
  if (totalThc < 10)
    return {
      category: 'niedrig',
      description: 'Eher niedriger THC-Gehalt – vergleichbar mit älteren oder CBD-reicheren Sorten.',
      scalePosition,
    };
  if (totalThc < 15)
    return {
      category: 'mittel',
      description: 'Mittlerer THC-Gehalt, etwa im Bereich heutiger Durchschnittswerte.',
      scalePosition,
    };
  if (totalThc < 20)
    return {
      category: 'hoch',
      description: 'Überdurchschnittlicher THC-Gehalt. Bereits kleine Mengen können stark wirken.',
      scalePosition,
    };
  if (totalThc <= 35)
    return {
      category: 'sehr hoch',
      description:
        'Sehr hoher THC-Gehalt. Höhere THC-Gehalte sind mit einem höheren Risiko für akute und langfristige Schäden verbunden (LRCUG).',
      scalePosition,
    };
  return {
    category: 'extrem',
    description:
      'Werte über ~35 % sind für Blüten unüblich und typisch für Konzentrate/Extrakte. Bitte Angabe prüfen.',
    scalePosition,
  };
}
