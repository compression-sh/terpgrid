/**
 * Kleine i18n-Schicht ohne Abhängigkeiten (6.1).
 *
 * - Wörterbücher je Sprache und Bereich (`locales/<code>/*.ts`); Deutsch ist die Vorlage und zugleich Rückfall.
 *   Das englische Wörterbuch ist gegen die deutsche Struktur typisiert: fehlende Schlüssel brechen den Typecheck.
 * - `t('bereich.schluessel', { name })`: Platzhalter `{name}`; Pluralformen als Objekt `{ one, other }` mit `count`.
 * - Ergebnis ist immer reiner Text (React escaped ihn); Übersetzungen werden nie als HTML eingefügt.
 * - Formatierung über Intl mit dem Format-Tag der aktiven Sprache.
 */
import de from './locales/de';
import { DEFAULT_LOCALE, type LocaleCode, detectLocale, isLocale, localeInfo } from './registry';

export type Plural = { zero?: string; one: string; two?: string; few?: string; many?: string; other: string };
type Leaf = string | Plural;
type Tree = { [k: string]: Leaf | Tree };

/** Struktur des deutschen Wörterbuchs – andere Sprachen müssen sie vollständig abbilden. */
export type Messages = typeof de;
export type DeepMessages<T> = { [K in keyof T]: T[K] extends string ? string : T[K] extends Plural ? Plural : DeepMessages<T[K]> };

type Join<K, P> = K extends string ? (P extends string ? `${K}.${P}` : never) : never;
type Paths<T> = { [K in keyof T & string]: T[K] extends string | Plural ? K : Join<K, Paths<T[K]>> }[keyof T & string];
/** Alle gültigen Schlüssel, z. B. 'nav.overview' */
export type MessageKey = Paths<Messages>;
export type Params = Record<string, string | number>;

const loaders: Record<LocaleCode, () => Promise<Tree>> = {
  de: async () => de as unknown as Tree,
  en: async () => (await import('./locales/en')).default as unknown as Tree,
};

let current: LocaleCode = DEFAULT_LOCALE;
let dict: Tree = de as unknown as Tree;
const listeners = new Set<() => void>();
const DEVICE_KEY = 'terpgrid.locale';

export function getLocale(): LocaleCode {
  return current;
}
/** BCP-47-Tag für Intl der aktiven Sprache */
export function intlLocale(): string {
  return localeInfo(current).intl;
}

function lookup(tree: Tree, key: string): Leaf | undefined {
  let node: Leaf | Tree | undefined = tree;
  for (const part of key.split('.')) {
    if (!node || typeof node === 'string') return undefined;
    node = (node as Tree)[part];
  }
  return node === undefined || (typeof node === 'object' && !('other' in node)) ? undefined : (node as Leaf);
}

const pluralRules = new Map<string, Intl.PluralRules>();
function pluralForm(p: Plural, count: number): string {
  const tag = intlLocale();
  let r = pluralRules.get(tag);
  if (!r) pluralRules.set(tag, (r = new Intl.PluralRules(tag)));
  const cat = r.select(count) as keyof Plural;
  return p[cat] ?? p.other;
}

/** Übersetzt einen Schlüssel; fällt auf Deutsch zurück, nie auf den rohen Schlüssel in der Oberfläche. */
export function t(key: MessageKey, params?: Params): string {
  let leaf = lookup(dict, key) ?? lookup(de as unknown as Tree, key);
  if (leaf === undefined) {
    if (import.meta.env.DEV) console.warn(`[i18n] fehlender Schlüssel: ${key}`);
    return '…';
  }
  if (typeof leaf === 'object') leaf = pluralForm(leaf, Number(params?.count ?? 0));
  return params ? leaf.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? (typeof params[k] === 'number' ? formatNumber(params[k] as number) : String(params[k])) : m)) : leaf;
}

/** Für dynamische Schlüssel (z. B. aus Daten): prüft, ob es eine Übersetzung gibt. */
export function hasKey(key: string): boolean {
  return lookup(de as unknown as Tree, key) !== undefined;
}
/** Dynamischer Schlüssel mit Rückfall auf einen festen Text (z. B. Codes vom Server). */
export function tDynamic(key: string, fallback: string, params?: Params): string {
  return hasKey(key) ? t(key as MessageKey, params) : fallback;
}

const numberFormats = new Map<string, Intl.NumberFormat>();
export function formatNumber(n: number, opts: Intl.NumberFormatOptions = { maximumFractionDigits: 2 }): string {
  const k = intlLocale() + JSON.stringify(opts);
  let f = numberFormats.get(k);
  if (!f) numberFormats.set(k, (f = new Intl.NumberFormat(intlLocale(), opts)));
  return f.format(n);
}

/** Wechselt die Sprache (lädt das Wörterbuch bei Bedarf) und benachrichtigt die Oberfläche. */
export async function setLocale(code: LocaleCode, opts: { persist?: boolean } = {}): Promise<void> {
  if (!isLocale(code)) return;
  const next = await loaders[code]();
  current = code;
  dict = next;
  numberFormats.clear();
  if (typeof document !== 'undefined') {
    document.documentElement.lang = code;
    document.documentElement.dir = localeInfo(code).dir;
  }
  if (opts.persist) {
    try {
      localStorage.setItem(DEVICE_KEY, code);
    } catch {
      /* privater Modus: Wahl gilt bis zum Neuladen */
    }
  }
  for (const l of listeners) l();
}

/** Ausdrücklich auf diesem Gerät gewählte Sprache (oder null). */
export function devicePreference(): LocaleCode | null {
  try {
    const v = localStorage.getItem(DEVICE_KEY);
    return isLocale(v) ? v : null;
  } catch {
    return null;
  }
}

/** Startsprache: ausdrückliche Gerätewahl → Browsersprache → Deutsch. */
export async function initLocale(): Promise<void> {
  const nav = typeof navigator !== 'undefined' ? navigator.languages ?? [navigator.language] : [];
  await setLocale(devicePreference() ?? detectLocale(nav));
}

export function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/**
 * Beschriftungstabelle, die beim Zugriff übersetzt: `labels('journal.method', METHODS)[m]`.
 * Verhält sich wie ein Record (inkl. Object.keys/entries), damit bestehende Aufrufstellen unverändert bleiben.
 */
export function labels<K extends string>(prefix: string, keys: readonly K[]): Record<K, string> {
  const set = new Set<string>(keys);
  return new Proxy({} as Record<K, string>, {
    get: (_t, k) => (typeof k === 'string' && set.has(k) ? t(`${prefix}.${k}` as MessageKey) : undefined),
    has: (_t, k) => typeof k === 'string' && set.has(k),
    ownKeys: () => [...keys],
    getOwnPropertyDescriptor: (_t, k) => (typeof k === 'string' && set.has(k) ? { enumerable: true, configurable: true, value: t(`${prefix}.${k}` as MessageKey) } : undefined),
  });
}
