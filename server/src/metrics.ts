/**
 * Betriebskennzahlen ohne Tracking: nur Zähler und Latenzen je Statusklasse,
 * keine IP-Adressen, keine Benutzer, keine Pfade mit IDs, keine Inhalte.
 * Im Speicher einer API-Instanz; Neustart setzt zurück.
 */
const WINDOW_MS = 15 * 60_000;
const MAX_SAMPLES = 2000;

export class Metrics {
  readonly startedAt = Date.now();
  total = 0;
  byClass: Record<string, number> = { '2xx': 0, '3xx': 0, '4xx': 0, '5xx': 0 };
  private samples: { t: number; ms: number; cls: string }[] = [];

  record(status: number, ms: number): void {
    const cls = `${Math.floor(status / 100)}xx`;
    this.total++;
    this.byClass[cls] = (this.byClass[cls] ?? 0) + 1;
    this.samples.push({ t: Date.now(), ms, cls });
    if (this.samples.length > MAX_SAMPLES) this.samples.splice(0, this.samples.length - MAX_SAMPLES);
  }

  snapshot() {
    const now = Date.now();
    const recent = this.samples.filter((s) => now - s.t < WINDOW_MS);
    const sorted = recent.map((s) => s.ms).sort((a, b) => a - b);
    const q = (p: number) => (sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))]! * 10) / 10 : null);
    const errors = recent.filter((s) => s.cls === '5xx').length;
    return {
      uptimeSeconds: Math.round((now - this.startedAt) / 1000),
      requestsTotal: this.total,
      byClass: this.byClass,
      window: {
        minutes: WINDOW_MS / 60_000,
        requests: recent.length,
        p50Ms: q(0.5),
        p95Ms: q(0.95),
        p99Ms: q(0.99),
        serverErrorRate: recent.length ? Math.round((errors / recent.length) * 10000) / 100 : 0,
      },
    };
  }
}
