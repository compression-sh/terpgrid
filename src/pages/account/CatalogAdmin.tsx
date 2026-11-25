import { Check, Database, Loader2, Play, RefreshCw, X } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../app/Toasts';
import { ApiError, api } from '../../lib/server/api';

interface FieldStat {
  field: string;
  label: string;
  total: number;
  present: number;
  missing: number;
  conflicting: number | null;
  questionable: number | null;
  evidence: { breeder: number; seedbank: number; database: number; lab: number; science?: number };
  nameOnly?: boolean;
}
interface Quality {
  generatedAt: string;
  cultivars: number;
  breeders: number;
  listings: number;
  fields: FieldStat[];
  providers: { provider: string; matchedCultivars: number; claims: number; byStatus: Record<string, number> }[];
  samples?: { source: string; version: string; samples: number; terpeneSamples: number; names: number; linkedNames: number; linkedCultivars: number; ambiguousNames: number; linkedSamples: number };
  dataset: { version: string; imported_at: string; parser: string | null } | null;
  cachedAt: string;
}
interface Run {
  id: number;
  provider: string;
  dry_run: boolean;
  status: string;
  requested: number;
  processed: number;
  matched: number;
  claims: number;
  errors: unknown[];
  started_by: string;
  started_at: string;
  finished_at: string | null;
}
interface Runs {
  runs: Run[];
  running: boolean;
  providers: { id: string; name: string; license: string; ttlDays: number }[];
  maxBatch: number;
}
interface Match {
  provider: string;
  provider_id: string;
  provider_name: string;
  provider_breeder: string | null;
  status: string;
  cultivar_id: string | null;
  candidates: string[];
  reason: string;
  decided_by: string;
  cultivar_name: string | null;
  cultivar_breeder: string | null;
}

const pct = (n: number, t: number) => (t ? `${((n / t) * 100).toFixed(1).replace('.', ',')} %` : '–');
const dt = (s: string | null) => (s ? new Date(s).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–');
const STATUS: Record<string, string> = { probable: 'Zu prüfen', ambiguous: 'Mehrdeutig', exact: 'Bestätigt', rejected: 'Abgelehnt' };
const RUN: Record<string, string> = { running: 'läuft', done: 'fertig', failed: 'fehlgeschlagen', aborted: 'abgebrochen' };

/** Katalogqualität, Anreicherungsläufe und Prüfliste – nur öffentliche Katalog-Metadaten. */
export function CatalogAdmin() {
  const toast = useToast();
  const [q, setQ] = useState<Quality | null>(null);
  const [runs, setRuns] = useState<Runs | null>(null);
  const [status, setStatus] = useState('probable');
  const [matches, setMatches] = useState<{ items: Match[]; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ provider: 'strainapi', limit: 10, dryRun: true });
  const err = (e: unknown) => toast(e instanceof ApiError ? e.message : 'Unerwarteter Fehler.', { tone: 'error' });

  const loadRuns = useCallback(() => api<Runs>('GET', '/api/admin/catalog/runs').then(setRuns).catch(() => setRuns(null)), []);
  const loadMatches = useCallback(() => api<{ items: Match[]; total: number }>('GET', `/api/admin/catalog/matches?status=${status}`).then(setMatches).catch(() => setMatches(null)), [status]);
  const loadQuality = useCallback(
    (refresh = false) =>
      api<Quality>('GET', `/api/admin/catalog/quality${refresh ? '?refresh=1' : ''}`)
        .then(setQ)
        .catch(err),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  useEffect(() => {
    void loadQuality();
    void loadRuns();
  }, [loadQuality, loadRuns]);
  useEffect(() => {
    void loadMatches();
  }, [loadMatches]);
  // Fortschritt eines laufenden Batches nachladen
  useEffect(() => {
    if (!runs?.running) return;
    const t = setInterval(() => void loadRuns(), 3000);
    return () => clearInterval(t);
  }, [runs?.running, loadRuns]);

  const decide = async (m: Match, action: 'accept' | 'reject', cultivarId?: string) => {
    try {
      await api('POST', `/api/admin/catalog/matches/${m.provider}/${encodeURIComponent(m.provider_id)}`, { action, ...(cultivarId ? { cultivarId } : {}) });
      toast(action === 'accept' ? 'Zuordnung bestätigt.' : 'Zuordnung abgelehnt.', { tone: 'ok' });
      void loadMatches();
    } catch (e) {
      err(e);
    }
  };

  const provider = runs?.providers.find((p) => p.id === form.provider);

  return (
    <section className="card space-y-5 p-5" aria-labelledby="cat-h">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="cat-h" className="flex items-center gap-2 text-[15px] font-semibold text-ink-50">
            <Database className="size-4" /> Sortenkatalog – Vollständigkeit & Anreicherung
          </h2>
          <p className="hint mt-0.5">
            {q ? `${q.cultivars.toLocaleString('de-DE')} Sorten · ${q.breeders.toLocaleString('de-DE')} Breeder · ${q.listings.toLocaleString('de-DE')} Angebote` : 'Wird berechnet …'}
            {q?.dataset && ` · Datensatz ${q.dataset.version} (Parser v${q.dataset.parser ?? '1'})`}
          </p>
        </div>
        <button type="button" className="btn-ghost" onClick={() => void loadQuality(true)}>
          <RefreshCw className="size-4" /> Neu berechnen
        </button>
      </div>

      {q && (
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Feldabdeckung (horizontal scrollbar)">
          <table className="w-full min-w-[640px] text-left text-[12.5px]">
            <caption className="sr-only">Feldabdeckung des Sortenkatalogs nach Belegart</caption>
            <thead className="text-[11px] text-ink-500">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Feld</th>
                <th className="py-1.5 pr-3 font-medium">Abdeckung</th>
                <th className="py-1.5 pr-3 text-right font-medium">Vorhanden</th>
                <th className="py-1.5 pr-3 text-right font-medium">Fehlt</th>
                <th className="py-1.5 pr-3 text-right font-medium">Breeder</th>
                <th className="py-1.5 pr-3 text-right font-medium">Seedbank</th>
                <th className="py-1.5 pr-3 text-right font-medium">Datenbank</th>
                <th className="py-1.5 pr-3 text-right font-medium">Labor</th>
                <th className="py-1.5 pr-3 text-right font-medium">Wissenschaft</th>
                <th className="py-1.5 text-right font-medium">Widersprüchlich</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {q.fields.map((f) => (
                <tr key={f.field}>
                  <td className="py-1.5 pr-3 text-ink-200">
                    {f.label}
                    {f.nameOnly && <span className="ml-1 text-[10.5px] text-amber-300/90">nur Namensgleichheit</span>}
                  </td>
                  <td className="py-1.5 pr-3">
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 w-20 rounded-full bg-ink-700" aria-hidden>
                        <span className="block h-full rounded-full bg-leaf-400" style={{ width: `${f.total ? (f.present / f.total) * 100 : 0}%` }} />
                      </span>
                      <span className="tabular text-ink-300">{pct(f.present, f.total)}</span>
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular text-ink-200">{f.present.toLocaleString('de-DE')}</td>
                  <td className="py-1.5 pr-3 text-right tabular text-ink-400">{f.missing.toLocaleString('de-DE')}</td>
                  <td className="py-1.5 pr-3 text-right tabular text-ink-300">{f.evidence.breeder.toLocaleString('de-DE')}</td>
                  <td className="py-1.5 pr-3 text-right tabular text-ink-300">{f.evidence.seedbank.toLocaleString('de-DE')}</td>
                  <td className="py-1.5 pr-3 text-right tabular text-ink-300">{f.evidence.database.toLocaleString('de-DE')}</td>
                  <td className="py-1.5 pr-3 text-right tabular text-ink-300">{f.evidence.lab.toLocaleString('de-DE')}</td>
                  <td className="py-1.5 pr-3 text-right tabular text-ink-300">{(f.evidence.science ?? 0).toLocaleString('de-DE')}</td>
                  <td className="py-1.5 text-right tabular text-ink-400">{f.conflicting === null ? '–' : f.conflicting.toLocaleString('de-DE')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint mt-2">
            „Labor“ zählt nur Angaben mit Probe, Labor und Datum. Private Laborberichte der Nutzer fließen nie in den Katalog ein. Stand: {dt(q.generatedAt)}.
          </p>
          {q.samples && (
            <p className="hint mt-1">
              Öffentliche Laborproben ({q.samples.source}, Stand {q.samples.version.slice(0, 7)}): {q.samples.samples.toLocaleString('de-DE')} Proben, davon{' '}
              {q.samples.terpeneSamples.toLocaleString('de-DE')} mit Terpenen, {q.samples.names.toLocaleString('de-DE')} Produktnamen. Im Katalog gleichnamig:{' '}
              {q.samples.linkedNames.toLocaleString('de-DE')} Namen → {q.samples.linkedCultivars.toLocaleString('de-DE')} Sorten ({q.samples.linkedSamples.toLocaleString('de-DE')} Proben);{' '}
              {q.samples.ambiguousNames.toLocaleString('de-DE')} Namen tragen mehrere Breeder. Zuordnung nur über den Namen – keine Identitätsbestätigung.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          <h3 className="text-[13px] font-semibold text-ink-100">Anreicherung starten</h3>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await api('POST', '/api/admin/catalog/enrich', form);
                toast(form.dryRun ? 'Probelauf gestartet.' : 'Anreicherung gestartet.', { tone: 'ok' });
                void loadRuns();
              } catch (e2) {
                err(e2);
              } finally {
                setBusy(false);
              }
            }}
          >
            <div className="space-y-1.5">
              <label className="label" htmlFor="enr-p">
                Quelle
              </label>
              <select id="enr-p" className="input-base" value={form.provider} onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value }))}>
                {runs?.providers.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="label" htmlFor="enr-n">
                Sorten (max. {runs?.maxBatch ?? 25})
              </label>
              <input
                id="enr-n"
                type="number"
                min={1}
                max={runs?.maxBatch ?? 25}
                className="input-base w-24"
                value={form.limit}
                onChange={(e) => setForm((f) => ({ ...f, limit: Math.min(runs?.maxBatch ?? 25, Math.max(1, Number(e.target.value) || 1)) }))}
              />
            </div>
            <label className="flex items-center gap-2 pb-2 text-[12.5px] text-ink-300">
              <input type="checkbox" checked={form.dryRun} onChange={(e) => setForm((f) => ({ ...f, dryRun: e.target.checked }))} /> Probelauf (nichts speichern)
            </label>
            <button type="submit" className="btn-primary" disabled={busy || runs?.running}>
              {busy || runs?.running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} Starten
            </button>
          </form>
          {provider && <p className="hint">{provider.license} Zwischenspeicher läuft nach {provider.ttlDays} Tagen ab. Anfragen werden gedrosselt; es werden keine Nutzerdaten übertragen.</p>}
          <ul className="space-y-1 text-[12px]">
            {runs?.runs.slice(0, 8).map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2 text-ink-300">
                <span>
                  #{r.id} {r.provider}
                  {r.dry_run ? ' · Probelauf' : ''} · {RUN[r.status] ?? r.status}
                </span>
                <span className="tabular text-ink-500">
                  {r.processed}/{r.requested} geprüft · {r.matched} zugeordnet · {r.claims} Angaben{r.errors.length ? ` · ${r.errors.length} Fehler` : ''} · {dt(r.started_at)}
                </span>
              </li>
            ))}
            {runs && runs.runs.length === 0 && <li className="text-ink-500">Noch keine Läufe.</li>}
          </ul>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[13px] font-semibold text-ink-100">Prüfliste der Zuordnungen</h3>
            <div className="flex gap-1" role="group" aria-label="Status filtern">
              {Object.entries(STATUS).map(([k, v]) => (
                <button key={k} type="button" aria-pressed={status === k} className={`rounded-lg border px-2 py-0.5 text-[11.5px] ${status === k ? "border-leaf-500/40 bg-leaf-500/15 text-leaf-100" : "border-white/[0.08] text-ink-400"}`} onClick={() => setStatus(k)}>
                  {v}
                </button>
              ))}
            </div>
          </div>
          <p className="hint">Gleiche Namen werden nie automatisch zusammengeführt. Bestätigt werden kann nur eine Sorte aus den Kandidaten.</p>
          <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
            {matches?.items.map((m) => (
              <li key={`${m.provider}-${m.provider_id}`} className="rounded-lg border border-white/5 bg-ink-900/60 p-3 text-[12.5px]">
                <div className="flex flex-wrap justify-between gap-2">
                  <span className="font-medium text-ink-100">
                    {m.provider_name}
                    {m.provider_breeder && <span className="font-normal text-ink-400"> · {m.provider_breeder}</span>}
                  </span>
                  <span className="text-[11px] text-ink-500">
                    {m.provider} · {m.decided_by === 'admin' ? 'Admin' : 'automatisch'}
                  </span>
                </div>
                <p className="mt-1 text-[11.5px] text-ink-400">{m.reason}</p>
                {m.cultivar_name && (
                  <p className="mt-1 text-[11.5px] text-ink-300">
                    Zugeordnet: {m.cultivar_name} · {m.cultivar_breeder}
                  </p>
                )}
                {status !== 'rejected' && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {m.candidates.map((c) => (
                      <button key={c} type="button" className="btn-ghost h-7 px-2 text-[11.5px]" onClick={() => void decide(m, 'accept', c)} title="Diese Sorte bestätigen">
                        <Check className="size-3.5" /> {c}
                      </button>
                    ))}
                    <button type="button" className="btn-ghost h-7 px-2 text-[11.5px] text-rose-200" onClick={() => void decide(m, 'reject')}>
                      <X className="size-3.5" /> Ablehnen
                    </button>
                  </div>
                )}
              </li>
            ))}
            {matches && matches.items.length === 0 && <li className="text-[12.5px] text-ink-500">Keine Einträge.</li>}
          </ul>
          {matches && matches.total > matches.items.length && <p className="hint">{matches.total} insgesamt – die neuesten 30 werden angezeigt.</p>}
        </div>
      </div>
    </section>
  );
}
