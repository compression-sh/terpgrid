/**
 * Passkeys im Browser über @simplewebauthn/browser (keine eigene WebAuthn-Kryptografie).
 * Die Prüfung von Challenge, Origin, RP-ID und Signatur erfolgt ausschließlich auf dem Server.
 */
import { WebAuthnError, browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { ApiError, type ServerUser, api } from './api';
import { t } from '../../i18n';

export interface PasskeyInfo {
  id: string;
  name: string;
  deviceType: 'singleDevice' | 'multiDevice';
  backedUp: boolean;
  createdAt: string;
  lastUsedAt: string | null;
}

export const passkeysSupported = (): boolean => {
  try {
    return browserSupportsWebAuthn();
  } catch {
    return false;
  }
};

/** Verständliche Meldung für Browser-/Authenticator-Fehler (z. B. abgebrochen). */
export function passkeyErrorText(e: unknown): string {
  if (e instanceof ApiError) return e.status === 0 ? t('account.pk.offline') : e.message;
  const name = (e as { name?: string })?.name;
  if (e instanceof WebAuthnError || name === 'NotAllowedError' || name === 'AbortError')
    return t('account.pk.aborted');
  if (name === 'InvalidStateError') return t('account.pk.exists');
  if (name === 'NotSupportedError') return t('account.pk.unsupported');
  if (name === 'SecurityError') return t('account.pk.https');
  return t('account.pk.failed');
}

export async function loginWithPasskey(): Promise<{ user: ServerUser }> {
  const { flowId, options } = await api<{ flowId: string; options: Parameters<typeof startAuthentication>[0]['optionsJSON'] }>('POST', '/api/auth/passkeys/login/options');
  const response = await startAuthentication({ optionsJSON: options });
  return api<{ user: ServerUser }>('POST', '/api/auth/passkeys/login/verify', { flowId, response });
}

export async function registerPasskey(name: string): Promise<PasskeyInfo[]> {
  const options = await api<Parameters<typeof startRegistration>[0]['optionsJSON']>('POST', '/api/auth/passkeys/register/options');
  const response = await startRegistration({ optionsJSON: options });
  const r = await api<{ passkeys: PasskeyInfo[] }>('POST', '/api/auth/passkeys/register/verify', { response, name });
  return r.passkeys;
}

/** Vorschlag für den Passkey-Namen aus dem Browser (nur lokal, editierbar). */
export function suggestPasskeyName(): string {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : t('account.pk.device');
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return browser ? `${os} · ${browser}` : os;
}
