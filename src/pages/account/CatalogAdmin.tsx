import { Check, Database, Loader2, Play, RefreshCw, X } from 'lucide-react';
import { fmtPercent } from '../../lib/format';
import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../../app/Toasts';
import { ApiError, api } from '../../lib/server/api';
import { intlLocale, labels, t } from '../../i18n';

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

const pct = (n: number, t: number) => (t ? fmtPercent(n / t, 1) : '–');
const dt = (s: string | null) => (s ? new Date(s).toLocaleString(intlLocale(), { dateStyle: 'short', timeStyle: 'short' }) : '–');
const STATUS: Record<string, string> = labels('admin.cat.status', ['probable', 'ambiguous', 'exact', 'rejected']);
const RUN: Record<string, string> = labels('admin.cat.run', ['running', 'done', 'failed', 'aborted']);

/** Katalogqualität, Anreicherungsläufe und Prüfliste – nur öffentliche Katalog-Metadaten. */
export function CatalogAdmin() {
  const toast = useToast();
  const [q, setQ] = useState<Quality | null>(null);
  const [runs, setRuns] = useState<Runs | null>(null);
  const [status, setStatus] = useState('probable');
  const [matches, setMatches] = useState<{ items: Match[]; total: number } | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ provider: 'strainapi', limit: 10, dryRun: true });
  const err = (e: unknown) => toast(e instanceof ApiError ? e.message : t('admin.cat.unexpected'), { tone: 'error' });

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
    const timer = setInterval(() => void loadRuns(), 3000);
    return () => clearInterval(timer);
  }, [runs?.running, loadRuns]);

  const decide = async (m: Match, action: 'accept' | 'reject', cultivarId?: string) => {
    try {
      await api('POST', `/api/admin/catalog/matches/${m.provider}/${encodeURIComponent(m.provider_id)}`, { action, ...(cultivarId ? { cultivarId } : {}) });
      toast(action === 'accept' ? t('admin.cat.accepted') : t('admin.cat.rejected'), { tone: 'ok' });
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
            <Database className="size-4" /> {t('admin.cat.title')}
          </h2>
          <p className="hint mt-0.5">
            {q ? t('admin.cat.counts', { c: q.cultivars, b: q.breeders, l: q.listings }) : t('admin.cat.computing')}
            {q?.dataset && t('admin.cat.dataset', { v: q.dataset.version, p: q.dataset.parser ?? '1' })}
          </p>
        </div>
        <button type="button" className="btn-ghost" onClick={() => void loadQuality(true)}>
          <RefreshCw className="size-4" /> {t('admin.cat.recompute')}
        </button>
      </div>

      {q && (
        <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t('admin.cat.coverageAria')}>
          <table className="w-full min-w-[640px] text-left text-[12.5px]">
            <caption className="sr-only">{t('admin.cat.coverageCaption')}</caption>
            <thead className="text-[11px] text-ink-500">
              <tr>
                <th className="py-1.5 pr-3 font-medium">{t('admin.cat.field')}</th>
                <th className="py-1.5 pr-3 font-medium">{t('admin.cat.coverage')}</th>
                <th className="py-1.5 pr-3 text-right font-medium">{t('admin.cat.present')}</th>
                <th className="py-1.5 pr-3 text-right font-medium">{t('admin.cat.missing')}</th>
                <th className="py-1.5 pr-3 text-right font-medium">{t('admin.cat.breeder')}</th>
                <th className="py-1.5 pr-3 text-right font-medium">{t('admin.cat.seedbank')}</th>
                <th className="py-1.5 pr-3 text-right font-medium">{t('admin.cat.database')}</th>
                <th className="py-1.5 pr-3 text-right font-medium">{t('admin.cat.lab')}</th>
                <th className="py-1.5 pr-3 text-right font-medium">{t('admin.cat.science')}</th>
                <th className="py-1.5 text-right font-medium">{t('admin.cat.conflict')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {q.fields.map((f) => (
                <tr key={f.field}>
                  <td className="py-1.5 pr-3 text-ink-200">
                    {f.label}
                    {f.nameOnly && <span className="ml-1 text-[10.5px] text-amber-300/90">{t('admin.cat.nameOnly')}</span>}
                  </td>
                  <td className="py-1.5 pr-3">
                    <span className="flex items-center gap-2">
                      <span className="h-1.5 w-20 rounded-full bg-ink-700" aria-hidden>
                        <span className="block h-full rounded-full bg-leaf-400" style={{ width: `${f.total ? (f.present / f.total) * 100 : 0}%` }} />
                      </span>
                      <span className="tabular text-ink-300">{pct(f.present, f.total)}</span>
                    </span>
                  </td>
                  <td className="py-1.5 pr-3 text-right tabular text-ink-200">{f.present.toLocaleString(intlLocale())}</td>
                  <td className="py-1.5 pr-3 text-right tabular text-ink-400">{f.missing.toLocaleString(intlLocale())}</td>
                  <td className="py-1.5 pr-3 text-right tabular text-ink-300">{f.evidence.breeder.toLocaleString(intlLocale())}</td>
                  <td className="py-1.5 pr-3 text-right tabular text-ink-300">{f.evidence.seedbank.toLocaleString(intlLocale())}</td>
                  <td className="py-1.5 pr-3 text-right tabular text-ink-300">{f.evidence.database.toLocaleString(intlLocale())}</td>
                  <td className="py-1.5 pr-3 text-right tabular text-ink-300">{f.evidence.lab.toLocaleString(intlLocale())}</td>
                  <td className="py-1.5 pr-3 text-right tabular text-ink-300">{(f.evidence.science ?? 0).toLocaleString(intlLocale())}</td>
                  <td className="py-1.5 text-right tabular text-ink-400">{f.conflicting === null ? '–' : f.conflicting.toLocaleString(intlLocale())}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="hint mt-2">
            „Labor“ zählt nur Angaben mit Probe, Labor und Datum. Private Laborberichte der Nutzer fließen nie in den Katalog ein. Stand: {dt(q.generatedAt)}.
          </p>
          {q.samples && (
            <p className="hint mt-1">
              Öffentliche Laborproben ({q.samples.source}, Stand {q.samples.version.slice(0, 7)}): {q.samples.samples.toLocaleString(intlLocale())} Proben, davon{' '}
              {q.samples.terpeneSamples.toLocaleString(intlLocale())} mit Terpenen, {q.samples.names.toLocaleString(intlLocale())} Produktnamen. Im Katalog gleichnamig:{' '}
              {q.samples.linkedNames.toLocaleString(intlLocale())} Namen → {q.samples.linkedCultivars.toLocaleString(intlLocale())} Sorten ({q.samples.linkedSamples.toLocaleString(intlLocale())} Proben);{' '}
              {q.samples.ambiguousNames.toLocaleString(intlLocale())} Namen tragen mehrere Breeder. Zuordnung nur über den Namen – keine Identitätsbestätigung.
            </p>
          )}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-2">
        <div className="space-y-3">
          <h3 className="text-[13px] font-semibold text-ink-100">{t('admin.cat.enrich')}</h3>
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await api('POST', '/api/admin/catalog/enrich', form);
                toast(form.dryRun ? t('admin.cat.dryStarted') : t('admin.cat.started'), { tone: 'ok' });
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
                {t('admin.cat.source')}
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
                {t('admin.cat.batch', { n: runs?.maxBatch ?? 25 })}
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
              <input type="checkbox" checked={form.dryRun} onChange={(e) => setForm((f) => ({ ...f, dryRun: e.target.checked }))} /> {t('admin.cat.dryRun')}
            </label>
            <button type="submit" className="btn-primary" disabled={busy || runs?.running}>
              {busy || runs?.running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />} {t('admin.cat.start')}
            </button>
          </form>
          {provider && <p className="hint">{provider.license} Zwischenspeicher läuft nach {provider.ttlDays} Tagen ab. Anfragen werden gedrosselt; es werden keine Nutzerdaten übertragen.</p>}
          <ul className="space-y-1 text-[12px]">
            {runs?.runs.slice(0, 8).map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2 text-ink-300">
                <span>
                  #{r.id} {r.provider}
                  {r.dry_run ? t('admin.cat.dryRunSuffix') : ''} · {RUN[r.status] ?? r.status}
                </span>
                <span className="tabular text-ink-500">
                  {t('admin.cat.runStats', { p: r.processed, r: r.requested, m: r.matched, c: r.claims })}{r.errors.length ? t('admin.cat.errors', { n: r.errors.length }) : ''} · {dt(r.started_at)}
                </span>
              </li>
            ))}
            {runs && runs.runs.length === 0 && <li className="text-ink-500">{t('admin.cat.noRuns')}</li>}
          </ul>
        </div>

        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="text-[13px] font-semibold text-ink-100">{t('admin.cat.review')}</h3>
            <div className="flex gap-1" role="group" aria-label={t('admin.cat.filter')}>
              {Object.entries(STATUS).map(([k, v]) => (
                <button key={k} type="button" aria-pressed={status === k} className={`rounded-lg border px-2 py-0.5 text-[11.5px] ${status === k ? "border-leaf-500/40 bg-leaf-500/15 text-leaf-100" : "border-white/[0.08] text-ink-400"}`} onClick={() => setStatus(k)}>
                  {v}
                </button>
              ))}
            </div>
          </div>
          <p className="hint">{t('admin.cat.never')}</p>
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
                      <button key={c} type="button" className="btn-ghost h-7 px-2 text-[11.5px]" onClick={() => void decide(m, 'accept', c)} title={t('admin.cat.confirmThis')}>
                        <Check className="size-3.5" /> {c}
                      </button>
                    ))}
                    <button type="button" className="btn-ghost h-7 px-2 text-[11.5px] text-rose-200" onClick={() => void decide(m, 'reject')}>
                      <X className="size-3.5" /> {t('admin.cat.decline')}
                    </button>
                  </div>
                )}
              </li>
            ))}
            {matches && matches.items.length === 0 && <li className="text-[12.5px] text-ink-500">{t('admin.cat.none')}</li>}
          </ul>
          {matches && matches.total > matches.items.length && <p className="hint">{matches.total} insgesamt – die neuesten 30 werden angezeigt.</p>}
        </div>
      </div>
    </section>
  );
}
