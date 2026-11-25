import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SAMPLE_TERPENES, ownReportPercent } from '../catalog/samples';
import { terpeneById } from '../catalog/terpenes';
import type { LabReport } from '../db/types';

const server = readFileSync(resolve(__dirname, '../../../server/src/catalog/samples.ts'), 'utf8');

describe('Laborproben – Zuordnung', () => {
  it('jede Spalte zeigt auf eine Atlas-Verbindung und entspricht der Server-Zuordnung', () => {
    for (const t of SAMPLE_TERPENES) {
      expect(terpeneById(t.atlasId), t.atlasId).toBeDefined();
      const re = new RegExp(`['"]?${t.atlasId}['"]?: \\{ column: '${t.column}'${t.isomerSum ? `, isomerSum: '${t.isomerSum}'` : ' \\}'}`);
      expect(server, `${t.atlasId} → ${t.column}`).toMatch(re);
    }
    expect(new Set(SAMPLE_TERPENES.map((t) => t.column)).size).toBe(14);
  });

  it('eigene Berichte werden in % umgerechnet; Isomer-Summen werden nicht mit Einzelwerten verglichen', () => {
    const r = {
      id: 'l', createdAt: '', updatedAt: '', title: 'P', unit: 'mg/g', origin: 'manual', notes: '',
      thc: 10, thca: 200, terpenes: [{ name: 'beta-Myrcene', value: 6 }, { name: 'Limonene', value: 3 }, { name: 'Ocimene', value: 1 }],
    } as unknown as LabReport;
    const o = ownReportPercent(r);
    expect(o.cannabinoids.thc_total).toBeCloseTo(1 + 0.877 * 20, 2);
    expect(o.terpenes).toEqual({ myrcene: 0.6, limonene: 0.3 });
  });
});
