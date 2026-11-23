/**
 * In-Memory-Ratenbegrenzung für eine einzelne API-Instanz (Self-Hosting).
 * - Fenster-Zähler je Schlüssel (IP, Konto, Endpunkt)
 * - Progressives Backoff für fehlgeschlagene Logins je Konto: keine dauerhafte
 *   Sperre (verhindert, dass Angreifer Konten anderer dauerhaft aussperren)
 * Bei mehreren API-Instanzen müsste dies in die DB/Redis verlagert werden.
 */

export class WindowLimiter {
  private hits = new Map<string, number[]>();
  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Liefert 0, wenn erlaubt (und zählt), sonst Sekunden bis zur nächsten Freigabe. */
  take(key: string): number {
    const t = this.now();
    const list = (this.hits.get(key) ?? []).filter((x) => t - x < this.windowMs);
    if (list.length >= this.limit) {
      this.hits.set(key, list);
      return Math.max(1, Math.ceil((list[0]! + this.windowMs - t) / 1000));
    }
    list.push(t);
    this.hits.set(key, list);
    if (this.hits.size > 50_000) this.sweep();
    return 0;
  }

  private sweep() {
    const t = this.now();
    for (const [k, v] of this.hits) if (!v.some((x) => t - x < this.windowMs)) this.hits.delete(k);
  }
}

export interface BackoffState {
  failures: number;
  blockedUntil: number;
  lastFailure: number;
}

export class LoginBackoff {
  private state = new Map<string, BackoffState>();
  constructor(
    private readonly freeAttempts = 5,
    private readonly baseMs = 1000,
    private readonly maxMs = 15 * 60_000,
    private readonly resetAfterMs = 60 * 60_000,
    private readonly now: () => number = Date.now,
  ) {}

  /** Sekunden bis zum nächsten erlaubten Versuch (0 = erlaubt). */
  retryAfter(key: string): number {
    const s = this.state.get(key);
    if (!s) return 0;
    const t = this.now();
    if (t - s.lastFailure > this.resetAfterMs) {
      this.state.delete(key);
      return 0;
    }
    return s.blockedUntil > t ? Math.ceil((s.blockedUntil - t) / 1000) : 0;
  }

  fail(key: string): void {
    const t = this.now();
    const s = this.state.get(key);
    const failures = s && t - s.lastFailure <= this.resetAfterMs ? s.failures + 1 : 1;
    const over = failures - this.freeAttempts;
    const delay = over > 0 ? Math.min(this.maxMs, this.baseMs * 2 ** (over - 1)) : 0;
    this.state.set(key, { failures, lastFailure: t, blockedUntil: t + delay });
    if (this.state.size > 50_000) for (const [k, v] of this.state) if (t - v.lastFailure > this.resetAfterMs) this.state.delete(k);
  }

  success(key: string): void {
    this.state.delete(key);
  }

  failures(key: string): number {
    return this.state.get(key)?.failures ?? 0;
  }
}
