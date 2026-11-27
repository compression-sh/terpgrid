import { labels } from '../../i18n';
import { daysBetween, today as todayFn } from '../dates';
import { GROW_PHASES, type GrowPhase, type PhaseDates } from '../db/types';

export const PHASE_LABEL = labels('labels.phase', ['germination', 'seedling', 'vegetative', 'flowering', 'harvest', 'drying', 'curing', 'completed'] as GrowPhase[]);

export const PHASE_SHORT = labels('labels.phaseShort', ['germination', 'seedling', 'vegetative', 'flowering', 'harvest', 'drying', 'curing', 'completed'] as GrowPhase[]);

/** Dezente, unterscheidbare Farbtöne pro Phase (für Chips & Diagramme). */
export const PHASE_COLOR: Record<GrowPhase, string> = {
  germination: '#a3a38a',
  seedling: '#9ef0bd',
  vegetative: '#34c77b',
  flowering: '#c084fc',
  harvest: '#fbbf24',
  drying: '#f59e0b',
  curing: '#d6a36a',
  completed: '#8c9a95',
};

export interface PhaseSpan {
  phase: GrowPhase;
  start: string;
  /** Ende = Beginn der nächsten erfassten Phase bzw. Referenzdatum (laufend). */
  end: string;
  days: number;
  ongoing: boolean;
}

/** Erfasste Phasen chronologisch in der Reihenfolge des Lebenszyklus. */
export function recordedPhases(dates: PhaseDates): { phase: GrowPhase; date: string }[] {
  return GROW_PHASES.filter((p) => !!dates[p]).map((p) => ({ phase: p, date: dates[p]! }));
}

/**
 * Aktuelle Phase = letzte erfasste Phase, deren Datum ≤ Referenzdatum ist.
 * Liegt kein Meilenstein in der Vergangenheit, gibt es keine aktuelle Phase.
 */
export function currentPhase(dates: PhaseDates, ref: string = todayFn()): GrowPhase | undefined {
  let current: GrowPhase | undefined;
  for (const { phase, date } of recordedPhases(dates)) {
    if (daysBetween(date, ref) >= 0) current = phase;
  }
  return current;
}

/**
 * Phasendauern aus erfassten Daten. Es wird nichts geschätzt:
 * - Abgeschlossene Phasen: bis zum nächsten erfassten Meilenstein
 * - Letzte Phase: bis zum Referenzdatum (laufend) bzw. zum Abschlussdatum
 * - "Abgeschlossen" selbst hat keine Dauer
 */
export function phaseSpans(dates: PhaseDates, ref: string = todayFn(), endDate?: string): PhaseSpan[] {
  const rec = recordedPhases(dates).filter((r) => daysBetween(r.date, ref) >= 0);
  const spans: PhaseSpan[] = [];
  rec.forEach((r, i) => {
    if (r.phase === 'completed') return;
    const next = rec[i + 1];
    const end = next ? next.date : (endDate ?? ref);
    spans.push({ phase: r.phase, start: r.date, end, days: Math.max(0, daysBetween(r.date, end)), ongoing: !next && !endDate });
  });
  return spans;
}

/** Prüft, ob die Meilensteine chronologisch geordnet sind. */
export function phaseOrderIssues(dates: PhaseDates): string[] {
  const rec = recordedPhases(dates);
  const issues: string[] = [];
  for (let i = 1; i < rec.length; i++) {
    const prev = rec[i - 1]!;
    const cur = rec[i]!;
    if (daysBetween(prev.date, cur.date) < 0) {
      issues.push(`„${PHASE_LABEL[cur.phase]}“ liegt vor „${PHASE_LABEL[prev.phase]}“.`);
    }
  }
  return issues;
}

/** Laufende Tage seit Start (Tag 1 = Starttag). Bei abgeschlossenen Grows bis zum Abschluss. */
export function growDay(startDate: string, ref: string = todayFn(), completedDate?: string): number | undefined {
  const end = completedDate ?? ref;
  const diff = daysBetween(startDate, end);
  return diff < 0 ? undefined : diff + 1;
}

/** Gesamtdauer in Tagen (nur wenn ein Ende erfasst ist). */
export function totalDuration(startDate: string, completedDate?: string): number | undefined {
  if (!completedDate) return undefined;
  const d = daysBetween(startDate, completedDate);
  return d >= 0 ? d : undefined;
}

/** Phase zu einem Datum (z. B. für Foto-Filter). */
export function phaseAt(dates: PhaseDates, date: string): GrowPhase | undefined {
  return currentPhase(dates, date.slice(0, 10));
}
