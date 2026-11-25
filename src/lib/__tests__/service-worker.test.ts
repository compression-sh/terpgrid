import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Script } from 'node:vm';
import { describe, expect, it } from 'vitest';

const sw = readFileSync(resolve(__dirname, '../../../public/sw.js'), 'utf8');
const vite = readFileSync(resolve(__dirname, '../../../vite.config.ts'), 'utf8');

describe('Service Worker', () => {
  it('speichert die gehashten Assets vorab (Platzhalter wird beim Build ersetzt)', () => {
    expect(sw).toContain('[/*__TERPGRID_PRECACHE__*/]');
    expect(vite).toContain("'/*__TERPGRID_PRECACHE__*/'");
  });
  it('cacht nie private Pfade und ignoriert Vary nur für öffentliche Dateien', () => {
    expect(sw).toMatch(/pathname\.startsWith\('\/api\/'\)/);
    expect(sw).toMatch(/if \(isPrivate\(url\)\) return;/);
    expect(sw.match(/ignoreVary: true/g)?.length).toBe(2);
  });
  it('der Platzhalter ist auch unersetzt gültiges JavaScript (nur kompiliert, nicht ausgeführt)', () => {
    expect(() => new Script(sw)).not.toThrow();
  });
});
