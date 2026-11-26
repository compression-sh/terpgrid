/**
 * Aktivitätsverlauf eines Bereichs: nur Ereignistyp, Auslöser, Ziel-ID und Zählwerte –
 * niemals Inhalte. Wiederholte Änderungen desselben Auslösers am selben Ziel innerhalb
 * von 15 Minuten werden zusammengefasst (count), damit der Verlauf lesbar bleibt und
 * doppelte Ereignisse (z. B. erneut gesendete Änderungen) keine Duplikate erzeugen.
 */
import type { Tx } from '../db.js';

export type ActivityType =
  | 'space.created'
  | 'space.updated'
  | 'space.key.rotated'
  | 'space.transfer.offered'
  | 'space.transfer.accepted'
  | 'member.joined'
  | 'member.left'
  | 'member.removed'
  | 'member.role'
  | 'member.invited'
  | 'invite.revoked'
  | 'resource.created'
  | 'resource.updated'
  | 'resource.deleted'
  | 'resource.shared'
  | 'resource.moved'
  | 'resource.access'
  | 'file.uploaded'
  | 'comment.created';

const COALESCE = new Set<ActivityType>(['resource.updated', 'file.uploaded', 'comment.created']);

export async function recordActivity(
  c: Tx,
  spaceId: string,
  actorId: string,
  type: ActivityType,
  opts: { store?: string; id?: string; subjectId?: string; meta?: Record<string, string | number | boolean> } = {},
): Promise<void> {
  if (COALESCE.has(type) && opts.id) {
    const r = await c.query(
      `UPDATE space_activity SET count = count + 1, updated_at = now()
        WHERE id = (SELECT id FROM space_activity WHERE space_id = $1 AND actor_id = $2 AND type = $3 AND target_store = $4 AND target_id = $5
                      AND updated_at > now() - interval '15 minutes' ORDER BY id DESC LIMIT 1)
        RETURNING id`,
      [spaceId, actorId, type, opts.store ?? null, opts.id],
    );
    if (r.rowCount) return;
  }
  await c.query('INSERT INTO space_activity(space_id, actor_id, type, target_store, target_id, subject_id, meta) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
    spaceId,
    actorId,
    type,
    opts.store ?? null,
    opts.id ?? null,
    opts.subjectId ?? null,
    JSON.stringify(opts.meta ?? {}),
  ]);
}
