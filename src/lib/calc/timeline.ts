import { intlLocale, t } from '../../i18n';

/**
 * Typische Wirkverläufe nach Health Canada ("Cannabis health effects" /
 * "Edible cannabis: Start low and go slow"):
 *
 * Inhalation: Wirkeintritt Sekunden bis Minuten, Maximum nach ca. 30 Minuten,
 *             Wirkung bis zu 6 Stunden, Restwirkungen bis zu 24 Stunden.
 * Ingestion:  Wirkeintritt 30 Minuten bis 2 Stunden, Maximum nach ca. 4 Stunden,
 *             Wirkung bis zu 12 Stunden, Restwirkungen bis zu 24 Stunden.
 *
 * Alle Phasen werden als Zeitbereiche (frühester/spätester Beginn bzw. Ende)
 * modelliert. Es handelt sich ausdrücklich nicht um eine individuelle Prognose.
 */

export type Route = 'smoking' | 'edibles';

export type PhaseId = 'onset' | 'peak' | 'comedown' | 'residual';

export interface Phase {
  id: PhaseId;
  label: string;
  /** Frühester / spätester Beginn in Minuten nach Konsum. */
  startMin: [number, number];
  /** Frühestes / spätestes Ende in Minuten nach Konsum. */
  endMin: [number, number];
  description: string;
}

export interface RouteTimeline {
  route: Route;
  title: string;
  /** Angezeigter Zeitraum (Minuten). */
  horizonMin: number;
  phases: Phase[];
  keyFacts: { label: string; value: string }[];
  warning: string;
}

export const TIMELINES: Record<Route, RouteTimeline> = {
  smoking: {
    route: 'smoking',
    get title() { return t('lab.tl.smoking'); },
    horizonMin: 24 * 60,
    phases: [
      {
        id: 'onset',
        get label() { return t('lab.tl.onset'); },
        startMin: [0, 1],
        endMin: [5, 10],
        get description() { return t('lab.tl.smOnsetText'); },
      },
      {
        id: 'peak',
        get label() { return t('lab.tl.peak'); },
        startMin: [10, 15],
        endMin: [60, 120],
        get description() { return t('lab.tl.smPeakText'); },
      },
      {
        id: 'comedown',
        get label() { return t('lab.tl.decline'); },
        startMin: [60, 120],
        endMin: [180, 360],
        get description() { return t('lab.tl.smDeclineText'); },
      },
      {
        id: 'residual',
        get label() { return t('lab.tl.after'); },
        startMin: [180, 360],
        endMin: [720, 1440],
        get description() { return t('lab.tl.smAfterText'); },
      },
    ],
    keyFacts: [
      { get label() { return t('lab.tl.onset'); }, get value() { return t('lab.tl.secMin'); } },
      { get label() { return t('lab.tl.maximum'); }, get value() { return t('lab.tl.approx30'); } },
      { get label() { return t('lab.tl.duration'); }, get value() { return t('lab.tl.upTo6'); } },
      { get label() { return t('lab.tl.residual'); }, get value() { return t('lab.tl.upTo24'); } },
    ],
    get warning() { return t('lab.tl.smWarning'); },
  },
  edibles: {
    route: 'edibles',
    get title() { return t('lab.tl.edibles'); },
    horizonMin: 24 * 60,
    phases: [
      {
        id: 'onset',
        get label() { return t('lab.tl.onset'); },
        startMin: [30, 120],
        endMin: [60, 180],
        get description() { return t('lab.tl.edOnsetText'); },
      },
      {
        id: 'peak',
        get label() { return t('lab.tl.peak'); },
        startMin: [90, 180],
        endMin: [300, 480],
        get description() { return t('lab.tl.edPeakText'); },
      },
      {
        id: 'comedown',
        get label() { return t('lab.tl.decline'); },
        startMin: [300, 480],
        endMin: [480, 720],
        get description() { return t('lab.tl.edDeclineText'); },
      },
      {
        id: 'residual',
        get label() { return t('lab.tl.after'); },
        startMin: [480, 720],
        endMin: [1080, 1440],
        get description() { return t('lab.tl.edAfterText'); },
      },
    ],
    keyFacts: [
      { get label() { return t('lab.tl.onset'); }, get value() { return t('lab.tl.30to2'); } },
      { get label() { return t('lab.tl.maximum'); }, get value() { return t('lab.tl.approx4'); } },
      { get label() { return t('lab.tl.duration'); }, get value() { return t('lab.tl.upTo12'); } },
      { get label() { return t('lab.tl.residual'); }, get value() { return t('lab.tl.upTo24'); } },
    ],
    get warning() { return t('lab.tl.edWarning'); },
  },
};

export type PhaseStatus = 'not-yet' | 'possible' | 'likely' | 'over';

/**
 * Status einer Phase zu einem Zeitpunkt t (Minuten):
 * - likely:   t liegt zwischen spätestem Beginn und frühestem Ende
 * - possible: t liegt im unscharfen Übergangsbereich
 * - not-yet / over
 */
export function phaseStatusAt(phase: Phase, t: number): PhaseStatus {
  const [s0, s1] = phase.startMin;
  const [e0, e1] = phase.endMin;
  if (t < s0) return 'not-yet';
  if (t > e1) return 'over';
  if (t >= s1 && t <= e0) return 'likely';
  return 'possible';
}

export function activePhasesAt(route: Route, t: number): { phase: Phase; status: PhaseStatus }[] {
  return TIMELINES[route].phases
    .map((phase) => ({ phase, status: phaseStatusAt(phase, t) }))
    .filter((p) => p.status === 'likely' || p.status === 'possible');
}

/**
 * Qualitative Intensitätskurve für die Visualisierung: liefert für einen
 * Zeitpunkt ein Band [unten, oben] auf einer RELATIVEN Skala (0–1).
 * Keine individuelle Prognose – nur die Form eines typischen Verlaufs.
 */
export function relativeIntensityBand(route: Route, t: number): [number, number] {
  const tl = TIMELINES[route];
  const [onset, peak, comedown, residual] = tl.phases as [Phase, Phase, Phase, Phase];
  // Früheste ("schneller Verlauf") und späteste ("langsamer Verlauf") Kurve.
  const fast = curve(t, onset.startMin[0], peak.startMin[0], peak.endMin[0], comedown.endMin[0], residual.endMin[0]);
  const slow = curve(t, onset.startMin[1], peak.startMin[1], peak.endMin[1], comedown.endMin[1], residual.endMin[1]);
  return [Math.min(fast, slow), Math.max(fast, slow)];
}

/** Stückweise glatte Kurve: Anstieg → Plateau → Abfall → Ausläufer. */
function curve(t: number, start: number, peakStart: number, peakEnd: number, comeEnd: number, resEnd: number): number {
  const smooth = (x: number) => x * x * (3 - 2 * x);
  if (t <= start) return 0;
  if (t <= peakStart) return smooth((t - start) / Math.max(1, peakStart - start));
  if (t <= peakEnd) return 1;
  if (t <= comeEnd) return 1 - 0.85 * smooth((t - peakEnd) / Math.max(1, comeEnd - peakEnd));
  if (t <= resEnd) return 0.15 * (1 - smooth((t - comeEnd) / Math.max(1, resEnd - comeEnd)));
  return 0;
}

export function formatMinutes(min: number): string {
  if (min < 60) return t('lab.tl.min', { n: Math.round(min) });
  const h = min / 60;
  const rounded = Math.round(h * 2) / 2;
  return t('lab.tl.h', { n: rounded.toLocaleString(intlLocale()) });
}
