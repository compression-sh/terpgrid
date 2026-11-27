/**
 * Auswertungen ausschließlich aus eigenen Datensätzen. Keine Schätzungen,
 * keine Beispieldaten – fehlende Werte bleiben fehlend.
 */
import { addDays, daysBetween, startOfWeek } from './dates';
import type { Expense, GrowProject, JournalEntry, Photo, Plant, Strain } from './db/types';
import { EXPENSE_CATEGORIES, type ExpenseCategory } from './db/types';
import { type PhaseSpan, phaseSpans } from './grow/phases';
import { t } from '../i18n';

export interface GrowDurationRow {
  id: string;
  name: string;
  days: number;
  /** true = abgeschlossen (Dauer fix), false = laufend bis heute */
  completed: boolean;
  spans: PhaseSpan[];
}

export function growDurations(grows: GrowProject[], ref: string): GrowDurationRow[] {
  return grows
    .filter((g) => daysBetween(g.startDate, g.completedDate ?? ref) >= 0)
    .map((g) => ({
      id: g.id,
      name: g.name,
      days: daysBetween(g.startDate, g.completedDate ?? ref),
      completed: !!g.completedDate,
      spans: phaseSpans(g.phaseDates, ref, g.completedDate),
    }))
    .sort((a, b) => b.days - a.days);
}

export function expensesByCategory(expenses: Expense[]): { category: ExpenseCategory; total: number; count: number }[] {
  return EXPENSE_CATEGORIES.map((c) => {
    const list = expenses.filter((e) => e.category === c);
    return { category: c, total: round2(list.reduce((s, e) => s + e.amount, 0)), count: list.length };
  }).filter((x) => x.count > 0);
}

export function expensesByGrow(expenses: Expense[], grows: GrowProject[]): { id: string; name: string; total: number }[] {
  const name = new Map(grows.map((g) => [g.id, g.name]));
  const map = new Map<string, number>();
  for (const e of expenses) {
    const k = e.growId ?? '';
    map.set(k, (map.get(k) ?? 0) + e.amount);
  }
  return [...map.entries()]
    .map(([id, total]) => ({ id, name: id ? (name.get(id) ?? t('mine.ins.deletedGrow')) : 'Ohne Grow', total: round2(total) }))
    .sort((a, b) => b.total - a.total);
}

export interface HarvestRow {
  plantId: string;
  growId: string;
  name: string;
  strain?: string;
  dryWeightG?: number;
  wetWeightG?: number;
  harvestDate?: string;
}

/** Nur Pflanzen mit erfasstem Ergebnis. */
export function harvestOutcomes(plants: Plant[], strains: Strain[]): HarvestRow[] {
  const sname = new Map(strains.map((s) => [s.id, s.name]));
  return plants
    .filter((p) => p.outcome && (p.outcome.dryWeightG !== undefined || p.outcome.wetWeightG !== undefined))
    .map((p) => ({
      plantId: p.id,
      growId: p.growId,
      name: p.name,
      strain: p.strainId ? sname.get(p.strainId) : p.strainName,
      dryWeightG: p.outcome!.dryWeightG,
      wetWeightG: p.outcome!.wetWeightG,
      harvestDate: p.outcome!.harvestDate,
    }))
    .sort((a, b) => (b.dryWeightG ?? -1) - (a.dryWeightG ?? -1));
}

export interface StrainRatingRow {
  id: string;
  name: string;
  rating?: number;
  journalAvg?: number;
  journalCount: number;
}

export function strainRatings(strains: Strain[], journal: JournalEntry[]): StrainRatingRow[] {
  return strains
    .map((s) => {
      const rated = journal.filter((j) => j.strainId === s.id && j.rating !== undefined);
      return {
        id: s.id,
        name: s.name,
        rating: s.rating,
        journalAvg: rated.length ? round2(rated.reduce((a, j) => a + j.rating!, 0) / rated.length) : undefined,
        journalCount: rated.length,
      };
    })
    .filter((r) => r.rating !== undefined || r.journalCount > 0)
    .sort((a, b) => (b.rating ?? b.journalAvg ?? 0) - (a.rating ?? a.journalAvg ?? 0));
}

/** Foto-Aktivität je Tag für eine Heatmap über `weeks` Wochen bis `ref` (Mo–So). */
export function photoActivity(photos: Photo[], ref: string, weeks = 26): { days: { date: string; count: number }[]; max: number } {
  const end = addDays(startOfWeek(ref), 6);
  const start = addDays(startOfWeek(ref), -(weeks - 1) * 7);
  const counts = new Map<string, number>();
  for (const p of photos) {
    const d = p.takenAt.slice(0, 10);
    if (d >= start && d <= end) counts.set(d, (counts.get(d) ?? 0) + 1);
  }
  const days: { date: string; count: number }[] = [];
  for (let d = start; d <= end; d = addDays(d, 1)) days.push({ date: d, count: counts.get(d) ?? 0 });
  return { days, max: Math.max(0, ...days.map((d) => d.count)) };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/* ───────────── Zusatzrechner ───────────── */

/**
 * Stromkosten: kWh = Watt × Stunden/Tag × Tage ÷ 1000; Kosten = kWh × Preis.
 */
export function electricityCost(watts: number, hoursPerDay: number, days: number, pricePerKwh: number): { kwh: number; cost: number } {
  const kwh = (Math.max(0, watts) * Math.max(0, Math.min(24, hoursPerDay)) * Math.max(0, days)) / 1000;
  return { kwh, cost: kwh * Math.max(0, pricePerKwh) };
}

export interface ExpenseLine {
  label: string;
  amount: number;
  quantity: number;
}

/** Summe einfacher Kostenpositionen; optional Kosten je Gramm Ertrag. */
export function expenseTotal(lines: ExpenseLine[], yieldG?: number): { total: number; perGram?: number } {
  const total = lines.reduce((s, l) => s + Math.max(0, l.amount) * Math.max(0, l.quantity), 0);
  return { total, perGram: yieldG && yieldG > 0 ? total / yieldG : undefined };
}

export const celsiusToFahrenheit = (c: number) => (c * 9) / 5 + 32;
export const fahrenheitToCelsius = (f: number) => ((f - 32) * 5) / 9;
export const GRAMS_PER_OUNCE = 28.349523125;
export const LITERS_PER_GALLON = 3.785411784;
export const CM_PER_INCH = 2.54;
