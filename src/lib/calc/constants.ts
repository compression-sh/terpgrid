/**
 * Zentrale wissenschaftliche Konstanten und Annahmen.
 *
 * Jeder Wert ist entweder eine physikalisch-chemische Größe (z. B. Molmassen)
 * oder eine ausdrücklich als Annahme gekennzeichnete Voreinstellung mit Quelle.
 * Annahmen werden in der UI immer als einstellbar und unsicher dargestellt.
 */

/** Molmasse Δ9-THC (C21H30O2) in g/mol. */
export const MOLAR_MASS_THC = 314.469;
/** Molmasse THCA-A (C22H30O4) in g/mol. */
export const MOLAR_MASS_THCA = 358.478;

/**
 * Umrechnungsfaktor THCA → THC (Verlust der Carboxylgruppe als CO2).
 * 314.469 / 358.478 ≈ 0.8772 – in Laboranalysen üblich gerundet auf 0.877.
 */
export const THCA_TO_THC_FACTOR = 0.877;

/** Prozentpunkte – Hilfskonstante für Lesbarkeit. */
export const PERCENT = 100;
/** Milligramm pro Gramm. */
export const MG_PER_G = 1000;

/**
 * Voreinstellung Decarboxylierungsausbeute (Anteil des theoretisch maximalen THC,
 * der nach dem Erhitzen tatsächlich als THC vorliegt; berücksichtigt unvollständige
 * Umwandlung und thermischen Abbau). Laborstudien zeigen nahezu vollständige
 * Umwandlung bei kontrollierten Bedingungen (Wang et al. 2016), im Haushaltsofen
 * schwanken Temperatur und Zeit jedoch erheblich. → ANNAHME, einstellbar.
 */
export const DEFAULT_DECARB_EFFICIENCY = 0.85;
/** Symmetrische Spannweite (± Anteil) für die Unsicherheitsberechnung. */
export const DECARB_EFFICIENCY_SPREAD = 0.1;

/**
 * Voreinstellung Extraktionsausbeute in das Fett. Für Heimverfahren existieren
 * keine belastbaren, standardisierten Literaturwerte. → ANNAHME, einstellbar.
 */
export const DEFAULT_EXTRACTION_EFFICIENCY = 0.7;
export const EXTRACTION_EFFICIENCY_SPREAD = 0.15;

/**
 * Relative Unsicherheit der THC-Laborangabe auf der Verpackung.
 * Schwabe et al. (2023) fanden bei der Mehrzahl der Proben Werte deutlich
 * (> 15 % relativ) unter der Deklaration. Voreinstellung ± 20 % relativ.
 */
export const DEFAULT_LABEL_UNCERTAINTY = 0.2;

/**
 * Systemische Bioverfügbarkeit beim Rauchen (Anteil des im Joint enthaltenen THC,
 * der den Blutkreislauf erreicht).
 * - Grotenhermen (2003): typischerweise 10–35 %
 * - Huestis (2007): beobachtete Extreme 2–56 %
 * - Lindgren et al. (1981): gelegentlich Konsumierende 10 ± 7 %,
 *   regelmäßig Konsumierende 23 ± 16 % (Mittelwert ± SD)
 */
export const SMOKING_BIOAVAILABILITY = {
  typical: { low: 0.1, high: 0.35 },
  extreme: { low: 0.02, high: 0.56 },
  occasional: { low: 0.03, high: 0.17 },
  regular: { low: 0.07, high: 0.39 },
} as const;

/**
 * Orale Bioverfügbarkeit von THC: ca. 4–12 % (Grotenhermen 2003), u. a. wegen
 * First-Pass-Metabolismus in der Leber. Gleichzeitig entsteht vermehrt
 * 11-OH-THC – deshalb sind Edible-mg und Joint-mg NICHT vergleichbar.
 */
export const ORAL_BIOAVAILABILITY = { low: 0.04, high: 0.12 } as const;

/**
 * "Standard THC Unit" nach Freeman & Lorenzetti (2020): 5 mg THC.
 */
export const STANDARD_THC_UNIT_MG = 5;

/**
 * Health Canada: Höchstmenge THC pro Packung essbaren Cannabis (Cannabis Regulations).
 */
export const HEALTH_CANADA_EDIBLE_PACKAGE_LIMIT_MG = 10;

/**
 * Health Canada Empfehlung für Einsteiger: mit einem Produkt mit
 * 2,5 mg THC oder weniger beginnen ("start low and go slow").
 */
export const HEALTH_CANADA_START_DOSE_MG = 2.5;
