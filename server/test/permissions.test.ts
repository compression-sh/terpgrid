/** Rechtematrix: reine Logik und Abgleich mit der Dokumentation. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ACTIONS_FOR_TEST, MATRIX, ROLES, can, matrixTable } from '../src/collab/permissions.js';

describe('Rechtematrix', () => {
  it('Dokument docs/PHASE5-5-PERMISSION-MATRIX.md entspricht dem Code', () => {
    const doc = readFileSync(join(__dirname, '..', '..', 'docs', 'PHASE5-5-PERMISSION-MATRIX.md'), 'utf8');
    expect(doc).toContain(matrixTable());
  });

  it('niemand außer dem Eigentümer verwaltet Mitglieder, Rechte, Schlüssel oder löscht', () => {
    for (const a of ['members.invite', 'members.changeRole', 'members.remove', 'invites.revoke', 'space.delete', 'space.transfer', 'space.rotateKey', 'resource.setAccess', 'comment.moderate'] as const)
      for (const r of ROLES) expect(can(r, a)).toBe(r === 'owner');
  });

  it('unbekannte oder fehlende Rollen dürfen nichts', () => {
    for (const a of ACTIONS_FOR_TEST) {
      expect(can(null, a)).toBe(false);
      expect(can('admin' as never, a)).toBe(false);
    }
  });

  it('Zugriffsstufen schränken nur ein, nie aus', () => {
    for (const r of ROLES)
      for (const a of ACTIONS_FOR_TEST) {
        if (can(r, a, { access: 'editors' }) || can(r, a, { access: 'readonly' })) expect(MATRIX[a]).toContain(r);
      }
    expect(can('viewer', 'resource.read', { access: 'editors' })).toBe(false);
    expect(can('editor', 'resource.update', { access: 'readonly' })).toBe(false);
    expect(can('owner', 'resource.update', { access: 'readonly' })).toBe(true);
  });
});
