import { t, tDynamic } from '../../i18n';

/**
 * Client für die eigene TERPGRID-Instanz. Session nur als HttpOnly-Cookie
 * (nie in localStorage/URL); CSRF-Token nur im Arbeitsspeicher.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
  get reauthRequired() {
    return this.extra.reauthRequired === true;
  }
}

let csrfToken = '';
export const setCsrfToken = (t: string) => {
  csrfToken = t;
};

type Fetch = typeof fetch;
let fetchImpl: Fetch = (...a) => fetch(...a);
/** Nur für Tests. */
export const setApiFetch = (f: Fetch) => {
  fetchImpl = f;
};
let onUnauthorized: (() => void) | null = null;
export const setOnUnauthorized = (f: (() => void) | null) => {
  onUnauthorized = f;
};

export async function api<T = unknown>(method: string, path: string, body?: unknown, opts: { raw?: Blob | ArrayBuffer; contentType?: string; signal?: AbortSignal; binary?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = { 'X-Requested-With': 'terpgrid', Accept: 'application/json' };
  if (csrfToken) headers['X-CSRF-Token'] = csrfToken;
  let payload: BodyInit | undefined;
  if (opts.raw !== undefined) {
    payload = opts.raw;
    headers['Content-Type'] = opts.contentType ?? 'application/octet-stream';
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }
  let res: Response;
  try {
    res = await fetchImpl(path, { method, headers, body: payload, credentials: 'same-origin', cache: 'no-store', signal: opts.signal, referrerPolicy: 'no-referrer' });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, t('common.srv.unreachable'));
  }
  if (opts.binary && res.ok) return (await res.arrayBuffer()) as T;
  // Abgebrochenes Lesen (Verbindung weg, Seite wird neu geladen) ist ein Verbindungsfehler – nicht „leere Antwort“:
  // sonst erhielten Aufrufer bei 200 still `null` (z. B. Sitzung ohne `user`).
  let text: string;
  try {
    text = await res.text();
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, t('common.srv.unreachable'));
  }
  let json: Record<string, unknown> | null = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null; // kein JSON (z. B. HTML einer fremden Seite) – die Aufrufer prüfen die Form
  }
  if (!res.ok) {
    if (res.status === 401 && !path.startsWith('/api/auth/')) onUnauthorized?.();
    const { error, ...extra } = json ?? {};
    // Bekannte Meldungen werden über ihren Code übersetzt; unbekannte erscheinen unverändert.
    const code = typeof extra.code === 'string' ? extra.code : undefined;
    const message = typeof error === 'string' ? (code ? tDynamic(`errors.${code}`, error) : error) : t('common.srv.error', { n: String(res.status) });
    throw new ApiError(res.status, message, extra);
  }
  if (json && typeof json.csrfToken === 'string') setCsrfToken(json.csrfToken);
  return json as T;
}

/* ───────────── Typen der Server-Antworten ───────────── */

export interface ServerUser {
  loginName: string;
  loginKind: 'username' | 'generated';
  displayName: string | null;
  role: 'user' | 'admin';
  totpEnabled: boolean;
  accountKey: string;
}
export interface SessionResponse {
  user: ServerUser;
  csrfToken: string;
  reauthUntil: string | null;
  session: { handle: string; createdAt: string };
}
export interface AuthConfig {
  inviteOnly: boolean;
  minPasswordLength: number;
  version: string;
}
export type ChangeResult =
  | { store: string; id: string; status: 'ok'; version: number; seq: string }
  | { store: string; id: string; status: 'unchanged'; version: number }
  | { store: string; id: string; status: 'conflict'; server: { version: number; deleted: boolean; data: unknown | null } }
  | { store: string; id: string; status: 'rejected'; error: string };
export interface RemoteChange {
  store: string;
  id: string;
  version: number;
  seq: string;
  deleted: boolean;
  data: unknown | null;
}
