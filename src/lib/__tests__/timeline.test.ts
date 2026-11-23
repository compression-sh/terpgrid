import { describe, expect, it } from 'vitest';
import { TIMELINES, activePhasesAt, formatMinutes, phaseStatusAt, relativeIntensityBand } from '../calc/timeline';

describe('Timeline', () => {
  it('Phasen sind konsistent (Beginn ≤ Ende, Bereiche geordnet)', () => {
    for (const tl of Object.values(TIMELINES)) {
      for (const p of tl.phases) {
        expect(p.startMin[0]).toBeLessThanOrEqual(p.startMin[1]);
        expect(p.endMin[0]).toBeLessThanOrEqual(p.endMin[1]);
        expect(p.startMin[0]).toBeLessThanOrEqual(p.endMin[0]);
        expect(p.endMin[1]).toBeLessThanOrEqual(tl.horizonMin);
      }
    }
  });

  it('Edibles wirken später als Rauchen (Health Canada)', () => {
    expect(TIMELINES.edibles.phases[0]!.startMin[0]).toBe(30);
    expect(TIMELINES.edibles.phases[0]!.startMin[1]).toBe(120);
    expect(TIMELINES.smoking.phases[0]!.startMin[1]).toBeLessThan(TIMELINES.edibles.phases[0]!.startMin[0]);
  });

  it('nach 20 Minuten: Rauchen aktiv, Edibles noch nicht', () => {
    expect(activePhasesAt('smoking', 20).length).toBeGreaterThan(0);
    expect(activePhasesAt('edibles', 20)).toEqual([]);
  });

  it('Phasenstatus', () => {
    const peak = TIMELINES.edibles.phases[1]!;
    expect(phaseStatusAt(peak, 60)).toBe('not-yet');
    expect(phaseStatusAt(peak, 120)).toBe('possible');
    expect(phaseStatusAt(peak, 240)).toBe('likely');
    expect(phaseStatusAt(peak, 600)).toBe('over');
  });

  it('Intensitätsband ist geordnet und relativ (0–1)', () => {
    for (let t = 0; t <= 1440; t += 15) {
      for (const route of ['smoking', 'edibles'] as const) {
        const [lo, hi] = relativeIntensityBand(route, t);
        expect(lo).toBeGreaterThanOrEqual(0);
        expect(hi).toBeLessThanOrEqual(1);
        expect(lo).toBeLessThanOrEqual(hi);
      }
    }
  });

  it('formatMinutes', () => {
    expect(formatMinutes(30)).toBe('30 Min.');
    expect(formatMinutes(90)).toBe('1,5 Std.');
  });
});
