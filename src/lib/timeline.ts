/**
 * Persönliche Aktivitäts-Zeitachse: wird zur Laufzeit aus den vorhandenen Datensätzen
 * des angemeldeten Kontos abgeleitet – keine Kopien, kein eigener Speicher, kein Feed
 * anderer Personen.
 */
import type { Activity, GrowPhase, GrowProject, InventoryItem, JournalEntry, LabReport, Photo, Plant, Reminder, Strain } from './db/types';
import { INVENTORY_CATEGORY_LABEL } from './grow/labels';
import { ACTIVITY_LABEL } from './grow/labels';
import { PHASE_LABEL } from './grow/phases';

export type TimelineKind = 'milestone' | 'activity' | 'measurement' | 'photo' | 'journal' | 'strain' | 'collection' | 'lab' | 'reminder';

export interface TimelineEvent {
  id: string;
  kind: TimelineKind;
  /** ISO-Datum oder lokale Datum-Zeit (YYYY-MM-DD[THH:mm]) */
  at: string;
  title: string;
  subtitle?: string;
  to: string;
  growId?: string;
  photoId?: string;
}

export interface TimelineData {
  grows: GrowProject[];
  plants: Plant[];
  activities: Activity[];
  photos: Photo[];
  journal: JournalEntry[];
  strains: Strain[];
  labReports: LabReport[];
  reminders: Reminder[];
  /** Sammlung (optional, ab 6.0.1 in der Zeitachse) */
  inventory?: InventoryItem[];
}

const day = (s: string) => s.slice(0, 10);

export function buildTimeline(d: TimelineData, opts: { today?: string } = {}): TimelineEvent[] {
  const grow = new Map(d.grows.map((g) => [g.id, g]));
  const plant = new Map(d.plants.map((p) => [p.id, p]));
  const strain = new Map(d.strains.map((s) => [s.id, s]));
  const out: TimelineEvent[] = [];
  const growName = (id?: string) => (id ? grow.get(id)?.name : undefined);

  for (const g of d.grows) {
    out.push({ id: `g-start-${g.id}`, kind: 'milestone', at: g.startDate, title: `Grow gestartet: ${g.name}`, to: `grows/${g.id}`, growId: g.id });
    for (const [phase, date] of Object.entries(g.phaseDates ?? {}) as [GrowPhase, string][]) {
      if (date) out.push({ id: `g-${phase}-${g.id}`, kind: 'milestone', at: date, title: `${PHASE_LABEL[phase]} · ${g.name}`, subtitle: 'Meilenstein', to: `grows/${g.id}`, growId: g.id });
    }
  }
  for (const p of d.plants) {
    for (const [phase, date] of Object.entries(p.phaseDates ?? {}) as [GrowPhase, string][]) {
      if (date) out.push({ id: `p-${phase}-${p.id}`, kind: 'milestone', at: date, title: `${PHASE_LABEL[phase]} · ${p.name}`, subtitle: growName(p.growId), to: `grows/${p.growId}/plants/${p.id}`, growId: p.growId });
    }
  }
  for (const a of d.activities) {
    const isMeasure = a.type === 'measurement' || (a.measurements && Object.keys(a.measurements).length > 0);
    const where = a.plantId ? plant.get(a.plantId)?.name : growName(a.growId);
    out.push({
      id: `a-${a.id}`,
      kind: isMeasure ? 'measurement' : 'activity',
      at: a.date,
      title: a.title || ACTIVITY_LABEL[a.type] || 'Eintrag',
      subtitle: [ACTIVITY_LABEL[a.type], where].filter(Boolean).join(' · '),
      to: a.plantId ? `grows/${a.growId}/plants/${a.plantId}` : `grows/${a.growId}`,
      growId: a.growId,
    });
  }
  for (const ph of d.photos) {
    const where = ph.plantId ? plant.get(ph.plantId)?.name : growName(ph.growId);
    out.push({ id: `ph-${ph.id}`, kind: 'photo', at: ph.takenAt, title: ph.note || 'Foto', subtitle: where, to: ph.growId ? `grows/${ph.growId}?tab=photos` : 'photos', growId: ph.growId, photoId: ph.id });
  }
  for (const j of d.journal) {
    const name = (j.strainId && strain.get(j.strainId)?.name) || j.strainName;
    out.push({ id: `j-${j.id}`, kind: 'journal', at: j.date, title: name ? `Journal: ${name}` : 'Journal-Eintrag', subtitle: j.notes ? j.notes.slice(0, 80) : undefined, to: 'journal' });
  }
  for (const s of d.strains) {
    out.push({ id: `s-${s.id}`, kind: 'strain', at: s.createdAt, title: s.external ? `Sorte gespeichert: ${s.name}` : `Sorte angelegt: ${s.name}`, subtitle: s.external ? 'aus Discover' : undefined, to: `strains/${s.id}` });
  }
  for (const l of d.labReports) {
    out.push({ id: `l-${l.id}`, kind: 'lab', at: l.testDate ?? l.createdAt, title: `Laborbericht: ${l.title}`, subtitle: l.labName, to: 'lab-reports' });
  }
  for (const i of d.inventory ?? []) {
    out.push({ id: `i-${i.id}`, kind: 'collection', at: i.purchaseDate ?? i.createdAt, title: `Sammlung: ${i.name}`, subtitle: INVENTORY_CATEGORY_LABEL[i.category], to: `collection?item=${encodeURIComponent(i.id)}` });
  }
  // Kalender: einmalige Erinnerungen und erledigte Termine (Wiederholungen werden nicht vervielfältigt)
  const today = opts.today;
  for (const r of d.reminders) {
    for (const done of r.completedDates ?? []) out.push({ id: `r-${r.id}-${done}`, kind: 'reminder', at: done, title: `Erledigt: ${r.title}`, subtitle: growName(r.growId), to: 'calendar', growId: r.growId });
    if ((r.repeat?.kind ?? 'none') === 'none' && !(r.completedDates ?? []).includes(r.date) && (!today || r.date <= today))
      out.push({ id: `r-${r.id}`, kind: 'reminder', at: r.date, title: r.title, subtitle: growName(r.growId), to: 'calendar', growId: r.growId });
  }
  return out.filter((e) => /^\d{4}-\d{2}-\d{2}/.test(e.at)).sort((a, b) => b.at.localeCompare(a.at) || a.id.localeCompare(b.id));
}

/** Gruppiert nach Kalendertag (neueste zuerst). */
export function groupByDay(events: TimelineEvent[]): { day: string; events: TimelineEvent[] }[] {
  const out: { day: string; events: TimelineEvent[] }[] = [];
  for (const e of events) {
    const d = day(e.at);
    const last = out[out.length - 1];
    if (last && last.day === d) last.events.push(e);
    else out.push({ day: d, events: [e] });
  }
  return out;
}
