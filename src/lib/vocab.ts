/**
 * Kontrolliertes Vokabular, das als Wert in Datensätzen gespeichert wird (Einheiten, Stimmungen, Aromen).
 * Gespeichert bleibt immer der ursprüngliche (deutsche) Wert – übersetzt wird nur die Anzeige.
 * Frei eingegebene Werte werden unverändert angezeigt (eigene Inhalte werden nie übersetzt).
 */
import { hasKey, t, type MessageKey } from '../i18n';

const show = (ns: string, v: string) => (hasKey(`labels.${ns}.${v}`) ? t(`labels.${ns}.${v}` as MessageKey) : v);

/** Einheiten: „Stück“ → „pcs“ usw. */
export const unitLabel = (u: string) => show('unit', u);
/** Stimmungs-Deskriptoren aus dem Journal */
export const moodLabel = (m: string) => show('mood', m);
/** Aroma-Deskriptoren */
export const aromaLabel = (a: string) => show('aroma', a);
/** Probenart eines Laborberichts (Vorschläge; freie Eingaben bleiben unverändert) */
export const sampleLabel = (s: string) => show('sample', s);
