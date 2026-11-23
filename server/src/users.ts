import { randomBytes, randomUUID } from 'node:crypto';
import type { AppContext } from './context.js';
import { hmac, unwrapDek, wrapDek } from './crypto.js';
import type { Db, Tx } from './db.js';
import { generateRecoveryCode, normalizeRecoveryCode } from './identity.js';

export const RECOVERY_CODE_COUNT = 10;

export async function createUserRow(
  ctx: AppContext,
  c: Tx,
  u: { loginName: string; loginKind: 'username' | 'generated'; displayName: string | null; passwordHash: string; role?: 'user' | 'admin' },
): Promise<string> {
  const id = randomUUID();
  const dek = randomBytes(32);
  const wrapped = wrapDek(ctx.keys.currentKey(), dek, id);
  dek.fill(0);
  await c.query(
    `INSERT INTO users(id, login_name, login_kind, display_name, role, password_hash, dek_wrapped, dek_key_version, age_confirmed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
    [id, u.loginName, u.loginKind, u.displayName, u.role ?? 'user', u.passwordHash, wrapped, ctx.keys.current],
  );
  return id;
}

/** Entpackt den Datenschlüssel eines Benutzers (nur serverseitig, nie ausgeliefert). */
export async function getDek(ctx: AppContext, c: Tx | Db, userId: string): Promise<Buffer> {
  const { rows } = await c.query('SELECT dek_wrapped, dek_key_version FROM users WHERE id = $1', [userId]);
  const r = rows[0];
  if (!r) throw new Error('Benutzer nicht gefunden');
  return unwrapDek(ctx.keys.get(r.dek_key_version), r.dek_wrapped, userId);
}

export function recoveryHash(ctx: AppContext, userId: string, code: string): Buffer {
  return hmac(ctx.macKeys.recovery, `${userId}|${normalizeRecoveryCode(code)}`);
}

/** Erzeugt neue Recovery-Codes und ersetzt alle bisherigen. Klartext nur im Rückgabewert. */
export async function replaceRecoveryCodes(ctx: AppContext, c: Tx, userId: string): Promise<string[]> {
  const codes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
  await c.query('DELETE FROM recovery_codes WHERE user_id = $1', [userId]);
  for (const code of codes) await c.query('INSERT INTO recovery_codes(user_id, code_hash) VALUES ($1, $2)', [userId, recoveryHash(ctx, userId, code)]);
  return codes;
}

export function publicUser(r: { id?: string; user_id?: string; login_name: string; login_kind: string; display_name: string | null; role: string; totp_enabled: boolean }) {
  return {
    loginName: r.login_name,
    loginKind: r.login_kind,
    displayName: r.display_name,
    role: r.role,
    totpEnabled: r.totp_enabled,
  };
}
