/**
 * Lokale Suche über eigene Datensätze für die Befehlspalette.
 * Läuft ausschließlich im Browser auf bereits geladenen Daten – nichts wird gesendet.
 */
import type { GrowProject, InventoryItem, JournalEntry, LabReport, Plant, Reminder, Strain } from './db/types';
import { t } from '../i18n';

export interface SearchData {
  grows: GrowProject[];
  plants: Plant[];
  strains: Strain[];
  journal: JournalEntry[];
  inventory: InventoryItem[];
  labReports: LabReport[];
  reminders: Reminder[];
}
export interface SearchHit {
  kind: 'grow' | 'plant' | 'strain' | 'journal' | 'inventory' | 'labReport' | 'reminder';
  id: string;
  title: string;
  subtitle: string;
  to: string;
  score: number;
}

export const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/ß/g, 'ss')
    .trim();

/** Alle Suchwörter müssen vorkommen; Treffer am Wortanfang/im Titel zählen mehr. */
function score(q: string[], title: string, extra: string): number {
  const t = normalize(title);
  const e = normalize(extra);
  let s = 0;
  for (const w of q) {
    if (t.startsWith(w)) s += 6;
    else if (new RegExp(`(^|[\\s\\-_/(])${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(t)) s += 4;
    else if (t.includes(w)) s += 3;
    else if (e.includes(w)) s += 1;
    else return 0;
  }
  return s;
}

export function searchRecords(d: SearchData, query: string, limit = 20): SearchHit[] {
  const q = normalize(query).split(/\s+/).filter(Boolean);
  if (!q.length) return [];
  const strain = new Map(d.strains.map((s) => [s.id, s.name]));
  const grow = new Map(d.grows.map((g) => [g.id, g.name]));
  const hits: SearchHit[] = [];
  const add = (h: Omit<SearchHit, 'score'>, extra: string) => {
    const sc = score(q, h.title, `${h.subtitle} ${extra}`);
    if (sc > 0) hits.push({ ...h, score: sc });
  };
  for (const g of d.grows) add({ kind: 'grow', id: g.id, title: g.name, subtitle: t('shell.sr.grow'), to: `grows/${g.id}` }, g.notes ?? '');
  for (const p of d.plants)
    add({ kind: 'plant', id: p.id, title: p.name, subtitle: `${t('shell.sr.plant')} · ${grow.get(p.growId) ?? t('shell.sr.grow')}${p.strainId && strain.get(p.strainId) ? ` · ${strain.get(p.strainId)}` : ''}`, to: `grows/${p.growId}/plants/${p.id}` }, p.notes ?? '');
  for (const s of d.strains) add({ kind: 'strain', id: s.id, title: s.name, subtitle: t('shell.sr.strain'), to: `strains/${s.id}` }, '');
  for (const j of d.journal) {
    const name = (j.strainId && strain.get(j.strainId)) || t('shell.sr.journalEntry');
    add({ kind: 'journal', id: j.id, title: name, subtitle: `Journal · ${j.date.slice(0, 10)}`, to: `journal?entry=${encodeURIComponent(j.id)}` }, j.notes ?? '');
  }
  for (const i of d.inventory) add({ kind: 'inventory', id: i.id, title: i.name, subtitle: t('shell.sr.collection'), to: `collection?item=${encodeURIComponent(i.id)}` }, i.notes ?? '');
  for (const l of d.labReports) add({ kind: 'labReport', id: l.id, title: l.title, subtitle: `${t('shell.sr.lab')}${l.labName ? ` · ${l.labName}` : ''}`, to: `lab-reports?report=${encodeURIComponent(l.id)}` }, l.notes ?? '');
  for (const r of d.reminders) add({ kind: 'reminder', id: r.id, title: r.title, subtitle: `${t('shell.sr.reminder')} · ${r.date}`, to: 'calendar?view=list' }, r.notes ?? '');
  return hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'de')).slice(0, limit);
}
