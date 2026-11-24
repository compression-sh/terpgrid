/**
 * Personal Data Explorer: Filter und Exporte über die eigenen Datensätze.
 * Rein beschreibend – keine Vorhersagen, keine Ursache-Wirkungs-Aussagen, keine ergänzten Werte.
 */
import type { Activity, Expense, GrowProject, JournalEntry, LabReport, Photo, Plant, Strain } from './db/types';
import { toPercent } from './lab';
import { METRICS } from './grow/series';
import { matchTerpene } from './catalog/terpenes';

export type ExplorerRange = 'all' | '30' | '90' | '365';
export const RANGE_LABEL: Record<ExplorerRange, string> = { all: 'Gesamter Zeitraum', '30': 'Letzte 30 Tage', '90': 'Letzte 90 Tage', '365': 'Letzte 12 Monate' };

export interface ExplorerScope {
  range: ExplorerRange;
  /** leer = alle Grows */
  growId: string;
}

/** Erstes einbezogenes Datum (YYYY-MM-DD) oder undefined für „alles“. */
export function rangeStart(range: ExplorerRange, ref: string): string | undefined {
  if (range === 'all') return undefined;
  const d = new Date(`${ref}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - Number(range) + 1);
  return d.toISOString().slice(0, 10);
}

const inRange = (date: string | undefined, from: string | undefined) => !from || (!!date && date.slice(0, 10) >= from);

export interface ScopedData {
  from?: string;
  activities: Activity[];
  expenses: Expense[];
  journal: JournalEntry[];
  photos: Photo[];
  plants: Plant[];
  grows: GrowProject[];
  labReports: LabReport[];
}

/**
 * Wendet Zeitraum und Grow-Filter an. Journal und Laborberichte gehören keinem Grow – sie werden bei einem
 * Grow-Filter nur dann einbezogen, wenn sie über eine Sorte mit einer Pflanze dieses Grows verknüpft sind.
 */
export function scopeData(
  data: { activities: Activity[]; expenses: Expense[]; journal: JournalEntry[]; photos: Photo[]; plants: Plant[]; grows: GrowProject[]; labReports: LabReport[] },
  scope: ExplorerScope,
  ref: string,
): ScopedData {
  const from = rangeStart(scope.range, ref);
  const g = scope.growId;
  const plants = data.plants.filter((p) => !g || p.growId === g);
  const growStrains = new Set(plants.map((p) => p.strainId).filter((x): x is string => !!x));
  return {
    from,
    grows: data.grows.filter((x) => !g || x.id === g),
    plants,
    activities: data.activities.filter((a) => (!g || a.growId === g) && inRange(a.date, from)),
    expenses: data.expenses.filter((e) => (!g || e.growId === g) && inRange(e.date, from)),
    photos: data.photos.filter((p) => (!g || p.growId === g) && inRange(p.takenAt, from)),
    journal: data.journal.filter((j) => (!g || (!!j.strainId && growStrains.has(j.strainId))) && inRange(j.date, from)),
    labReports: data.labReports.filter((r) => (!g || (!!r.strainId && growStrains.has(r.strainId))) && inRange(r.testDate, from)),
  };
}

/* ───────────── Laborberichte im Vergleich ───────────── */

export interface LabComparisonRow {
  id: string;
  title: string;
  strain?: string;
  labName?: string;
  testDate?: string;
  unit: LabReport['unit'];
  /** Werte in % (umgerechnet aus mg/g, falls nötig) – nur berichtete Werte */
  thc?: number;
  thca?: number;
  cbd?: number;
  terpenes: Record<string, number>;
  terpeneTotal?: number;
}

/**
 * Stellt eigene Laborberichte nebeneinander. Jede Zeile ist eine Probe; Werte werden nur in Prozent umgerechnet
 * (mg/g ÷ 10), nicht ergänzt oder gemittelt. Terpene werden über den Atlas zusammengeführt (Schreibweisen).
 */
export function labComparison(reports: LabReport[], strains: Strain[]): { rows: LabComparisonRow[]; terpenes: { id: string; label: string; count: number }[] } {
  const counts = new Map<string, { label: string; count: number }>();
  const rows = [...reports]
    .sort((a, b) => (b.testDate ?? '').localeCompare(a.testDate ?? ''))
    .map((r) => {
      const terpenes: Record<string, number> = {};
      for (const t of r.terpenes) {
        const info = matchTerpene(t.name);
        const key = info?.id ?? `x:${t.name.toLowerCase()}`;
        const pct = toPercent(t.value, r.unit);
        if (pct === undefined) continue;
        terpenes[key] = (terpenes[key] ?? 0) + pct;
        const c = counts.get(key) ?? { label: info?.name ?? t.name, count: 0 };
        c.count++;
        counts.set(key, c);
      }
      const vals = Object.values(terpenes);
      return {
        id: r.id,
        title: r.title,
        strain: r.strainId ? strains.find((s) => s.id === r.strainId)?.name : undefined,
        labName: r.labName,
        testDate: r.testDate,
        unit: r.unit,
        thc: toPercent(r.thc, r.unit),
        thca: toPercent(r.thca, r.unit),
        cbd: toPercent(r.cbd, r.unit),
        terpenes,
        terpeneTotal: vals.length ? vals.reduce((s, v) => s + v, 0) : undefined,
      };
    });
  const terpenes = [...counts.entries()].map(([id, v]) => ({ id, ...v })).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label, 'de'));
  return { rows, terpenes };
}

/* ───────────── Tabellen-Exporte (CSV, Semikolon) ───────────── */

const cell = (v: unknown) => {
  if (v === undefined || v === null) return '';
  const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
  return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const toTableCsv = (header: string[], rows: unknown[][]) => '﻿' + [header, ...rows].map((r) => r.map(cell).join(';')).join('\r\n');

/** Eine Zeile je Messeintrag; leere Zellen = nicht gemessen. */
export function measurementCsv(activities: Activity[], grows: GrowProject[], plants: Plant[]): string {
  const rows = activities
    .filter((a) => a.measurements && METRICS.some((m) => a.measurements![m.key] !== undefined))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((a) => [
      a.date.replace('T', ' ').slice(0, 16),
      grows.find((g) => g.id === a.growId)?.name ?? '',
      a.plantId ? (plants.find((p) => p.id === a.plantId)?.name ?? '') : 'ganzer Grow',
      ...METRICS.map((m) => a.measurements![m.key]),
      a.measurements!.phContext ?? '',
      a.measurements!.ecContext ?? '',
    ]);
  return toTableCsv(['Datum', 'Grow', 'Pflanze', ...METRICS.map((m) => (m.unit ? `${m.label} (${m.unit})` : m.label)), 'pH-Kontext', 'EC-Kontext'], rows);
}

export function expenseCsv(expenses: Expense[], grows: GrowProject[], categoryLabel: Record<string, string>): string {
  return toTableCsv(
    ['Datum', 'Kategorie', 'Beschreibung', 'Betrag', 'Grow'],
    [...expenses].sort((a, b) => a.date.localeCompare(b.date)).map((e) => [e.date, categoryLabel[e.category] ?? e.category, e.description, e.amount, grows.find((g) => g.id === e.growId)?.name ?? '']),
  );
}

export function journalCsv(entries: JournalEntry[], strains: Strain[]): string {
  return toTableCsv(
    ['Datum', 'Sorte', 'Konsumform', 'Menge', 'Einheit', 'THC % (eigene Angabe)', 'Bewertung', 'Stimmungen', 'Notiz'],
    [...entries]
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((j) => [j.date.replace('T', ' ').slice(0, 16), j.strainId ? (strains.find((s) => s.id === j.strainId)?.name ?? '') : (j.strainName ?? ''), j.method, j.amount?.value, j.amount?.unit ?? '', j.thcPercent, j.rating, j.moods.join(', '), j.notes]),
  );
}

export function labCsv(cmp: ReturnType<typeof labComparison>): string {
  const terps = cmp.terpenes;
  return toTableCsv(
    ['Probe', 'Sorte', 'Labor', 'Datum', 'Originaleinheit', 'THC %', 'THCA %', 'CBD %', ...terps.map((t) => `${t.label} %`), 'Terpene gesamt %'],
    cmp.rows.map((r) => [r.title, r.strain ?? '', r.labName ?? '', r.testDate ?? '', r.unit, r.thc, r.thca, r.cbd, ...terps.map((t) => r.terpenes[t.id]), r.terpeneTotal]),
  );
}
