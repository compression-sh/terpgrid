import type { FastifyInstance } from 'fastify';
import type { AppContext } from '../context.js';
import { decrypt, encrypt, fileAad } from '../crypto.js';
import { withUser } from '../db.js';
import { FILE_KINDS, type FileKind, KIND_MIMES, newStorageName, readBlob, removeBlob, sniffMime, trashBlob, writeBlob } from '../files.js';
import { HttpError, requireSession, throttle } from '../http.js';
import fp from '../plugin.js';
import { ID_RE } from '../stores.js';
import { loadUserKeys } from '../userkeys.js';

type P = { kind: string; id: string; variant: string };

function check(p: P): { kind: FileKind; id: string; variant: string } {
  if (!(p.kind in FILE_KINDS)) throw new HttpError(404, 'Nicht gefunden');
  const kind = p.kind as FileKind;
  if (!(FILE_KINDS[kind] as readonly string[]).includes(p.variant) || !ID_RE.test(p.id)) throw new HttpError(404, 'Nicht gefunden');
  return { kind, id: p.id, variant: p.variant };
}

export function fileRoutes(ctx: AppContext) {
  return fp(async (app: FastifyInstance) => {
    app.put<{ Params: P }>('/api/files/:kind/:id/:variant', { bodyLimit: ctx.config.maxUploadBytes }, async (req, reply) => {
      const s = requireSession(req);
      const { kind, id, variant } = check(req.params);
      const wait = ctx.limits.upload.take(`up:${s.userId}`);
      if (wait) throttle(wait, 'Zu viele Uploads. Bitte später erneut versuchen.');
      const body = req.body;
      if (!Buffer.isBuffer(body) || body.length === 0) throw new HttpError(400, 'Leere Datei');
      const mime = sniffMime(body);
      // Typ nur nach Signatur – die Angabe des Clients wird nicht vertraut
      if (!mime || !KIND_MIMES[kind].includes(mime)) throw new HttpError(415, 'Dateityp nicht erlaubt');
      const name = newStorageName();
      const result = await withUser(ctx.db, s.userId, async (c) => {
        const u = await c.query('SELECT storage_bytes FROM users WHERE id = $1 FOR UPDATE', [s.userId]);
        const old = await c.query('SELECT size, storage_name FROM files WHERE user_id = $1 AND kind = $2 AND id = $3 AND variant = $4', [s.userId, kind, id, variant]);
        const oldSize = Number(old.rows[0]?.size ?? 0);
        const used = Number(u.rows[0].storage_bytes);
        if (used - oldSize + body.length > ctx.config.userQuotaBytes) throw new HttpError(413, 'Speicherkontingent erschöpft.', { quotaBytes: ctx.config.userQuotaBytes, usedBytes: used });
        const keys = await loadUserKeys(ctx, c, s.userId);
        const enc = encrypt(keys.currentKey(), body, fileAad(s.userId, kind, id, variant));
        keys.wipe();
        await writeBlob(ctx.config.fileDir, name, enc);
        await c.query(
          `INSERT INTO files(user_id, kind, id, variant, mime, size, storage_name, dek_gen) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (user_id, kind, id, variant) DO UPDATE SET mime = EXCLUDED.mime, size = EXCLUDED.size, storage_name = EXCLUDED.storage_name, dek_gen = EXCLUDED.dek_gen, created_at = now()`,
          [s.userId, kind, id, variant, mime, body.length, name, keys.current],
        );
        await c.query('UPDATE users SET storage_bytes = storage_bytes - $2 + $3 WHERE id = $1', [s.userId, oldSize, body.length]);
        // Alten Blob nicht sofort löschen, sondern in den Papierkorb (Backup-Konsistenz)
        if (old.rows[0]?.storage_name) await trashBlob(c, old.rows[0].storage_name);
        return { ok: true };
      }).catch(async (e) => {
        await removeBlob(ctx.config.fileDir, name).catch(() => {});
        throw e;
      });
      void result;
      return reply.code(201).send({ ok: true, mime, size: body.length });
    });

    app.get<{ Params: P }>('/api/files/:kind/:id/:variant', async (req, reply) => {
      const s = requireSession(req);
      const { kind, id, variant } = check(req.params);
      const data = await withUser(ctx.db, s.userId, async (c) => {
        const { rows } = await c.query('SELECT mime, storage_name, dek_gen FROM files WHERE user_id = $1 AND kind = $2 AND id = $3 AND variant = $4', [s.userId, kind, id, variant]);
        if (!rows[0]) throw new HttpError(404, 'Nicht gefunden');
        const keys = await loadUserKeys(ctx, c, s.userId);
        const blob = await readBlob(ctx.config.fileDir, rows[0].storage_name);
        const body = decrypt(keys.get(rows[0].dek_gen), blob, fileAad(s.userId, kind, id, variant));
        keys.wipe();
        return { mime: rows[0].mime as string, body };
      });
      return reply
        .header('Content-Type', data.mime)
        .header('Content-Disposition', 'attachment')
        .header('Cache-Control', 'private, no-store')
        .header('Content-Security-Policy', "default-src 'none'; sandbox")
        .send(data.body);
    });

    app.delete<{ Params: P }>('/api/files/:kind/:id/:variant', async (req) => {
      const s = requireSession(req);
      const { kind, id, variant } = check(req.params);
      const name = await withUser(ctx.db, s.userId, async (c) => {
        const { rows } = await c.query('DELETE FROM files WHERE user_id = $1 AND kind = $2 AND id = $3 AND variant = $4 RETURNING size, storage_name', [s.userId, kind, id, variant]);
        if (!rows[0]) return null;
        await c.query('UPDATE users SET storage_bytes = greatest(0, storage_bytes - $2) WHERE id = $1', [s.userId, rows[0].size]);
        await trashBlob(c, rows[0].storage_name);
        return rows[0].storage_name as string;
      });
      return { ok: true, deleted: !!name };
    });

    app.get('/api/files', async (req) => {
      const s = requireSession(req);
      return withUser(ctx.db, s.userId, async (c) => {
        const { rows } = await c.query('SELECT kind, id, variant, mime, size FROM files WHERE user_id = $1 ORDER BY kind, id, variant', [s.userId]);
        const u = await c.query('SELECT storage_bytes FROM users WHERE id = $1', [s.userId]);
        return { files: rows.map((r) => ({ ...r, size: Number(r.size) })), usedBytes: Number(u.rows[0].storage_bytes), quotaBytes: ctx.config.userQuotaBytes };
      });
    });
  });
}
