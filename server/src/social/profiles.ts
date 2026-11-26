/**
 * Private Profile (Phase 5.5).
 *
 * - Getrennt vom Anmeldenamen: Handle und Social-ID sind eigene Kennungen; der
 *   Anmeldename wird nie an andere Konten ausgegeben (und darf nicht als Handle dienen).
 * - Standardmäßig privat: Nur der Anzeigename ist für bestätigte Freunde sichtbar; alle
 *   weiteren Angaben erst nach ausdrücklicher Freigabe je Feld.
 * - Mitglieder gemeinsamer Bereiche und Empfänger einer Anfrage sehen nur die Identität
 *   (Anzeigename, Handle, Social-ID) – nie weitere Angaben, sofern nicht befreundet.
 * - Inhalte sind mit einem eigenen Profilschlüssel verschlüsselt (nicht dem Kontoschlüssel).
 */
import type { AppContext } from '../context.js';
import { decrypt, encrypt, profileAad, randomBase32 } from '../crypto.js';
import type { Tx } from '../db.js';
import { HttpError } from '../http.js';
import { CONTROL_CHARS, displayNameProblem } from '../identity.js';
import { newProfileKey, unwrapProfileKey } from '../collab/keys.js';

export const PROFILE_FIELDS = ['displayName', 'bio', 'accent', 'avatar', 'favoriteStrains', 'favoriteTerpenes', 'interests'] as const;
export type ProfileField = (typeof PROFILE_FIELDS)[number];
export type Visibility = 'private' | 'friends';
export const DEFAULT_VISIBILITY: Record<ProfileField, Visibility> = {
  displayName: 'friends',
  bio: 'private',
  accent: 'private',
  avatar: 'private',
  favoriteStrains: 'private',
  favoriteTerpenes: 'private',
  interests: 'private',
};
export const ACCENTS = ['emerald', 'teal', 'sky', 'violet', 'amber', 'rose', 'lime'] as const;

export interface ProfileData {
  displayName?: string;
  bio?: string;
  accent?: (typeof ACCENTS)[number];
  avatar?: string;
  favoriteStrains?: string[];
  favoriteTerpenes?: string[];
  interests?: string[];
}

/** Öffentliche Identität gegenüber anderen Konten (nie Anmeldename oder interne Daten). */
export interface Identity {
  ref: string;
  handle: string | null;
  socialId: string;
  displayName: string | null;
  avatar?: string | null;
}
export interface FriendView extends Identity {
  bio?: string;
  accent?: string;
  favoriteStrains?: string[];
  favoriteTerpenes?: string[];
  interests?: string[];
}

export const formatSocialId = (raw: string) => `TG-${raw.slice(0, 4)}-${raw.slice(4, 8)}`.toUpperCase();
/** „TG-ABCD-EF12“, „abcdef12“ → interne Form (8 Zeichen, Crockford, klein) oder null */
export function parseSocialId(input: string): string | null {
  const s = input
    .trim()
    .toLowerCase()
    .replace(/^tg[-\s]?/, '')
    .replace(/[-\s]/g, '')
    .replace(/[il]/g, '1')
    .replace(/o/g, '0');
  return /^[0-9a-hjkmnp-tv-z]{8}$/.test(s) ? s : null;
}

const RESERVED = new Set(['admin', 'administrator', 'terpgrid', 'support', 'system', 'root', 'moderator', 'mod', 'owner', 'help', 'security', 'staff', 'team', 'null', 'undefined']);
export function normalizeHandle(input: string): string {
  return input.trim().replace(/^@/, '').normalize('NFKC').toLowerCase();
}
export function handleProblem(handle: string, loginName: string): string | null {
  if (!/^[a-z0-9][a-z0-9_.]{1,22}[a-z0-9]$/.test(handle)) return 'Handle: 3–24 Zeichen, nur a–z, 0–9, Punkt und Unterstrich; nicht mit Punkt oder Unterstrich beginnen/enden.';
  if (/[._]{2}/.test(handle)) return 'Handle: keine zwei Sonderzeichen hintereinander.';
  if (RESERVED.has(handle)) return 'Dieses Handle ist reserviert.';
  if (handle === loginName.toLowerCase()) return 'Aus Sicherheitsgründen darf dein Handle nicht deinem Anmeldenamen entsprechen – der Anmeldename bleibt privat.';
  return null;
}

const CONTROL = CONTROL_CHARS;
function cleanText(v: unknown, max: number, label: string, multiline = false): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string') throw new HttpError(400, `${label}: ungültiger Wert`);
  const s = v.normalize('NFKC').trim();
  const check = multiline ? s.replace(/\n/g, '') : s;
  if (CONTROL.test(check)) throw new HttpError(400, `${label} enthält unzulässige Zeichen.`);
  if (s.length > max) throw new HttpError(400, `${label}: höchstens ${max} Zeichen.`);
  return s || undefined;
}
function cleanList(v: unknown, label: string): string[] | undefined {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v) || v.length > 12) throw new HttpError(400, `${label}: höchstens 12 Einträge.`);
  const out = [...new Set(v.map((x) => cleanText(x, 40, label)).filter((x): x is string => !!x))];
  return out.length ? out : undefined;
}

/** Avatar: Data-URL (JPEG/PNG/WebP), Inhalt per Signatur geprüft, max. 120 KB. */
/** Erkennt EXIF/XMP-Blöcke in JPEG, PNG und WebP (Signaturen, kein vollständiger Parser). */
export function hasEmbeddedMetadata(b: Buffer): boolean {
  if (b.includes(Buffer.from('Exif\0\0', 'latin1'))) return true; // JPEG APP1 / WebP-EXIF-Inhalt
  if (b.includes(Buffer.from('http://ns.adobe.com/xap/1.0/', 'latin1'))) return true; // XMP
  if (b.includes(Buffer.from('eXIf', 'latin1')) || b.includes(Buffer.from('iTXtXML:com.adobe.xmp', 'latin1'))) return true; // PNG
  if (b.toString('latin1', 0, 4) === 'RIFF' && (b.includes(Buffer.from('EXIF', 'latin1')) || b.includes(Buffer.from('XMP ', 'latin1')))) return true; // WebP
  return false;
}

export function cleanAvatar(v: unknown): string | undefined {
  if (v === undefined || v === null || v === '') return undefined;
  if (typeof v !== 'string') throw new HttpError(400, 'Avatar: ungültiger Wert');
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(v);
  if (!m) throw new HttpError(400, 'Avatar: nur JPEG, PNG oder WebP.');
  const bytes = Buffer.from(m[2]!, 'base64');
  if (bytes.length > 120 * 1024) throw new HttpError(413, 'Avatar: höchstens 120 KB.');
  const jpeg = bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const png = bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  const webp = bytes.toString('latin1', 0, 4) === 'RIFF' && bytes.toString('latin1', 8, 12) === 'WEBP';
  const ok = (m[1] === 'image/jpeg' && jpeg) || (m[1] === 'image/png' && png) || (m[1] === 'image/webp' && webp);
  if (!ok) throw new HttpError(415, 'Avatar: Dateiinhalt passt nicht zum Typ.');
  // Profilbilder sehen Freunde: eingebettete Metadaten (EXIF inkl. GPS, XMP) nie annehmen.
  // Die App kodiert Bilder vorher über <canvas> neu; dieser Pfad greift nur bei direkten API-Aufrufen.
  if (hasEmbeddedMetadata(bytes)) throw new HttpError(415, 'Avatar: Bild enthält Metadaten (z. B. Standort). Bitte über die App hochladen.');
  return v;
}

export function cleanProfile(input: Record<string, unknown>, current: ProfileData): ProfileData {
  const next: ProfileData = { ...current };
  if ('displayName' in input) {
    const d = cleanText(input.displayName, 40, 'Anzeigename');
    if (d) {
      const p = displayNameProblem(d);
      if (p) throw new HttpError(400, p);
    }
    next.displayName = d;
  }
  if ('bio' in input) next.bio = cleanText(input.bio, 500, 'Über mich', true);
  if ('accent' in input) {
    if (input.accent !== null && input.accent !== undefined && !(ACCENTS as readonly unknown[]).includes(input.accent)) throw new HttpError(400, 'Unbekannte Akzentfarbe');
    next.accent = (input.accent ?? undefined) as ProfileData['accent'];
  }
  if ('avatar' in input) next.avatar = cleanAvatar(input.avatar);
  if ('favoriteStrains' in input) next.favoriteStrains = cleanList(input.favoriteStrains, 'Lieblingssorten');
  if ('favoriteTerpenes' in input) next.favoriteTerpenes = cleanList(input.favoriteTerpenes, 'Lieblingsterpene');
  if ('interests' in input) next.interests = cleanList(input.interests, 'Interessen');
  for (const k of Object.keys(next) as (keyof ProfileData)[]) if (next[k] === undefined) delete next[k];
  return next;
}

export function cleanVisibility(v: unknown, current: Record<string, Visibility>): Record<ProfileField, Visibility> {
  const out = { ...DEFAULT_VISIBILITY, ...current } as Record<ProfileField, Visibility>;
  if (v === undefined) return out;
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new HttpError(400, 'Ungültige Sichtbarkeit');
  for (const [k, val] of Object.entries(v)) {
    if (!(PROFILE_FIELDS as readonly string[]).includes(k) || (val !== 'private' && val !== 'friends')) throw new HttpError(400, 'Ungültige Sichtbarkeit');
    out[k as ProfileField] = val;
  }
  return out;
}

export interface ProfileRow {
  user_id: string;
  social_id: string;
  handle: string | null;
  requests_enabled: boolean;
  visibility: Record<string, Visibility>;
  key_gen: number;
  key_wrapped: Buffer;
  kek_version: number;
  payload: Buffer | null;
  notify_prefs: Record<string, boolean>;
}

export function decodeProfile(ctx: AppContext, r: ProfileRow): ProfileData {
  if (!r.payload) return {};
  const key = unwrapProfileKey(ctx, r.user_id, r.key_gen, r.key_wrapped, r.kek_version);
  try {
    return JSON.parse(decrypt(key, r.payload, profileAad(r.user_id)).toString('utf8')) as ProfileData;
  } finally {
    key.fill(0);
  }
}

export function encodeProfile(ctx: AppContext, r: Pick<ProfileRow, 'user_id' | 'key_gen' | 'key_wrapped' | 'kek_version'>, data: ProfileData): Buffer | null {
  if (!Object.keys(data).length) return null;
  const key = unwrapProfileKey(ctx, r.user_id, r.key_gen, r.key_wrapped, r.kek_version);
  try {
    return encrypt(key, Buffer.from(JSON.stringify(data), 'utf8'), profileAad(r.user_id));
  } finally {
    key.fill(0);
  }
}

const COLS = 'user_id, social_id, handle, requests_enabled, visibility, key_gen, key_wrapped, kek_version, payload, notify_prefs';

/** Eigenes Profil laden; legt es beim ersten Zugriff an (zufällige Social-ID, eigener Schlüssel). */
export async function ensureProfile(ctx: AppContext, c: Tx, userId: string): Promise<ProfileRow> {
  const r = await c.query(`SELECT ${COLS} FROM profiles WHERE user_id = $1`, [userId]);
  if (r.rows[0]) return r.rows[0];
  const { wrapped, kekVersion, key } = newProfileKey(ctx, userId, 1);
  key.fill(0);
  for (let i = 0; i < 5; i++) {
    const socialId = randomBase32(8);
    await c.query('SAVEPOINT prof');
    try {
      await c.query('INSERT INTO profiles(user_id, social_id, key_gen, key_wrapped, kek_version, visibility) VALUES ($1, $2, 1, $3, $4, $5)', [
        userId,
        socialId,
        wrapped,
        kekVersion,
        JSON.stringify(DEFAULT_VISIBILITY),
      ]);
      await c.query('RELEASE SAVEPOINT prof');
      break;
    } catch (e) {
      await c.query('ROLLBACK TO SAVEPOINT prof');
      if ((e as { code?: string }).code !== '23505' || i === 4) throw e;
    }
  }
  return (await c.query(`SELECT ${COLS} FROM profiles WHERE user_id = $1`, [userId])).rows[0];
}

export type Relation = 'self' | 'friend' | 'hidden-friend' | 'member' | 'requester' | 'none';

/**
 * Profile anderer Konten im Kontext des Betrachters. RLS liefert nur sichtbare Zeilen;
 * welche Felder herausgegeben werden, entscheidet die Beziehung und die Sichtbarkeit je Feld.
 */
export async function viewProfiles(ctx: AppContext, c: Tx, viewerId: string, userIds: string[]): Promise<Map<string, FriendView & { relation: Relation }>> {
  const ids = [...new Set(userIds.filter(Boolean))];
  const out = new Map<string, FriendView & { relation: Relation }>();
  if (!ids.length) return out;
  const { rows } = await c.query(
    `SELECT ${COLS}, tg_are_friends(user_id) AS friend, tg_profile_hidden_from_me(user_id) AS hidden FROM profiles WHERE user_id = ANY($1::uuid[])`,
    [ids],
  );
  for (const r of rows as (ProfileRow & { friend: boolean; hidden: boolean })[]) {
    const data = decodeProfile(ctx, r);
    const vis = { ...DEFAULT_VISIBILITY, ...r.visibility };
    const relation: Relation = r.user_id === viewerId ? 'self' : r.friend ? (r.hidden ? 'hidden-friend' : 'friend') : 'member';
    const shown = (f: ProfileField) => relation === 'self' || (relation === 'friend' && vis[f] === 'friends') || (f === 'displayName' && vis.displayName === 'friends');
    const v: FriendView & { relation: Relation } = {
      ref: r.user_id,
      handle: r.handle,
      socialId: formatSocialId(r.social_id),
      displayName: shown('displayName') ? (data.displayName ?? null) : null,
      relation,
    };
    if (shown('avatar')) v.avatar = data.avatar ?? null;
    if (relation === 'self' || relation === 'friend') {
      if (shown('bio') && data.bio) v.bio = data.bio;
      if (shown('accent') && data.accent) v.accent = data.accent;
      if (shown('favoriteStrains') && data.favoriteStrains) v.favoriteStrains = data.favoriteStrains;
      if (shown('favoriteTerpenes') && data.favoriteTerpenes) v.favoriteTerpenes = data.favoriteTerpenes;
      if (shown('interests') && data.interests) v.interests = data.interests;
    }
    out.set(r.user_id, v);
  }
  return out;
}

/** Nur Identität (für Mitgliederlisten, Kommentare, Benachrichtigungen). */
export async function identities(ctx: AppContext, c: Tx, viewerId: string, userIds: string[]): Promise<Map<string, Identity>> {
  const views = await viewProfiles(ctx, c, viewerId, userIds);
  const out = new Map<string, Identity>();
  for (const [id, v] of views) out.set(id, { ref: v.ref, handle: v.handle, socialId: v.socialId, displayName: v.displayName, avatar: v.relation === 'friend' || v.relation === 'self' ? (v.avatar ?? null) : null });
  return out;
}

/** Platzhalter, wenn das Profil nicht sichtbar ist (z. B. gelöschtes Konto oder Blockierung). */
export const UNKNOWN_IDENTITY = (ref: string | null): Identity => ({ ref: ref ?? '', handle: null, socialId: '', displayName: null, avatar: null });
