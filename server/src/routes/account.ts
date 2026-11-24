import type { FastifyInstance } from 'fastify';
import { type Zippable, strToU8, zipSync } from 'fflate';
import { audit } from '../audit.js';
import type { AppContext } from '../context.js';
import { decrypt, fileAad } from '../crypto.js';
import { withUser } from '../db.js';
import { readBlob, trashBlob } from '../files.js';
import { HttpError, requireReauth, requireSession } from '../http.js';
import { displayNameProblem } from '../identity.js';
import fp from '../plugin.js';
import { decodePayload } from '../records.js';
import { clearSessionCookie } from '../sessions.js';
import { SYNC_STORES } from '../stores.js';
import { loadUserKeys } from '../userkeys.js';

/** Gleiche Reihenfolge/Bereiche wie das lokale Backup-Format (src/lib/backup.ts, Format 2). */
const BACKUP_STORES = SYNC_STORES.filter((s) => s !== 'settings');
const ext = (mime: string) => (mime.includes('png') ? 'png' : mime.includes('webp') ? 'webp' : mime.includes('pdf') ? 'pdf' : 'jpg');

export function accountRoutes(ctx: AppContext) {
  return fp(async (app: FastifyInstance) => {
    app.patch<{ Body: { displayName: string | null } }>(
      '/api/account',
      { schema: { body: { type: 'object', required: ['displayName'], additionalProperties: false, properties: { displayName: { type: ['string', 'null'], maxLength: 60 } } } } },
      async (req) => {
        const s = requireSession(req);
        const name = req.body.displayName?.normalize('NFKC').trim() || null;
        if (name) {
          const p = displayNameProblem(name);
          if (p) throw new HttpError(400, p);
        }
        await ctx.db.query('UPDATE users SET display_name = $2 WHERE id = $1', [s.userId, name]);
        return { displayName: name };
      },
    );

    app.get('/api/account/overview', async (req) => {
      const s = requireSession(req);
      const { rows } = await ctx.db.query('SELECT created_at, last_login_at, password_changed_at, storage_bytes FROM users WHERE id = $1', [s.userId]);
      const rc = await ctx.db.query('SELECT count(*) FILTER (WHERE used_at IS NULL)::int AS remaining FROM recovery_codes WHERE user_id = $1', [s.userId]);
      const sess = await ctx.db.query('SELECT count(*)::int AS n FROM sessions WHERE user_id = $1', [s.userId]);
      const pk = await ctx.db.query('SELECT count(*)::int AS n FROM webauthn_credentials WHERE user_id = $1', [s.userId]);
      const ev = await ctx.db.query(
        "SELECT type, created_at FROM audit_events WHERE user_id = $1 AND type IN ('login.success','login.failure','password.change','recovery.success','recovery.regenerate','totp.enable','totp.disable','session.revoke') ORDER BY id DESC LIMIT 20",
        [s.userId],
      );
      const r = rows[0];
      return {
        createdAt: r.created_at,
        lastLoginAt: r.last_login_at,
        passwordChangedAt: r.password_changed_at,
        storageBytes: Number(r.storage_bytes),
        quotaBytes: ctx.config.userQuotaBytes,
        recoveryCodesRemaining: rc.rows[0].remaining,
        sessions: sess.rows[0].n,
        passkeys: pk.rows[0].n,
        totpEnabled: s.totpEnabled,
        securityEvents: ev.rows,
      };
    });

    /** Vollständiger Export im Backup-Format von TERPGRID (ZIP, Format 2). */
    app.get('/api/account/export', async (req, reply) => {
      const s = requireReauth(ctx, req);
      const zip = await withUser(ctx.db, s.userId, async (c) => {
        const keys = await loadUserKeys(ctx, c, s.userId);
        const data: Record<string, unknown[]> = Object.fromEntries(BACKUP_STORES.map((st) => [st, []]));
        let settings: unknown;
        const recs = await c.query('SELECT store, id, payload, dek_gen FROM records WHERE user_id = $1 AND NOT deleted ORDER BY store, id', [s.userId]);
        for (const r of recs.rows) {
          const v = decodePayload(keys.get(r.dek_gen), s.userId, r.store, r.id, r.payload);
          if (r.store === 'settings') {
            if (r.id === 'app') settings = (v as { value?: unknown })?.value;
          } else data[r.store]!.push(v);
        }
        const files: Zippable = {};
        const photoFiles: { id: string; full: string; thumb: string; mime: string }[] = [];
        const docFiles: { id: string; path: string; mime: string; name: string }[] = [];
        const fr = await c.query('SELECT kind, id, variant, mime, storage_name, dek_gen FROM files WHERE user_id = $1 ORDER BY kind, id, variant', [s.userId]);
        const photos = new Map<string, { full?: Buffer; thumb?: Buffer; mime: string }>();
        for (const f of fr.rows) {
          const body = decrypt(keys.get(f.dek_gen), await readBlob(ctx.config.fileDir, f.storage_name), fileAad(s.userId, f.kind, f.id, f.variant));
          if (f.kind === 'photo') {
            const p: { full?: Buffer; thumb?: Buffer; mime: string } = photos.get(f.id) ?? { mime: f.mime };
            if (f.variant === 'full') {
              p.full = body;
              p.mime = f.mime;
            } else p.thumb = body;
            photos.set(f.id, p);
          } else {
            const path = `documents/${f.id}`;
            files[path] = new Uint8Array(body);
            const report = (data.labReports as { documentId?: string; documentName?: string }[]).find((l) => l.documentId === f.id);
            docFiles.push({ id: f.id, path, mime: f.mime, name: report?.documentName ?? `${f.id}.${ext(f.mime)}` });
          }
        }
        for (const [id, p] of photos) {
          if (!p.full) continue;
          const full = `photos/${id}.${ext(p.mime)}`;
          const thumb = `photos/thumbs/${id}.${ext(p.mime)}`;
          files[full] = new Uint8Array(p.full);
          files[thumb] = new Uint8Array(p.thumb ?? p.full);
          photoFiles.push({ id, full, thumb, mime: p.mime });
        }
        const manifest = {
          app: 'TERPGRID',
          format: 2,
          schemaVersion: 2,
          exportedAt: new Date().toISOString(),
          counts: Object.fromEntries(BACKUP_STORES.map((st) => [st, data[st]!.length])),
          settings,
          data,
          photoFiles,
          docFiles,
        };
        keys.wipe();
        files['manifest.json'] = strToU8(JSON.stringify(manifest, null, 2));
        return zipSync(files, { level: 0 });
      });
      return reply
        .header('Content-Type', 'application/zip')
        .header('Content-Disposition', `attachment; filename="terpgrid-export-${new Date().toISOString().slice(0, 10)}.zip"`)
        .send(Buffer.from(zip));
    });

    /** Konto endgültig löschen: Datensätze, Dateien, Sessions, Codes. Backups laufen nach Aufbewahrung aus (BACKUP.md). */
    app.delete<{ Body: { confirm: string } }>(
      '/api/account',
      { schema: { body: { type: 'object', required: ['confirm'], additionalProperties: false, properties: { confirm: { type: 'string', maxLength: 80 } } } } },
      async (req, reply) => {
        const s = requireReauth(ctx, req);
        if (req.body.confirm.trim().toLowerCase() !== s.loginName) throw new HttpError(400, 'Zur Bestätigung bitte die eigene Kennung eingeben.');
        if (s.role === 'admin') {
          const { rows } = await ctx.db.query("SELECT count(*)::int AS n FROM users WHERE role = 'admin' AND status = 'active'");
          if (rows[0].n <= 1) throw new HttpError(409, 'Das letzte Administrationskonto kann nicht gelöscht werden.');
        }
        const names = await withUser(ctx.db, s.userId, async (c) => {
          const f = await c.query('DELETE FROM files WHERE user_id = $1 RETURNING storage_name', [s.userId]);
          // Blobs in den Papierkorb; mit dem Konto werden auch alle Datenschlüssel gelöscht –
          // die verbleibenden verschlüsselten Blobs sind damit sofort nicht mehr entschlüsselbar.
          for (const r of f.rows) await trashBlob(c, r.storage_name);
          await c.query('DELETE FROM records WHERE user_id = $1', [s.userId]);
          await c.query('DELETE FROM users WHERE id = $1', [s.userId]);
          return f.rows.map((r) => r.storage_name as string);
        });
        await audit(ctx, 'account.delete', { ip: req.ip, meta: { files: names.length } });
        clearSessionCookie(ctx, reply);
        return { ok: true };
      },
    );
  });
}
