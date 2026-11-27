/** Eingabevalidierung – rein funktional, UI-unabhängig. */

export interface FieldRule {
  min: number;
  max: number;
  /** Darf der Wert 0 sein? (sonst muss er > min sein, falls min = 0) */
  allowZero?: boolean;
  label: string;
  unit?: string;
}

export interface ValidationIssue {
  field: string;
  message: string;
}

export function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

export function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

/** Prüft einen einzelnen Wert gegen eine Regel und liefert ggf. eine Meldung. */
export function checkField(field: string, value: number, rule: FieldRule): ValidationIssue | null {
  const unit = rule.unit ? ` ${rule.unit}` : '';
  if (!isFiniteNumber(value)) {
    return { field, message: `${rule.label}: bitte eine gültige Zahl eingeben.` };
  }
  if (value < rule.min) {
    return { field, message: `${rule.label} muss mindestens ${rule.min}${unit} betragen.` };
  }
  if (value > rule.max) {
    return { field, message: `${rule.label} darf höchstens ${rule.max}${unit} betragen.` };
  }
  if (!rule.allowZero && value === 0 && rule.min === 0) {
    return { field, message: `${rule.label} muss größer als 0 sein.` };
  }
  return null;
}

/** Validiert ein Objekt anhand eines Regelwerks. */
export function validate<T extends object>(
  values: T,
  rules: Partial<Record<keyof T, FieldRule>>,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  for (const key of Object.keys(rules) as (keyof T)[]) {
    const rule = rules[key];
    if (!rule) continue;
    const issue = checkField(String(key), values[key] as unknown as number, rule);
    if (issue) issues.push(issue);
  }
  return issues;
}

/**
 * Parst Benutzereingaben robust, inklusive deutschem Dezimalkomma.
 * Gibt NaN zurück, wenn keine Zahl erkannt wird.
 */
/**
 * Liest Zahlen unabhängig von der Oberflächensprache gleich (6.1):
 * - genau ein Trennzeichen (Komma oder Punkt) = Dezimaltrennzeichen: „1,5“ = „1.5“ = 1,5
 * - beide vorhanden: das zuletzt stehende ist das Dezimaltrennzeichen, das andere Tausendertrennung:
 *   „1.234,5“ (de) = „1,234.5“ (en) = 1234,5
 * - mehrere gleiche Trennzeichen ohne das andere („1.234.567“) gelten als Tausendertrennung.
 */
export function parseLocaleNumber(input: string): number {
  const trimmed = input.trim().replace(/[\s\u00a0\u202f']/g, '');
  if (trimmed === '') return Number.NaN;
  let normalized = trimmed;
  const lastComma = normalized.lastIndexOf(',');
  const lastDot = normalized.lastIndexOf('.');
  if (lastComma >= 0 && lastDot >= 0) {
    const dec = lastComma > lastDot ? ',' : '.';
    const group = dec === ',' ? '.' : ',';
    normalized = normalized.split(group).join('').replace(dec, '.');
  } else {
    const sep = lastComma >= 0 ? ',' : lastDot >= 0 ? '.' : '';
    if (sep && normalized.split(sep).length > 2) normalized = normalized.split(sep).join('');
    else if (sep === ',') normalized = normalized.replace(',', '.');
  }
  if (!/^-?\d*\.?\d+$|^-?\d+\.$/.test(normalized)) return Number.NaN;
  return Number.parseFloat(normalized);
}
