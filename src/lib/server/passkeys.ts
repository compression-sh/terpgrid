/**
 * Passkeys im Browser über @simplewebauthn/browser (keine eigene WebAuthn-Kryptografie).
 * Die Prüfung von Challenge, Origin, RP-ID und Signatur erfolgt ausschließlich auf dem Server.
 */
import { WebAuthnError, browserSupportsWebAuthn, startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { ApiError, type ServerUser, api } from './api';

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
  if (e instanceof ApiError) return e.message;
  const name = (e as { name?: string })?.name;
  if (e instanceof WebAuthnError || name === 'NotAllowedError' || name === 'AbortError')
    return 'Der Vorgang wurde abgebrochen oder ist abgelaufen. Bitte erneut versuchen.';
  if (name === 'InvalidStateError') return 'Dieser Passkey ist auf diesem Gerät bereits registriert.';
  if (name === 'SecurityError') return 'Passkeys funktionieren nur über HTTPS mit der richtigen Domain.';
  return 'Passkey konnte nicht verwendet werden.';
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
  const os = /iPhone/.test(ua) ? 'iPhone' : /iPad/.test(ua) ? 'iPad' : /Android/.test(ua) ? 'Android' : /Mac OS X/.test(ua) ? 'Mac' : /Windows/.test(ua) ? 'Windows' : /Linux/.test(ua) ? 'Linux' : 'Gerät';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : '';
  return browser ? `${os} · ${browser}` : os;
}
