import { describe, expect, it } from 'vitest';
import type { Activity } from '../db/types';
import { buildMeasurements, initialMeasurementState, measurementErrors } from '../../components/forms/MeasurementFields';
import { dli, ecToMsCm, msCmTo, svpKPa, vpd } from '../grow/measure';
import { derivedSeries, metricSeries, outOfRange, seriesCsv, withinDays } from '../grow/series';

const act = (id: string, date: string, measurements: Activity['measurements'], plantId?: string): Activity => ({
  id,
  growId: 'g',
  plantId,
  type: 'measurement',
  date,
  title: '',
  notes: '',
  measurements,
  createdAt: date,
  updatedAt: date,
});

describe('EC/TDS-Umrechnung', () => {
  it('rechnet in mS/cm mit gewählter ppm-Skala', () => {
    expect(ecToMsCm(1.4, 'mS/cm')).toBe(1.4);
    expect(ecToMsCm(1400, 'µS/cm')).toBe(1.4);
    expect(ecToMsCm(700, 'ppm500')).toBe(1.4);
    expect(ecToMsCm(980, 'ppm700')).toBe(1.4);
    expect(msCmTo(1.4, 'ppm500')).toBe(700);
    expect(msCmTo(1.4, 'ppm700')).toBe(980);
  });
});

describe('VPD und DLI', () => {
  it('Sättigungsdampfdruck nach Tetens', () => {
    expect(svpKPa(25)).toBeCloseTo(3.17, 2);
    expect(svpKPa(20)).toBeCloseTo(2.34, 2);
  });
  it('Luft-VPD ohne Blatttemperatur ist gekennzeichnet', () => {
    const r = vpd({ temperatureC: 25, humidityPct: 60 })!;
    expect(r.value).toBeCloseTo(1.27, 2);
    expect(r.basis).toBe('air');
  });
  it('Blatt-VPD mit geschätzter Blatttemperatur', () => {
    const r = vpd({ temperatureC: 26, humidityPct: 60, leafTempC: 24, leafTempEstimated: true })!;
    expect(r.basis).toBe('leaf-estimated');
    expect(r.value).toBeCloseTo(svpKPa(24) - svpKPa(26) * 0.6, 2);
  });
  it('kein VPD ohne beide Rohwerte', () => {
    expect(vpd({ temperatureC: 25 })).toBeUndefined();
  });
  it('DLI = PPFD × Stunden × 0,0036', () => {
    expect(dli({ ppfd: 600, photoperiodH: 18 })).toBe(38.9);
    expect(dli({ ppfd: 600 })).toBeUndefined();
    expect(dli({ ppfd: 600, photoperiodH: 30 })).toBeUndefined();
  });
});

describe('Messreihen', () => {
  const acts = [
    act('a', '2026-11-01T10:00', { ph: 6.2, phContext: 'water' }),
    act('b', '2026-11-02T10:00', { ph: 5.8, phContext: 'runoff' }),
    act('c', '2026-11-03T10:00', { ph: 6.4 }),
    act('d', '2026-11-04T10:00', { temperatureC: 25, humidityPct: 60, ppfd: 500, photoperiodH: 12 }, 'p1'),
  ];
  it('filtert nach Messkontext ohne Werte zu verändern', () => {
    expect(metricSeries(acts, 'ph').map((p) => p.value)).toEqual([6.2, 5.8, 6.4]);
    expect(metricSeries(acts, 'ph', { context: 'runoff' }).map((p) => p.value)).toEqual([5.8]);
    expect(metricSeries(acts, 'ph', { context: 'none' }).map((p) => p.value)).toEqual([6.4]);
  });
  it('berechnete Reihen nur aus vorhandenen Rohwerten', () => {
    expect(derivedSeries(acts, 'vpd')).toHaveLength(1);
    expect(derivedSeries(acts, 'dli')[0]!.value).toBe(21.6);
  });
  it('Zielbereich: Grenzen inklusive', () => {
    expect(outOfRange(6, { min: 6, max: 6.5 })).toBeUndefined();
    expect(outOfRange(5.9, { min: 6 })).toBe('low');
    expect(outOfRange(7, { max: 6.5 })).toBe('high');
    expect(outOfRange(7)).toBeUndefined();
  });
  it('Zeitraumfilter', () => {
    const pts = metricSeries(acts, 'ph');
    expect(withinDays(pts, 2, Date.parse('2026-11-03T12:00'))).toHaveLength(2);
    expect(withinDays(pts, 0)).toHaveLength(3);
  });
  it('CSV mit Dezimalkomma und Semikolon', () => {
    const csv = seriesCsv([{ date: '2026-11-01T10:00', ref: 'Pflanze; A', value: 6.25, unit: '', context: 'Gießwasser', flag: '' }]);
    expect(csv).toContain('2026-11-01 10:00;"Pflanze; A";6,25;;Gießwasser;');
  });
});

describe('Messwert-Formular', () => {
  it('speichert EC kanonisch und die Originaleingabe', () => {
    const s = initialMeasurementState();
    s.ecText = '700';
    s.ecUnit = 'ppm500';
    s.ecContext = 'nutrient';
    s.texts.ph = '6,1';
    s.phContext = 'nutrient';
    const m = buildMeasurements(s)!;
    expect(m).toMatchObject({ ecMsCm: 1.4, ecInput: { value: 700, unit: 'ppm500' }, ecContext: 'nutrient', ph: 6.1, phContext: 'nutrient' });
  });
  it('Kontext ohne Wert wird nicht gespeichert, leere Eingabe = keine Messung', () => {
    const s = initialMeasurementState();
    s.phContext = 'runoff';
    expect(buildMeasurements(s)).toBeUndefined();
  });
  it('lehnt unplausible Werte ab (pH > 14, EC über Gerätegrenze)', () => {
    const s = initialMeasurementState();
    s.texts.ph = '15';
    s.ecText = '30';
    expect(measurementErrors(s)).toBe(2);
  });
  it('bestehende Messungen bleiben beim Bearbeiten erhalten', () => {
    const old = { heightCm: 42, ph: 6.3, ecMsCm: 1.2, custom: [{ label: 'Lux', value: 20000, unit: 'lx' }] };
    expect(buildMeasurements(initialMeasurementState(old))).toEqual(old);
  });
});
