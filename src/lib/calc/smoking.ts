import { SMOKING_BIOAVAILABILITY } from './constants';
import { type Range, makeRange, mgFromPercent } from './potency';
import { type FieldRule, type ValidationIssue, validate } from './validation';
import { t } from '../../i18n';

export type UsageProfile = 'unknown' | 'occasional' | 'regular';
export type Tolerance = 'none' | 'low' | 'medium' | 'high';

export interface SmokingInput {
  grams: number;
  /** Gesamt-THC in % (bei Blüten i. d. R. "Total THC" vom Etikett). */
  thcPercent: number;
  /** Tatsächlich konsumierter Anteil des Joints (0–1). */
  fractionConsumed: number;
  /** Anzahl Personen, auf die sich der Joint verteilt (≥ 1). */
  people: number;
  profile: UsageProfile;
  tolerance: Tolerance;
}

export interface LossFactor {
  id: string;
  title: string;
  description: string;
  /** Größenordnung als Text – bewusst ohne Scheinpräzision. */
  magnitude: string;
}

export interface SmokingResult {
  /** Theoretischer THC-Gehalt des gesamten Joints in mg. */
  theoreticalTotalMg: number;
  /** Theoretisches THC im konsumierten Anteil. */
  theoreticalConsumedMg: number;
  /** Theoretisches THC pro Person (gleichmäßige Aufteilung angenommen). */
  theoreticalPerPersonMg: number;
  /** Grobe Spannbreite der systemischen Aufnahme pro Person (Profil-abhängig). */
  systemicPerPersonMg: Range;
  /** Beobachtete Extremwerte der Literatur (2–56 %). */
  systemicExtremePerPersonMg: Range;
  bioavailability: { low: number; high: number; source: string };
  losses: LossFactor[];
  notes: string[];
}

export const SMOKING_RULES: Record<string, FieldRule> = {
  grams: { min: 0, max: 10, get label() { return t('lab.val.joint'); }, unit: 'g' },
  thcPercent: { min: 0, max: 100, label: 'THC-Gehalt', unit: '%' },
  fractionConsumed: { min: 0, max: 1, get label() { return t('lab.val.fraction'); } },
  people: { min: 1, max: 50, get label() { return t('lab.val.people'); } },
};

export function validateSmokingInput(input: SmokingInput): ValidationIssue[] {
  const issues = validate(input, SMOKING_RULES as Partial<Record<keyof SmokingInput, FieldRule>>);
  if (!Number.isInteger(input.people)) {
    issues.push({ field: 'people', get message() { return t('lab.val.peopleInt'); } });
  }
  return issues;
}

export function bioavailabilityForProfile(profile: UsageProfile): { low: number; high: number; source: string } {
  switch (profile) {
    case 'occasional':
      return {
        ...SMOKING_BIOAVAILABILITY.occasional,
        get source() { return t('lab.sm.srcOccasional'); },
      };
    case 'regular':
      return {
        ...SMOKING_BIOAVAILABILITY.regular,
        get source() { return t('lab.sm.srcRegular'); },
      };
    default:
      return { ...SMOKING_BIOAVAILABILITY.typical, get source() { return t('lab.sm.srcTypical'); } };
  }
}

export const SMOKING_LOSSES: LossFactor[] = [
  {
    id: 'pyrolysis',
    get title() { return t('lab.sm.pyro'); },
    get description() { return t('lab.sm.pyroText'); },
    get magnitude() { return t('lab.sm.pyroMag'); },
  },
  {
    id: 'sidestream',
    get title() { return t('lab.sm.side'); },
    get description() { return t('lab.sm.sideText'); },
    get magnitude() { return t('lab.sm.sideMag'); },
  },
  {
    id: 'residue',
    get title() { return t('lab.sm.butt'); },
    get description() { return t('lab.sm.buttText'); },
    get magnitude() { return t('lab.sm.buttMag'); },
  },
  {
    id: 'exhaled',
    get title() { return t('lab.sm.exhaled'); },
    get description() { return t('lab.sm.exhaledText'); },
    get magnitude() { return t('lab.sm.exhaledMag'); },
  },
  {
    id: 'technique',
    get title() { return t('lab.sm.technique'); },
    get description() { return t('lab.sm.techniqueText'); },
    get magnitude() { return t('lab.sm.techniqueMag'); },
  },
];

export function toleranceNote(tolerance: Tolerance): string {
  switch (tolerance) {
    case 'none':
      return t('lab.sm.tolNone');
    case 'low':
      return t('lab.sm.tolLow');
    case 'medium':
      return t('lab.sm.tolMid');
    case 'high':
      return t('lab.sm.tolHigh');
  }
}

export function calculateSmoking(input: SmokingInput): SmokingResult {
  const people = Math.max(1, Math.round(input.people));
  const theoreticalTotalMg = mgFromPercent(input.grams, input.thcPercent);
  const theoreticalConsumedMg = theoreticalTotalMg * input.fractionConsumed;
  const theoreticalPerPersonMg = theoreticalConsumedMg / people;

  const bio = bioavailabilityForProfile(input.profile);
  const mid = (bio.low + bio.high) / 2;
  const systemicPerPersonMg = makeRange(
    theoreticalPerPersonMg * bio.low,
    theoreticalPerPersonMg * mid,
    theoreticalPerPersonMg * bio.high,
  );
  const ex = SMOKING_BIOAVAILABILITY.extreme;
  const systemicExtremePerPersonMg = makeRange(
    theoreticalPerPersonMg * ex.low,
    theoreticalPerPersonMg * ((ex.low + ex.high) / 2),
    theoreticalPerPersonMg * ex.high,
  );

  const notes: string[] = [
    t('lab.sm.noteTheoretical'),
    toleranceNote(input.tolerance),
  ];
  if (people > 1) {
    notes.push(
      t('lab.sm.noteSharing'),
    );
  }

  return {
    theoreticalTotalMg,
    theoreticalConsumedMg,
    theoreticalPerPersonMg,
    systemicPerPersonMg,
    systemicExtremePerPersonMg,
    bioavailability: bio,
    losses: SMOKING_LOSSES,
    notes,
  };
}

export function defaultSmokingInput(): SmokingInput {
  return {
    grams: 0.5,
    thcPercent: 18,
    fractionConsumed: 0.8,
    people: 1,
    profile: 'unknown',
    tolerance: 'low',
  };
}
