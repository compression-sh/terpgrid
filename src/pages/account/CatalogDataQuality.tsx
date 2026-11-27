import { AlertOctagon, AlertTriangle, Info, Library, Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { api } from '../../lib/server/api';
import { t, intlLocale } from '../../i18n';

type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
interface Finding {
  id: string;
  severity: Severity;
  title: string;
  count: number;
  examples: { id?: string; label: string }[];
  action: string;
}
interface Validation {
  generatedAt: string;
  findings: Finding[];
  summary: Record<Severity, number>;
}
interface Source {
  id: string;
  name: string;
  url: string;
  license: string;
  fields: string[];
  permission: string;
  permissionLabel: string;
  decision: string;
  retentionDays?: number;
  lastSuccess: string | null;
  lastAttempt: string | null;
  status: string | null;
}

const SEV: Record<Severity, { label: string; cls: string; icon: typeof Info }> = {
  critical: { get label() { return t('account.dq.sev.critical'); }, cls: 'border-rose-400/40 bg-rose-500/10 text-rose-200', icon: AlertOctagon },
  high: { get label() { return t('account.dq.sev.high'); }, cls: 'border-orange-400/35 bg-orange-500/10 text-orange-200', icon: AlertTriangle },
  medium: { get label() { return t('account.dq.sev.medium'); }, cls: 'border-amber-400/30 bg-amber-400/10 text-amber-200', icon: AlertTriangle },
  low: { get label() { return t('account.dq.sev.low'); }, cls: 'border-sky-400/25 bg-sky-400/10 text-sky-200', icon: Info },
  info: { label: 'Info', cls: 'border-white/10 bg-white/[0.03] text-ink-300', icon: Info },
};
const PERM_CLS: Record<string, string> = {
  approved: 'text-leaf-300',
  'approved-attribution': 'text-leaf-300',
  restricted: 'text-sky-300',
  reference: 'text-ink-300',
  'permission-required': 'text-amber-300',
  'license-unclear': 'text-amber-300',
  inaccessible: 'text-ink-400',
  unsuitable: 'text-rose-300',
};
const dt = (s: string | null) => (s ? new Date(s).toLocaleString(intlLocale(), { dateStyle: 'short', timeStyle: 'short' }) : '–');

/** Datenqualitätsprüfung und Quellenregister des Sortenkatalogs (nur Admins, nur lesend). */
export function CatalogDataQuality() {
  const [v, setV] = useState<Validation | null>(null);
  const [sources, setSources] = useState<Source[] | null>(null);
  const [loading, setLoading] = useState(false);
  const load = useCallback(async (refresh = false) => {
    setLoading(true);
    try {
      const [a, b] = await Promise.all([api<Validation>('GET', `/api/admin/catalog/validation${refresh ? '?refresh=1' : ''}`), api<{ sources: Source[] }>('GET', '/api/admin/catalog/sources')]);
      setV(a);
      setSources(b.sources);
    } catch {
      setV(null);
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => void load(), [load]);

  return (
    <div className="space-y-5">
      <section className="card space-y-4 p-5" aria-labelledby="dq-h">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 id="dq-h" className="flex items-center gap-2 text-[15px] font-semibold text-ink-50">
              <ShieldCheck className="size-4" /> {t('account.dq.title')}
            </h2>
            <p className="hint mt-0.5">{t('account.dq.hint')} {v && t('account.dq.asOf', { date: dt(v.generatedAt) })}</p>
          </div>
          <button type="button" className="btn-ghost" onClick={() => void load(true)} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />} {t('account.dq.recheck')}
          </button>
        </div>
        {v && (
          <>
            <ul className="flex flex-wrap gap-1.5" aria-label={t('account.dq.bySeverity')}>
              {(Object.keys(SEV) as Severity[]).map((s) => (
                <li key={s} className={`rounded-full border px-2 py-0.5 text-[11.5px] ${SEV[s].cls}`}>
                  {SEV[s].label}: {v.summary[s]}
                </li>
              ))}
            </ul>
            <ul className="divide-y divide-white/5">
              {v.findings.map((f) => {
                const S = SEV[f.severity];
                return (
                  <li key={f.id} className="py-2.5">
                    <div className="flex items-start gap-2.5">
                      <span className={`mt-0.5 inline-flex shrink-0 items-center gap-1 rounded-full border px-1.5 py-px text-[10.5px] ${S.cls}`}>
                        <S.icon className="size-3" aria-hidden /> {S.label}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-[13px] text-ink-100">
                          <span className={`mr-1.5 font-mono tabular ${f.count ? 'text-ink-50' : 'text-ink-500'}`}>{f.count.toLocaleString(intlLocale())}</span>
                          {f.title}
                        </p>
                        {f.count > 0 && f.examples.length > 0 && (
                          <details className="mt-1 text-[11.5px] text-ink-400">
                            <summary className="inline-flex min-h-6 cursor-pointer items-center hover:text-ink-200">{t('account.dq.examples')}</summary>
                            <ul className="mt-1 flex flex-wrap gap-1">
                              {f.examples.map((e, i) => (
                                <li key={i}>
                                  {e.id ? (
                                    <a href={`#/discover/cultivar/${encodeURIComponent(e.id)}`} className="inline-flex min-h-6 items-center rounded border border-white/[0.07] px-1.5 py-0.5 hover:border-white/20">
                                      {e.label}
                                    </a>
                                  ) : (
                                    <span className="rounded border border-white/[0.07] px-1.5 py-0.5">{e.label}</span>
                                  )}
                                </li>
                              ))}
                            </ul>
                            <p className="mt-1.5 text-ink-300">{f.action}</p>
                          </details>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </section>

      <section className="card space-y-3 p-5" aria-labelledby="src-h">
        <div>
          <h2 id="src-h" className="flex items-center gap-2 text-[15px] font-semibold text-ink-50">
            <Library className="size-4" /> {t('account.dq.sources')}
          </h2>
          <p className="hint mt-0.5">{t('account.dq.sourcesHint')}</p>
        </div>
        {sources && (
          <div className="overflow-x-auto" tabIndex={0} role="region" aria-label={t('account.dq.sourcesAria')}>
            <table className="w-full min-w-[760px] text-left text-[12px]">
              <caption className="sr-only">{t('account.dq.caption')}</caption>
              <thead className="text-[11px] text-ink-500">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">{t('account.dq.source')}</th>
                  <th className="py-1.5 pr-3 font-medium">{t('account.dq.class')}</th>
                  <th className="py-1.5 pr-3 font-medium">{t('account.dq.licence')}</th>
                  <th className="py-1.5 pr-3 font-medium">{t('account.dq.lastSuccess')}</th>
                  <th className="py-1.5 font-medium">{t('account.dq.decision')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 align-top">
                {sources.map((s) => (
                  <tr key={s.id}>
                    <td className="py-2 pr-3">
                      <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-ink-100 hover:underline">
                        {s.name}
                      </a>
                      <div className="mt-0.5 text-[10.5px] text-ink-500">{s.fields.join(' · ')}</div>
                    </td>
                    <td className={`py-2 pr-3 whitespace-nowrap ${PERM_CLS[s.permission] ?? 'text-ink-300'}`}>{s.permissionLabel}</td>
                    <td className="py-2 pr-3 text-ink-300">
                      {s.license}
                      {s.retentionDays ? <div className="text-[10.5px] text-ink-500">Zwischenspeicher {s.retentionDays} Tage</div> : null}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap tabular text-ink-300">{dt(s.lastSuccess)}</td>
                    <td className="py-2 text-ink-400">{s.decision}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
