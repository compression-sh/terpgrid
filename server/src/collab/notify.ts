/**
 * Private In-App-Benachrichtigungen (Phase 5.5).
 *
 * - Zustellung ausschließlich über die Datenbankfunktion tg_notify(): Auslöser ist immer
 *   der angemeldete Benutzer, Empfänger-Einstellungen und Blockierungen werden dort
 *   geprüft, gleichartige ungelesene Meldungen zusammengefasst.
 * - Inhalte gelangen nie in Benachrichtigungen – nur Typ, Auslöser und Verweise.
 * - Vollständig getrennt von Betreiber-Benachrichtigungen (NOTIFY_CMD / systemd).
 *
 * Erweiterungspunkt Web-Push (Phase 5.6): weitere Kanäle implementieren `NotificationChannel`
 * und werden in CHANNELS eingetragen. Phase 5.5 liefert bewusst nur den In-App-Kanal.
 */
import type { Tx } from '../db.js';

export type NotificationCategory = 'friends' | 'invites' | 'comments' | 'updates' | 'access';
export const NOTIFICATION_CATEGORIES: readonly NotificationCategory[] = ['friends', 'invites', 'comments', 'updates', 'access'];
/** Kategorien, die Nutzer abschalten können („access“ – Rechte/Entzug – bleibt immer an) */
export const OPTIONAL_CATEGORIES: readonly NotificationCategory[] = ['friends', 'invites', 'comments', 'updates'];

export type NotificationType =
  | 'friend.request'
  | 'friend.accepted'
  | 'space.invite'
  | 'space.invite.accepted'
  | 'space.update'
  | 'comment.new'
  | 'comment.reply'
  | 'member.role'
  | 'member.joined'
  | 'member.left'
  | 'member.removed'
  | 'space.transfer.offered'
  | 'space.transfer.accepted'
  | 'space.deleted';

export interface NotificationEvent {
  recipient: string;
  category: NotificationCategory;
  type: NotificationType;
  spaceId?: string | null;
  store?: string | null;
  id?: string | null;
  ref?: string | null;
}

export interface NotificationChannel {
  readonly name: string;
  deliver(c: Tx, e: NotificationEvent): Promise<void>;
}

/** In-App-Kanal: schreibt über tg_notify() (RLS: keine direkte INSERT-Berechtigung). */
export const inAppChannel: NotificationChannel = {
  name: 'in-app',
  async deliver(c, e) {
    await c.query('SELECT tg_notify($1, $2, $3, $4, $5, $6, $7)', [e.recipient, e.category, e.type, e.spaceId ?? null, e.store ?? null, e.id ?? null, e.ref ?? null]);
  },
};

const CHANNELS: readonly NotificationChannel[] = [inAppChannel];

export async function notify(c: Tx, e: NotificationEvent): Promise<void> {
  for (const ch of CHANNELS) await ch.deliver(c, e);
}

/** Alle Mitglieder eines Bereichs außer dem Auslöser benachrichtigen (optional nur bestimmte Rollen). */
export async function notifyMembers(c: Tx, spaceId: string, actorId: string, e: Omit<NotificationEvent, 'recipient' | 'spaceId'>, opts: { readable?: { store: string; id: string } } = {}): Promise<void> {
  // Bei ressourcenbezogenen Meldungen nur Mitglieder, die die Ressource lesen dürfen
  const { rows } = opts.readable
    ? await c.query(
        `SELECT m.user_id FROM space_members m JOIN space_records r ON r.space_id = m.space_id AND r.store = $3 AND r.id = $4
          WHERE m.space_id = $1 AND m.user_id <> $2 AND (m.role IN ('owner', 'editor') OR r.access <> 'editors')`,
        [spaceId, actorId, opts.readable.store, opts.readable.id],
      )
    : await c.query('SELECT user_id FROM space_members WHERE space_id = $1 AND user_id <> $2', [spaceId, actorId]);
  for (const r of rows) await notify(c, { ...e, recipient: r.user_id, spaceId });
}
