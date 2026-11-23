/**
 * Passwort-Hashing mit Argon2id (@node-rs/argon2, Referenzimplementierung).
 * - PHC-String enthält Algorithmus, Version, Parameter und zufälliges Salt
 * - Rehash beim Login, wenn sich Parameter geändert haben
 * - Parallelitätsbegrenzung gegen Ressourcen-Erschöpfung
 */
import { Algorithm, hash, verify } from '@node-rs/argon2';

export interface Argon2Params {
  memoryCost: number;
  timeCost: number;
  parallelism: number;
}

export class Semaphore {
  private active = 0;
  private queue: (() => void)[] = [];
  constructor(
    private readonly max: number,
    private readonly maxQueue = 50,
  ) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) {
      if (this.queue.length >= this.maxQueue) throw new BusyError();
      await new Promise<void>((r) => this.queue.push(r));
    }
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }
}

export class BusyError extends Error {
  constructor() {
    super('Server ausgelastet');
  }
}

export class PasswordHasher {
  private readonly sem: Semaphore;
  private dummy?: Promise<string>;
  constructor(
    readonly params: Argon2Params,
    maxConcurrent: number,
  ) {
    this.sem = new Semaphore(maxConcurrent);
  }

  hash(password: string): Promise<string> {
    return this.sem.run(() => hash(password, { algorithm: Algorithm.Argon2id, ...this.params, outputLen: 32 }));
  }

  async verify(phc: string, password: string): Promise<boolean> {
    return this.sem.run(async () => {
      try {
        return await verify(phc, password);
      } catch {
        return false;
      }
    });
  }

  /** Gleicher Aufwand für unbekannte Konten (gegen Timing-Enumeration). */
  async verifyDummy(password: string): Promise<false> {
    this.dummy ??= this.hash('terpgrid-dummy-password-for-timing');
    await this.verify(await this.dummy, password);
    return false;
  }

  needsRehash(phc: string): boolean {
    const m = /^\$argon2id\$v=19\$m=(\d+),t=(\d+),p=(\d+)\$/.exec(phc);
    if (!m) return true;
    return Number(m[1]) !== this.params.memoryCost || Number(m[2]) !== this.params.timeCost || Number(m[3]) !== this.params.parallelism;
  }
}

/* ───────────── Passwort-Richtlinie (ASVS 5.0 V6.2) ───────────── */

export const PASSWORD_MIN = 12;
export const PASSWORD_MAX = 256;

/** Kleine Liste sehr häufiger Passwörter/Muster; ergänzt die Mindestlänge. */
const COMMON = new Set([
  'password1234', 'passwort1234', '123456789012', 'qwertzuiopü', 'qwertyuiopas', '111111111111', '000000000000', 'iloveyou1234',
  'administrator', 'letmein12345', 'welcome12345', 'willkommen123', 'hallo1234567', 'sommer2024!!', 'cannabis1234', 'marihuana123',
  'weedweedweed', '420420420420', 'passwortpasswort', 'passwordpassword', 'abcdefghijkl', 'qwertyqwerty', 'asdfghjklöä#',
]);

export function passwordProblems(password: string, loginName?: string): string[] {
  const p: string[] = [];
  const chars = [...password];
  if (chars.length < PASSWORD_MIN) p.push(`Mindestens ${PASSWORD_MIN} Zeichen.`);
  if (chars.length > PASSWORD_MAX) p.push(`Höchstens ${PASSWORD_MAX} Zeichen.`);
  const lower = password.toLowerCase();
  if (COMMON.has(lower)) p.push('Dieses Passwort ist zu verbreitet.');
  if (/^(.)\1+$/.test(password)) p.push('Nicht nur ein wiederholtes Zeichen.');
  if (loginName && loginName.length >= 3 && lower.includes(loginName.toLowerCase().replace(/^tg-/, ''))) p.push('Das Passwort darf den Benutzernamen nicht enthalten.');
  if (new Set(chars).size < 5 && chars.length >= PASSWORD_MIN) p.push('Zu wenige unterschiedliche Zeichen.');
  return p;
}
