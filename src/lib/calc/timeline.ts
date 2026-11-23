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
    title: 'Rauchen / Inhalieren',
    horizonMin: 24 * 60,
    phases: [
      {
        id: 'onset',
        label: 'Wirkeintritt',
        startMin: [0, 1],
        endMin: [5, 10],
        description: 'Erste Wirkungen nach Sekunden bis wenigen Minuten.',
      },
      {
        id: 'peak',
        label: 'Hauptwirkung',
        startMin: [10, 15],
        endMin: [60, 120],
        description: 'Stärkste Wirkung typischerweise um ca. 30 Minuten nach Konsum.',
      },
      {
        id: 'comedown',
        label: 'Abklingen',
        startMin: [60, 120],
        endMin: [180, 360],
        description: 'Die Wirkung lässt nach; insgesamt kann sie bis zu 6 Stunden anhalten.',
      },
      {
        id: 'residual',
        label: 'Nachwirkungen',
        startMin: [180, 360],
        endMin: [720, 1440],
        description: 'Restwirkungen (z. B. auf Reaktionsfähigkeit) bis zu 24 Stunden möglich.',
      },
    ],
    keyFacts: [
      { label: 'Wirkeintritt', value: 'Sekunden – Minuten' },
      { label: 'Maximum', value: 'ca. 30 Min.' },
      { label: 'Wirkdauer', value: 'bis ca. 6 Std.' },
      { label: 'Restwirkungen', value: 'bis 24 Std.' },
    ],
    warning:
      'Auch nach dem Abklingen spürbarer Wirkungen können Reaktionszeit und Aufmerksamkeit beeinträchtigt sein. Nicht Auto fahren oder Maschinen bedienen.',
  },
  edibles: {
    route: 'edibles',
    title: 'Edibles / Essen',
    horizonMin: 24 * 60,
    phases: [
      {
        id: 'onset',
        label: 'Wirkeintritt',
        startMin: [30, 120],
        endMin: [60, 180],
        description: 'Erste Wirkungen nach 30 Minuten bis 2 Stunden – manchmal später.',
      },
      {
        id: 'peak',
        label: 'Hauptwirkung',
        startMin: [90, 180],
        endMin: [300, 480],
        description: 'Stärkste Wirkung typischerweise um ca. 4 Stunden nach Einnahme.',
      },
      {
        id: 'comedown',
        label: 'Abklingen',
        startMin: [300, 480],
        endMin: [480, 720],
        description: 'Die Wirkung lässt langsam nach; insgesamt bis zu 12 Stunden.',
      },
      {
        id: 'residual',
        label: 'Nachwirkungen',
        startMin: [480, 720],
        endMin: [1080, 1440],
        description: 'Restwirkungen bis zu 24 Stunden möglich.',
      },
    ],
    keyFacts: [
      { label: 'Wirkeintritt', value: '30 Min. – 2 Std.' },
      { label: 'Maximum', value: 'ca. 4 Std.' },
      { label: 'Wirkdauer', value: 'bis ca. 12 Std.' },
      { label: 'Restwirkungen', value: 'bis 24 Std.' },
    ],
    warning:
      'Häufigster Fehler: Nachdosieren, weil "noch nichts passiert". Die Wirkung kann bis zu 2 Stunden (oder länger) auf sich warten lassen. Mindestens die volle Wirkzeit abwarten, bevor erneut konsumiert wird.',
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
  if (min < 60) return `${Math.round(min)} Min.`;
  const h = min / 60;
  const rounded = Math.round(h * 2) / 2;
  return `${rounded.toLocaleString('de-DE')} Std.`;
}
