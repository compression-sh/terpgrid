/**
 * Autorisierung gemeinsamer Bereiche. Jede Bereichs-Operation lädt die Mitgliedschaft
 * NEU aus der Datenbank (keine zwischengespeicherten Rechte) – Entzug wirkt sofort, auch
 * für Offline-Änderungen, die später eintreffen.
 *
 * Nichtmitglieder erhalten 404 (Existenz eines Bereichs wird nicht verraten),
 * Mitglieder ohne Recht 403.
 */
import type { Tx } from '../db.js';
import { HttpError } from '../http.js';
import { type Action, type Ctx, type Role, can } from './permissions.js';

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface SpaceAccess {
  spaceId: string;
  role: Role;
  ownerId: string;
  pendingOwnerId: string | null;
  kind: 'project' | 'collection' | 'general';
  allowExport: boolean;
  keyGen: number;
}

export const notFound = () => new HttpError(404, 'Bereich nicht gefunden oder kein Zugriff');
export const forbidden = (msg = 'Dafür fehlt dir in diesem Bereich die Berechtigung.') => new HttpError(403, msg);

/** Mitgliedschaft laden; optional sofort eine Aktion prüfen. `c` muss aus withUser() stammen. */
export async function requireSpace(c: Tx, spaceId: string, userId: string, action?: Action, ctx: Ctx = {}): Promise<SpaceAccess> {
  if (typeof spaceId !== 'string' || !UUID_RE.test(spaceId)) throw notFound();
  const { rows } = await c.query(
    `SELECT s.id, s.owner_id, s.pending_owner_id, s.kind, s.allow_export, s.key_gen, m.role
       FROM spaces s JOIN space_members m ON m.space_id = s.id AND m.user_id = $2
      WHERE s.id = $1`,
    [spaceId, userId],
  );
  const r = rows[0];
  if (!r) throw notFound();
  const a: SpaceAccess = { spaceId, role: r.role, ownerId: r.owner_id, pendingOwnerId: r.pending_owner_id, kind: r.kind, allowExport: r.allow_export, keyGen: r.key_gen };
  if (action) assertCan(a, action, ctx);
  return a;
}

export function assertCan(a: SpaceAccess, action: Action, ctx: Ctx = {}): void {
  if (!can(a.role, action, { allowExport: a.allowExport, ...ctx })) throw forbidden();
}
