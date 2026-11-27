/**
 * Sprach-Registry (6.1). Eine neue Sprache braucht: Wörterbuch unter `locales/<code>/`, Inhalte unter
 * `content/<code>/` (optional, sonst Rückfall auf Deutsch mit Hinweis), einen Eintrag hier und `status: 'available'`
 * erst nach Abnahme. Details: docs/TRANSLATION-GUIDE.md
 */
export type LocaleCode = 'de' | 'en';

export interface LocaleInfo {
  code: string;
  /** Name in der eigenen Sprache (Sprachwahl) */
  nativeName: string;
  /** Englischer Name (Doku, Logs) */
  englishName: string;
  dir: 'ltr' | 'rtl';
  /** BCP-47-Tag für Intl (Datum, Zahlen) */
  intl: string;
  /** Nur „available“ erscheint in der Sprachwahl */
  status: 'available' | 'planned';
}

export const LOCALES: LocaleInfo[] = [
  { code: 'de', nativeName: 'Deutsch', englishName: 'German', dir: 'ltr', intl: 'de-DE', status: 'available' },
  { code: 'en', nativeName: 'English', englishName: 'English', dir: 'ltr', intl: 'en-GB', status: 'available' },
  // Vorbereitet, nicht übersetzt – erscheinen nicht in der Sprachwahl:
  { code: 'fr', nativeName: 'Français', englishName: 'French', dir: 'ltr', intl: 'fr-FR', status: 'planned' },
  { code: 'it', nativeName: 'Italiano', englishName: 'Italian', dir: 'ltr', intl: 'it-IT', status: 'planned' },
  { code: 'es', nativeName: 'Español', englishName: 'Spanish', dir: 'ltr', intl: 'es-ES', status: 'planned' },
  { code: 'pt', nativeName: 'Português', englishName: 'Portuguese', dir: 'ltr', intl: 'pt-PT', status: 'planned' },
  { code: 'nl', nativeName: 'Nederlands', englishName: 'Dutch', dir: 'ltr', intl: 'nl-NL', status: 'planned' },
  { code: 'pl', nativeName: 'Polski', englishName: 'Polish', dir: 'ltr', intl: 'pl-PL', status: 'planned' },
  { code: 'ja', nativeName: '日本語', englishName: 'Japanese', dir: 'ltr', intl: 'ja-JP', status: 'planned' },
  { code: 'ko', nativeName: '한국어', englishName: 'Korean', dir: 'ltr', intl: 'ko-KR', status: 'planned' },
  { code: 'ar', nativeName: 'العربية', englishName: 'Arabic', dir: 'rtl', intl: 'ar', status: 'planned' },
];

export const AVAILABLE_LOCALES = LOCALES.filter((l) => l.status === 'available') as (LocaleInfo & { code: LocaleCode })[];
export const DEFAULT_LOCALE: LocaleCode = 'de';

export function isLocale(x: unknown): x is LocaleCode {
  return typeof x === 'string' && AVAILABLE_LOCALES.some((l) => l.code === x);
}

export function localeInfo(code: LocaleCode): LocaleInfo {
  return LOCALES.find((l) => l.code === code)!;
}

/** Erste unterstützte Sprache aus den Browser-Einstellungen, sonst Deutsch. */
export function detectLocale(languages: readonly string[] | undefined): LocaleCode {
  for (const l of languages ?? []) {
    const base = l.toLowerCase().split('-')[0];
    if (isLocale(base)) return base;
  }
  return DEFAULT_LOCALE;
}
