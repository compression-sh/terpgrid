import type { QuantityChange } from './db/types';

/** Mengenänderung protokollieren (höchstens 50 Einträge, älteste fallen weg). Ohne Änderung: unverändert. */
export function withQuantityChange(log: QuantityChange[] | undefined, from: number | undefined, to: number | undefined, at: string): QuantityChange[] | undefined {
  if (from === undefined || to === undefined || from === to) return log;
  return [...(log ?? []), { at, from, to }].slice(-50);
}
