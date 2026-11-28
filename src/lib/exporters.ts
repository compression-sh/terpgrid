
import { t } from '../i18n';
import { intlLocale } from '../i18n';/**
 * Export von Ergebnissen als JSON, CSV oder Text – erzeugt lokal eine Datei
 * (Blob-Download). Keine Netzwerkanfrage.
 */

export type ExportRow = { label: string; value: string };

export interface ExportPayload {
  title: string;
  generatedAt: string;
  inputs: ExportRow[];
  results: ExportRow[];
  notes?: string[];
}

function csvCell(raw: string): string {
  // Schutz vor Formel-Injektion in Tabellenprogrammen (OWASP „CSV Injection“): Zellen, die mit =, +, -, @,
  // Tab oder CR beginnen, werden als Text markiert – reine Zahlen (z. B. -1,5) bleiben unverändert.
  const value = /^[=+\-@\t\r]/.test(raw) && !/^[+-]?\d+([.,]\d+)?$/.test(raw) ? `'${raw}` : raw;
  const needsQuote = /[;"\n\r]/.test(value);
  const escaped = value.replace(/"/g, '""');
  return needsQuote ? `"${escaped}"` : escaped;
}

/** Tabelle als CSV (Semikolon, CRLF) – z. B. gefilterte Journal-Einträge. */
export function toCSVTable(headers: string[], rows: (string | number | undefined | null)[][]): string {
  return [headers, ...rows].map((r) => r.map((v) => csvCell(v === undefined || v === null ? '' : String(v))).join(';')).join('\r\n');
}

/** CSV mit Semikolon (Excel-freundlich für deutsche Gebietsschemata). */
export function toCSV(payload: ExportPayload): string {
  const lines: string[] = [t('common.exp.head')];
  for (const r of payload.inputs) lines.push([t('common.exp.input'), r.label, r.value].map(csvCell).join(';'));
  for (const r of payload.results) lines.push([t('common.exp.result'), r.label, r.value].map(csvCell).join(';'));
  for (const n of payload.notes ?? []) lines.push([t('common.exp.note'), '', n].map(csvCell).join(';'));
  return lines.join('\r\n');
}

export function toJSON(payload: ExportPayload): string {
  return JSON.stringify(payload, null, 2);
}

export function toText(payload: ExportPayload): string {
  const pad = Math.max(...[...payload.inputs, ...payload.results].map((r) => r.label.length), 10);
  const row = (r: ExportRow) => `  ${r.label.padEnd(pad)}  ${r.value}`;
  const parts = [
    payload.title,
    '='.repeat(payload.title.length),
    t('common.exp.created', { date: new Date(payload.generatedAt).toLocaleString(intlLocale()) }),
    '',
    t('common.exp.inputs'),
    ...payload.inputs.map(row),
    '',
    t('common.exp.results'),
    ...payload.results.map(row),
  ];
  if (payload.notes?.length) parts.push('', t('common.exp.notes'), ...payload.notes.map((n) => `  • ${n}`));
  parts.push(
    '',
    t('common.exp.disclaimer'),
    t('common.exp.local'),
  );
  return parts.join('\n');
}

export function slugify(s: string): string {
  return (
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'export'
  );
}

export function downloadFile(filename: string, content: string, mime: string): void {
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function exportPayload(payload: ExportPayload, format: 'json' | 'csv' | 'txt'): void {
  const base = `${slugify(payload.title)}-${payload.generatedAt.slice(0, 10)}`;
  if (format === 'json') downloadFile(`${base}.json`, toJSON(payload), 'application/json');
  else if (format === 'csv') downloadFile(`${base}.csv`, '﻿' + toCSV(payload), 'text/csv');
  else downloadFile(`${base}.txt`, toText(payload), 'text/plain');
}
