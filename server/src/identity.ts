/**
 * Login-Kennungen: frei gewählter Benutzername ODER generierte Konto-ID.
 * Interne Datenbank-IDs (UUID) sind davon unabhängig.
 */
import { randomBase32 } from './crypto.js';

export const RESERVED = new Set(['admin', 'administrator', 'root', 'system', 'support', 'terpgrid', 'moderator', 'api', 'null', 'undefined', 'anonymous', 'help', 'security']);

/** Konto-ID: tg-xxxxx-xxxxx-xxxxx-xxxxx (20 Zeichen Base32 ≈ 100 Bit, CSPRNG). */
export function generateAccountId(): string {
  const raw = randomBase32(20);
  return `tg-${raw.slice(0, 5)}-${raw.slice(5, 10)}-${raw.slice(10, 15)}-${raw.slice(15, 20)}`;
}

const ACCOUNT_ID_RE = /^tg[-\s]*([0-9a-hjkmnp-tv-z]{5})[-\s]*([0-9a-hjkmnp-tv-z]{5})[-\s]*([0-9a-hjkmnp-tv-z]{5})[-\s]*([0-9a-hjkmnp-tv-z]{5})$/;

/** Normalisiert eine eingegebene Kennung für die Suche (Kleinschreibung, NFKC, Konto-ID-Format). */
export function normalizeLogin(input: string): string {
  const s = input.normalize('NFKC').trim().toLowerCase();
  const m = ACCOUNT_ID_RE.exec(s.replace(/[il]/g, '1').replace(/o/g, '0'));
  if (m && /^tg/.test(s)) return `tg-${m[1]}-${m[2]}-${m[3]}-${m[4]}`;
  return s;
}

export function usernameProblem(input: string): string | null {
  const s = input.normalize('NFKC').trim().toLowerCase();
  if (s.length < 3 || s.length > 32) return 'Der Benutzername muss 3–32 Zeichen lang sein.';
  if (!/^[a-z][a-z0-9._-]*$/.test(s)) return 'Erlaubt sind a–z, 0–9, Punkt, Bindestrich und Unterstrich; Beginn mit einem Buchstaben.';
  if (/^tg-/.test(s)) return 'Benutzernamen dürfen nicht mit „tg-“ beginnen (reserviert für Konto-IDs).';
  if (/[._-]{2,}|[._-]$/.test(s)) return 'Keine doppelten oder abschließenden Sonderzeichen.';
  if (RESERVED.has(s)) return 'Dieser Benutzername ist reserviert.';
  return null;
}

export function displayNameProblem(input: string): string | null {
  const s = input.normalize('NFKC').trim();
  if (s.length > 60) return 'Der Anzeigename darf höchstens 60 Zeichen lang sein.';
  // Steuerzeichen und bidirektionale Override-Zeichen verbieten
  // Steuer- und Bidi-Zeichen bewusst ablehnen (Spoofing/Darstellungsfehler)
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f‪-‮⁦-⁩]/.test(s)) return 'Der Anzeigename enthält unzulässige Zeichen.';
  return null;
}

/** Recovery-Code: xxxx-xxxx-xxxx-xxxx (16 Zeichen Base32 ≈ 80 Bit). */
export function generateRecoveryCode(): string {
  const r = randomBase32(16);
  return `${r.slice(0, 4)}-${r.slice(4, 8)}-${r.slice(8, 12)}-${r.slice(12, 16)}`;
}

export function normalizeRecoveryCode(input: string): string {
  return input
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^0-9a-z]/g, '')
    .replace(/[il]/g, '1')
    .replace(/o/g, '0');
}
