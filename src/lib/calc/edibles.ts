import {
  DECARB_EFFICIENCY_SPREAD,
  EXTRACTION_EFFICIENCY_SPREAD,
  MG_PER_G,
  PERCENT,
} from './constants';
import { type PotencyInput, type Range, makeRange, totalThcPercent } from './potency';
import { type FieldRule, type ValidationIssue, clamp, validate } from './validation';

/**
 * Modell (jeder Verlust wird genau EINMAL angewandt):
 *
 *   THC_theor   = m_Cannabis · 1000 · (THC_total % / 100)
 *                 mit THC_total = THC + 0,877 · THCA (nur im Modus "separat")
 *   THC_decarb  = m · 1000 · (THC_frei + THC_aus_THCA · η_decarb) / 100
 *                 (im Modus "Gesamt-THC": THC_theor · η_decarb)
 *   THC_Fett    = THC_decarb · η_extraktion
 *   c [mg/g]    = THC_Fett / m_Fett
 *
 * η_extraktion ist definiert als Anteil des decarboxylierten THC, der in die
 * GESAMTE Fettphase übergeht. Fett, das beim Abseihen im Pflanzenmaterial
 * zurückbleibt, enthält THC in derselben Konzentration – es reduziert daher nur
 * die zurückgewonnene Menge, nicht die Konzentration. So wird der Abseihverlust
 * nicht doppelt (einmal über η_extraktion und einmal über die Fettmenge) gezählt.
 */

export type RecipeFatMode = 'perRecipe' | 'perPortion';

export interface EdibleInput {
  cannabisGrams: number;
  potency: PotencyInput;
  /** Material ist bereits decarboxyliert → η_decarb wird nicht angewandt. */
  alreadyDecarbed: boolean;
  /** Eingesetzte Butter-/Ölmenge in g. */
  fatGrams: number;
  /** Anteil Fett, der beim Abseihen im Pflanzenmaterial verbleibt (0–1). */
  strainLoss: number;
  /** Decarboxylierungsausbeute (0–1). */
  decarbEfficiency: number;
  /** Extraktionsausbeute in das Fett (0–1). */
  extractionEfficiency: number;
  /** Relative Unsicherheit der THC-Angabe (0–1). */
  labelUncertainty: number;
  recipeFatMode: RecipeFatMode;
  /** g Butter im Rezept (perRecipe) bzw. pro Portion (perPortion). */
  recipeFatGrams: number;
  portions: number;
}

export interface EdibleResult {
  totalThcPercent: number;
  theoreticalMg: Range;
  afterDecarbMg: Range;
  inFatMg: Range;
  recoveredFatGrams: number;
  recoveredFatMg: Range;
  mgPerGramFat: Range;
  recipeFatGrams: number;
  fatPerPortionGrams: number;
  recipeMg: Range;
  perPortionMg: Range;
  /** Mittelwerte der Verluste in mg (für Diagramme). */
  losses: {
    decarbMg: number;
    extractionMg: number;
    strainMg: number;
  };
  /** Verhältnis hoch/niedrig der Portionsdosis (z. B. 2,4 = Faktor 2,4). */
  spreadFactor: number;
  /** Cannabis-zu-Fett-Verhältnis in g Cannabis pro 100 g Fett. */
  cannabisPer100gFat: number;
  warnings: string[];
}

export const EDIBLE_RULES: Record<string, FieldRule> = {
  cannabisGrams: { min: 0, max: 1000, label: 'Cannabis-Menge', unit: 'g' },
  thcPercent: { min: 0, max: 100, allowZero: true, label: 'THC-Gehalt', unit: '%' },
  thcaPercent: { min: 0, max: 100, allowZero: true, label: 'THCA-Gehalt', unit: '%' },
  fatGrams: { min: 0, max: 10000, label: 'Butter-/Ölmenge', unit: 'g' },
  strainLoss: { min: 0, max: 0.9, allowZero: true, label: 'Abseihverlust' },
  decarbEfficiency: { min: 0.01, max: 1, label: 'Decarboxylierungsausbeute' },
  extractionEfficiency: { min: 0.01, max: 1, label: 'Extraktionsausbeute' },
  labelUncertainty: { min: 0, max: 0.9, allowZero: true, label: 'Unsicherheit THC-Angabe' },
  recipeFatGrams: { min: 0, max: 10000, label: 'Butter im Rezept', unit: 'g' },
  portions: { min: 1, max: 1000, label: 'Portionen' },
};

export function validateEdibleInput(input: EdibleInput): ValidationIssue[] {
  const flat = {
    ...input,
    thcPercent: input.potency.thcPercent,
    thcaPercent: input.potency.thcaPercent ?? 0,
  };
  const issues = validate(flat, EDIBLE_RULES as Partial<Record<keyof typeof flat, FieldRule>>);
  const total = totalThcPercent(input.potency).totalThcPercent;
  if (total > 100) {
    issues.push({ field: 'thcPercent', message: 'THC + THCA ergibt mehr als 100 % – bitte Werte prüfen.' });
  }
  if (input.potency.mode === 'separate' && total === 0) {
    issues.push({ field: 'thcPercent', message: 'Bitte THC- oder THCA-Gehalt angeben.' });
  }
  if (input.potency.mode === 'total' && input.potency.thcPercent === 0) {
    issues.push({ field: 'thcPercent', message: 'THC-Gehalt muss größer als 0 sein.' });
  }
  if (!Number.isInteger(input.portions)) {
    issues.push({ field: 'portions', message: 'Portionen müssen eine ganze Zahl sein.' });
  }
  return issues;
}

/** Untere/obere Effizienzgrenzen für die Unsicherheitsbetrachtung. */
export function efficiencyBounds(eff: number, spread: number): Range {
  return makeRange(clamp(eff - spread, 0, 1), clamp(eff, 0, 1), clamp(eff + spread, 0, 1));
}

/**
 * mg THC im Material nach Decarboxylierung – für eine gegebene Effizienz.
 * Der Faktor 0,877 steckt bereits in totalThcPercent (nur im Modus "separat").
 */
function decarbedPercent(input: Pick<EdibleInput, 'potency' | 'alreadyDecarbed'>, decarbEff: number): number {
  const p = totalThcPercent(input.potency);
  if (input.alreadyDecarbed) return p.totalThcPercent;
  if (p.splitKnown) return p.freeThcPercent + p.thcFromThcaPercent * decarbEff;
  return p.totalThcPercent * decarbEff;
}

/**
 * Effektive Ausbeute: mg THC im Fett pro Gramm Cannabis.
 */
export function effectiveYieldMgPerGram(
  input: Pick<EdibleInput, 'potency' | 'alreadyDecarbed'>,
  decarbEff: number,
  extractionEff: number,
): number {
  return (decarbedPercent(input, decarbEff) / PERCENT) * MG_PER_G * extractionEff;
}

export function calculateEdibles(input: EdibleInput): EdibleResult {
  const potency = totalThcPercent(input.potency);
  const u = clamp(input.labelUncertainty, 0, 0.99);
  const labelLow = 1 - u;
  const labelHigh = 1 + u;

  const decarb = input.alreadyDecarbed
    ? makeRange(1, 1, 1)
    : efficiencyBounds(input.decarbEfficiency, DECARB_EFFICIENCY_SPREAD);
  const extraction = efficiencyBounds(input.extractionEfficiency, EXTRACTION_EFFICIENCY_SPREAD);

  const theoreticalMid = input.cannabisGrams * MG_PER_G * (potency.totalThcPercent / PERCENT);
  const theoreticalMg = makeRange(theoreticalMid * labelLow, theoreticalMid, theoreticalMid * labelHigh);

  const decarbMgAt = (eff: number) => input.cannabisGrams * MG_PER_G * (decarbedPercent(input, eff) / PERCENT);
  const afterDecarbMg = makeRange(
    decarbMgAt(decarb.low) * labelLow,
    decarbMgAt(decarb.mid),
    decarbMgAt(decarb.high) * labelHigh,
  );

  const inFatMg = makeRange(
    afterDecarbMg.low * extraction.low,
    afterDecarbMg.mid * extraction.mid,
    afterDecarbMg.high * extraction.high,
  );

  const fat = input.fatGrams;
  const strainLoss = clamp(input.strainLoss, 0, 0.99);
  const recoveredFatGrams = fat * (1 - strainLoss);
  const per = (mg: number) => (fat > 0 ? mg / fat : 0);
  const mgPerGramFat = makeRange(per(inFatMg.low), per(inFatMg.mid), per(inFatMg.high));
  const recoveredFatMg = makeRange(
    mgPerGramFat.low * recoveredFatGrams,
    mgPerGramFat.mid * recoveredFatGrams,
    mgPerGramFat.high * recoveredFatGrams,
  );

  const portions = Math.max(1, Math.round(input.portions));
  const recipeFatGrams =
    input.recipeFatMode === 'perRecipe' ? input.recipeFatGrams : input.recipeFatGrams * portions;
  const fatPerPortionGrams = recipeFatGrams / portions;

  const recipeMg = makeRange(
    mgPerGramFat.low * recipeFatGrams,
    mgPerGramFat.mid * recipeFatGrams,
    mgPerGramFat.high * recipeFatGrams,
  );
  const perPortionMg = makeRange(recipeMg.low / portions, recipeMg.mid / portions, recipeMg.high / portions);

  const decarbLoss = theoreticalMid - afterDecarbMg.mid;
  const extractionLoss = afterDecarbMg.mid - inFatMg.mid;
  const strainMg = inFatMg.mid - recoveredFatMg.mid;

  const warnings: string[] = [];
  if (recipeFatGrams > recoveredFatGrams + 1e-9) {
    warnings.push(
      `Das Rezept benötigt ${round1(recipeFatGrams)} g Butter/Öl, nach dem Abseihen stehen aber nur ca. ${round1(
        recoveredFatGrams,
      )} g zur Verfügung.`,
    );
  }
  if (input.cannabisGrams > 0 && fat > 0 && input.cannabisGrams / fat > 0.5) {
    warnings.push(
      'Sehr hohes Cannabis-zu-Fett-Verhältnis: Das Fett kann gesättigt sein bzw. vom Pflanzenmaterial aufgesogen werden – die Extraktion ist dann vermutlich geringer.',
    );
  }

  return {
    totalThcPercent: potency.totalThcPercent,
    theoreticalMg,
    afterDecarbMg,
    inFatMg,
    recoveredFatGrams,
    recoveredFatMg,
    mgPerGramFat,
    recipeFatGrams,
    fatPerPortionGrams,
    recipeMg,
    perPortionMg,
    losses: { decarbMg: decarbLoss, extractionMg: extractionLoss, strainMg },
    spreadFactor: perPortionMg.low > 0 ? perPortionMg.high / perPortionMg.low : Number.POSITIVE_INFINITY,
    cannabisPer100gFat: fat > 0 ? (input.cannabisGrams / fat) * 100 : 0,
    warnings,
  };
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export interface RequiredCannabisInput {
  potency: PotencyInput;
  alreadyDecarbed: boolean;
  decarbEfficiency: number;
  extractionEfficiency: number;
  labelUncertainty: number;
  /** Ziel: mg THC pro Gramm Fett. */
  targetMgPerGramFat: number;
  /** Gesamte Fettmenge, die infundiert wird. */
  fatGrams: number;
}

export interface RequiredCannabisResult {
  /** Rechnerisch benötigte Cannabis-Menge in g (Mittelwert-Annahmen). */
  grams: number;
  /**
   * Spannweite: `low` = benötigte Menge, falls alle Faktoren am oberen Ende liegen
   * (das Material ist stärker als angenommen), `high` = falls alle am unteren Ende.
   */
  range: Range;
  targetTotalMg: number;
  yieldMgPerGram: number;
}

/**
 * Umkehrrechnung: m_Cannabis = (c_Ziel · m_Fett) / Ausbeute_pro_g
 */
export function requiredCannabis(input: RequiredCannabisInput): RequiredCannabisResult {
  const targetTotalMg = input.targetMgPerGramFat * input.fatGrams;
  const u = clamp(input.labelUncertainty, 0, 0.99);
  const decarb = input.alreadyDecarbed
    ? makeRange(1, 1, 1)
    : efficiencyBounds(input.decarbEfficiency, DECARB_EFFICIENCY_SPREAD);
  const extraction = efficiencyBounds(input.extractionEfficiency, EXTRACTION_EFFICIENCY_SPREAD);

  const yieldMid = effectiveYieldMgPerGram(input, decarb.mid, extraction.mid);
  const yieldHigh = effectiveYieldMgPerGram(input, decarb.high, extraction.high) * (1 + u);
  const yieldLow = effectiveYieldMgPerGram(input, decarb.low, extraction.low) * (1 - u);

  const g = (y: number) => (y > 0 ? targetTotalMg / y : Number.POSITIVE_INFINITY);
  return {
    grams: g(yieldMid),
    range: makeRange(g(yieldHigh), g(yieldMid), g(yieldLow)),
    targetTotalMg,
    yieldMgPerGram: yieldMid,
  };
}

/**
 * Umkehrrechner für eine gewünschte Dosis pro Portion.
 * Benötigte Konzentration c = (mg_Portion · Portionen) / g_Fett_im_Rezept
 */
export function requiredConcentrationForPortion(
  targetMgPerPortion: number,
  portions: number,
  recipeFatGrams: number,
): number {
  if (recipeFatGrams <= 0) return Number.POSITIVE_INFINITY;
  return (targetMgPerPortion * portions) / recipeFatGrams;
}

/**
 * Wie viel fertige Butter (mit bekannter Konzentration) wird für eine gewünschte
 * Dosis pro Portion benötigt?
 */
export function fatNeededForPortionDose(
  targetMgPerPortion: number,
  portions: number,
  mgPerGramFat: number,
): number {
  if (mgPerGramFat <= 0) return Number.POSITIVE_INFINITY;
  return (targetMgPerPortion * portions) / mgPerGramFat;
}

export function defaultEdibleInput(): EdibleInput {
  return {
    cannabisGrams: 7,
    potency: { mode: 'total', thcPercent: 18, thcaPercent: 0 },
    alreadyDecarbed: false,
    fatGrams: 250,
    strainLoss: 0.1,
    decarbEfficiency: 0.85,
    extractionEfficiency: 0.7,
    labelUncertainty: 0.2,
    recipeFatMode: 'perRecipe',
    recipeFatGrams: 50,
    portions: 16,
  };
}
