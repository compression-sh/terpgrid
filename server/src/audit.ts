import { type AppContext, ipTag } from './context.js';
import type { Tx } from './db.js';

/** Sicherheitsrelevante Ereignisse – niemals Passwörter, Tokens oder Inhalte. */
export type AuditType =
  | 'register'
  | 'login.success'
  | 'login.failure'
  | 'login.throttled'
  | 'logout'
  | 'password.change'
  | 'recovery.success'
  | 'recovery.failure'
  | 'recovery.regenerate'
  | 'totp.enable'
  | 'totp.disable'
  | 'session.revoke'
  | 'account.delete'
  | 'invite.create'
  | 'invite.revoke'
  | 'admin.user.status'
  | 'import'
  | 'passkey.add'
  | 'passkey.rename'
  | 'passkey.remove'
  | 'keys.rotate';

export async function audit(ctx: AppContext, type: AuditType, opts: { userId?: string | null; ip?: string; meta?: Record<string, string | number | boolean>; client?: Tx } = {}): Promise<void> {
  const q = 'INSERT INTO audit_events(user_id, type, ip_tag, meta) VALUES ($1, $2, $3, $4)';
  const params = [opts.userId ?? null, type, opts.ip ? ipTag(ctx, opts.ip) : null, JSON.stringify(opts.meta ?? {})];
  try {
    if (opts.client) await opts.client.query(q, params);
    else await ctx.db.query(q, params);
  } catch {
    // Audit-Fehler dürfen den Request nicht abbrechen
  }
}
