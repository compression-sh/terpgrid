import { useSyncExternalStore } from 'react';
import { getLocale, subscribe } from './core';

export { t, tDynamic, hasKey, labels, getLocale, intlLocale, setLocale, initLocale, devicePreference, formatNumber, type MessageKey, type Messages, type DeepMessages } from './core';
export { AVAILABLE_LOCALES, LOCALES, DEFAULT_LOCALE, isLocale, localeInfo, detectLocale, type LocaleCode } from './registry';

/**
 * Aktive Sprache als React-Zustand. Die App-Wurzel nutzt den Hook, damit nach einem Sprachwechsel der ganze Baum
 * neu rendert (Formulareingaben und Route bleiben erhalten, es wird nichts neu geladen).
 */
export function useLocale() {
  return useSyncExternalStore(subscribe, getLocale, getLocale);
}
