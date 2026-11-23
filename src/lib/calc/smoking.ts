import { SMOKING_BIOAVAILABILITY } from './constants';
import { type Range, makeRange, mgFromPercent } from './potency';
import { type FieldRule, type ValidationIssue, validate } from './validation';

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
  grams: { min: 0, max: 10, label: 'Cannabis im Joint', unit: 'g' },
  thcPercent: { min: 0, max: 100, label: 'THC-Gehalt', unit: '%' },
  fractionConsumed: { min: 0, max: 1, label: 'Konsumierter Anteil' },
  people: { min: 1, max: 50, label: 'Personen' },
};

export function validateSmokingInput(input: SmokingInput): ValidationIssue[] {
  const issues = validate(input, SMOKING_RULES as Partial<Record<keyof SmokingInput, FieldRule>>);
  if (!Number.isInteger(input.people)) {
    issues.push({ field: 'people', message: 'Personen müssen eine ganze Zahl sein.' });
  }
  return issues;
}

export function bioavailabilityForProfile(profile: UsageProfile): { low: number; high: number; source: string } {
  switch (profile) {
    case 'occasional':
      return {
        ...SMOKING_BIOAVAILABILITY.occasional,
        source: 'Lindgren et al. 1981: gelegentlich Konsumierende ca. 10 ± 7 %',
      };
    case 'regular':
      return {
        ...SMOKING_BIOAVAILABILITY.regular,
        source: 'Lindgren et al. 1981: regelmäßig Konsumierende ca. 23 ± 16 %',
      };
    default:
      return { ...SMOKING_BIOAVAILABILITY.typical, source: 'Grotenhermen 2003: typischerweise ca. 10–35 %' };
  }
}

export const SMOKING_LOSSES: LossFactor[] = [
  {
    id: 'pyrolysis',
    title: 'Pyrolyse / Verbrennung',
    description: 'Ein Teil des THC wird in der Glut thermisch zerstört, bevor es inhaliert werden kann.',
    magnitude: 'Häufig zitierte Schätzung: ca. 30 % (Grotenhermen 2003)',
  },
  {
    id: 'sidestream',
    title: 'Nebenstromrauch',
    description: 'Zwischen den Zügen verbrennt der Joint weiter; dieser Rauch wird nicht inhaliert.',
    magnitude: 'Stark abhängig von Zugpausen und Glimmdauer',
  },
  {
    id: 'residue',
    title: 'Rückstände im Endstück',
    description: 'THC kondensiert im hinteren Teil des Joints, im Filter bzw. Tip und wird oft weggeworfen.',
    magnitude: 'Variabel; abhängig vom nicht gerauchten Rest',
  },
  {
    id: 'exhaled',
    title: 'Ausgeatmet / nicht absorbiert',
    description: 'Nicht der gesamte inhalierte Rauch gibt sein THC in der Lunge ab; ein Teil wird wieder ausgeatmet.',
    magnitude: 'Abhängig von Zugvolumen, Atemanhalten und Technik',
  },
  {
    id: 'technique',
    title: 'Konsumtechnik & Erfahrung',
    description: 'Erfahrene Konsumierende nehmen typischerweise mehr THC pro Joint auf als unerfahrene.',
    magnitude: 'Literatur: 2–56 % Bioverfügbarkeit (Huestis 2007)',
  },
];

export function toleranceNote(tolerance: Tolerance): string {
  switch (tolerance) {
    case 'none':
      return 'Ohne Toleranz können schon geringe THC-Mengen deutliche Wirkungen und Nebenwirkungen (Angst, Herzrasen, Schwindel) auslösen.';
    case 'low':
      return 'Geringe Toleranz: Die Reaktion auf THC ist schwer vorherzusagen – vorsichtig dosieren.';
    case 'medium':
      return 'Mittlere Toleranz reduziert manche Wirkungen, schützt aber nicht vor Beeinträchtigung der Fahrtüchtigkeit oder Konzentration.';
    case 'high':
      return 'Hohe Toleranz entsteht durch häufigen Konsum und ist mit erhöhtem Risiko einer Abhängigkeit verbunden. Toleranz baut sich bei Pausen wieder ab – nach einer Pause ist Vorsicht geboten.';
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
    'Der theoretische THC-Gehalt ist NICHT die aufgenommene Menge. Die systemisch verfügbare Menge ist meist deutlich kleiner und individuell sehr verschieden.',
    toleranceNote(input.tolerance),
  ];
  if (people > 1) {
    notes.push(
      'Beim Teilen wird eine gleichmäßige Aufteilung angenommen. In der Praxis unterscheiden sich Zuganzahl und Zugtiefe teils erheblich.',
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
