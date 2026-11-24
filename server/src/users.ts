import { randomBytes, randomUUID } from 'node:crypto';
import type { AppContext } from './context.js';
import { hmac, wrapDek, wrapDekGen } from './crypto.js';
import type { Tx } from './db.js';
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
  const dekCopy = Buffer.from(dek);
  dek.fill(0);
  await c.query(
    `INSERT INTO users(id, login_name, login_kind, display_name, role, password_hash, dek_wrapped, dek_key_version, age_confirmed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now())`,
    [id, u.loginName, u.loginKind, u.displayName, u.role ?? 'user', u.passwordHash, wrapped, ctx.keys.current],
  );
  const dek2 = Buffer.from(dekCopy);
  await c.query("INSERT INTO user_keys(user_id, gen, dek_wrapped, kek_version, state) VALUES ($1, 1, $2, $3, 'active')", [id, wrapDekGen(ctx.keys.currentKey(), dek2, id, 1), ctx.keys.current]);
  dek2.fill(0);
  dekCopy.fill(0);
  return id;
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
