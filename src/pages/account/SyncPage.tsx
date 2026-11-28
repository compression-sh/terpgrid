import { AlertTriangle, CheckCircle2, CloudOff, Loader2, RefreshCw, Server, Smartphone } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useAuth } from '../../app/auth';
import { useData } from '../../app/DataProvider';
import { Callout } from '../../components/ui/Callout';
import { PageHeader } from '../../components/ui/PageHeader';
import { type SyncConflict, getAll, subscribe } from '../../lib/db/database';
import { fmtDateTime } from '../../lib/dates';
import { SYNC_STORE_LABEL, recordTitle } from '../../lib/sync/labels';
import { t } from '../../i18n';

function useConflicts() {
  const [list, setList] = useState<SyncConflict[]>([]);
  useEffect(() => {
    const load = () => getAll('syncConflicts').then((l) => setList(l.sort((a, b) => b.detectedAt - a.detectedAt)));
    void load();
    return subscribe((s) => {
      if (s.has('syncConflicts')) void load();
    });
  }, []);
  return list;
}

/** Unterschiede zwischen zwei Datensätzen (nur geänderte Felder, ohne interne Zeitstempel). */
function diff(a: unknown, b: unknown): { key: string; mine: string; theirs: string }[] {
  const x = (a ?? {}) as Record<string, unknown>;
  const y = (b ?? {}) as Record<string, unknown>;
  const keys = [...new Set([...Object.keys(x), ...Object.keys(y)])].filter((k) => !['id', 'createdAt', 'updatedAt'].includes(k));
  const show = (v: unknown) => (v === undefined ? '–' : typeof v === 'string' ? v : JSON.stringify(v)).slice(0, 140);
  return keys.filter((k) => JSON.stringify(x[k]) !== JSON.stringify(y[k])).map((k) => ({ key: k, mine: show(x[k]), theirs: show(y[k]) }));
}

export function SyncPage() {
  const { sync, engine, state } = useAuth();
  const conflicts = useConflicts();
  const { data } = useData();
  const [busy, setBusy] = useState<string | null>(null);
  const offline = state.kind === 'authenticated' && state.offline;

  const statusLine = () => {
    if (offline) return { icon: <CloudOff className="size-5 text-amber-300" />, text: t('account.sy.offline'), sub: t('account.sy.offlineSub') };
    if (sync.phase === 'syncing') return { icon: <Loader2 className="size-5 animate-spin text-leaf-300" />, text: t('account.sy.syncing'), sub: t('account.sy.syncingSub') };
    if (sync.phase === 'offline') return { icon: <CloudOff className="size-5 text-amber-300" />, text: t('account.sy.unreachable'), sub: sync.message };
    if (sync.phase === 'error') return { icon: <AlertTriangle className="size-5 text-rose-300" />, text: t('account.sy.failed'), sub: sync.message };
    if (sync.pending > 0) return { icon: <RefreshCw className="size-5 text-amber-300" />, text: t('account.sy.pending', { count: sync.pending }), sub: t('account.sy.notConfirmed') };
    return { icon: <CheckCircle2 className="size-5 text-leaf-300" />, text: t('account.sy.allSynced'), sub: sync.lastSyncAt ? t('account.sy.lastConfirmed', { date: fmtDateTime(new Date(sync.lastSyncAt).toISOString()) }) : undefined };
  };
  const st = statusLine();

  return (
    <div className="space-y-6">
      <PageHeader title={t('account.sy.title')} subtitle={t('account.sy.subtitle')} crumbs={[{ label: t('account.sy.account'), to: 'account' }, { label: t('account.sy.title') }]} />
      <div className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          {st.icon}
          <div>
            <div className="font-medium text-ink-50">{st.text}</div>
            {st.sub && <div className="mt-0.5 text-[13px] text-ink-400">{st.sub}</div>}
          </div>
        </div>
        <button type="button" className="btn-ghost" disabled={!engine || sync.phase === 'syncing' || offline} onClick={() => engine?.schedule(0)}>
          <RefreshCw className="size-4" /> {t('account.sy.now')}
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <div className="card p-4">
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-500">{t('account.sy.pendingL')}</div>
          <div className="mt-1 text-2xl font-semibold tabular text-ink-50">{sync.pending}</div>
        </div>
        <div className="card p-4">
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-500">{t('account.sy.conflicts')}</div>
          <div className={`mt-1 text-2xl font-semibold tabular ${sync.conflicts ? 'text-amber-200' : 'text-ink-50'}`}>{sync.conflicts}</div>
        </div>
        <div className="card p-4">
          <div className="text-[11px] uppercase tracking-[0.14em] text-ink-500">{t('account.sy.localRecords')}</div>
          <div className="mt-1 text-2xl font-semibold tabular text-ink-50">{Object.values(data).reduce((n, l) => n + l.length, 0)}</div>
        </div>
      </div>

      {conflicts.length > 0 ? (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-ink-100">{t('account.sy.resolve')}</h2>
          <p className="text-[13px] text-ink-400">
            {t('account.sy.conflictText')}
          </p>
          {conflicts.map((c) => {
            const d = c.kind === 'conflict' ? diff(c.local, c.server?.data) : [];
            return (
              <div key={c.key} className="card space-y-3 p-4">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="min-w-0">
                    <span className="mr-2 rounded bg-white/[0.05] px-1.5 py-0.5 text-[11px] text-ink-300">{SYNC_STORE_LABEL[c.store] ?? c.store}</span>
                    <span className="font-medium text-ink-50">{recordTitle(c.local ?? c.server?.data)}</span>
                  </div>
                  <span className="text-[11px] text-ink-500">{fmtDateTime(new Date(c.detectedAt).toISOString())}</span>
                </div>
                {c.kind === 'rejected' ? (
                  <Callout tone="warn">{t('account.sy.rejected')} {c.error}. Die Daten bleiben auf diesem Gerät erhalten.</Callout>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-[12.5px]">
                      <thead className="text-[11px] text-ink-500">
                        <tr>
                          <th className="py-1 pr-3 font-medium">{t('account.sy.field')}</th>
                          <th className="py-1 pr-3 font-medium">
                            <Smartphone className="mr-1 inline size-3" /> {t('account.sy.thisDevice')}
                          </th>
                          <th className="py-1 font-medium">
                            <Server className="mr-1 inline size-3" /> {t('account.sy.server')}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {c.local === null && <tr><td colSpan={3} className="py-1 text-ink-400">{t('account.sy.deletedHere')}</td></tr>}
                        {c.server?.deleted && <tr><td colSpan={3} className="py-1 text-ink-400">{t('account.sy.deletedServer')}</td></tr>}
                        {d.map((r) => (
                          <tr key={r.key} className={`border-t border-white/[0.04] align-top ${c.fields?.some((f) => f === r.key || f.startsWith(`${r.key}.`)) ? 'bg-amber-400/[0.06]' : ''}`}>
                            <td className="py-1.5 pr-3 font-mono text-[11.5px] text-ink-400">{r.key}</td>
                            <td className="py-1.5 pr-3 break-words text-ink-100">{r.mine}</td>
                            <td className="py-1.5 break-words text-ink-100">{r.theirs}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
                <div className="flex flex-wrap gap-2">
                  {c.kind === 'conflict' ? (
                    <>
                      <button
                        type="button"
                        className="btn-primary"
                        disabled={busy === c.key}
                        onClick={async () => {
                          setBusy(c.key);
                          await engine?.keepMine(c.key);
                          setBusy(null);
                        }}
                      >
                        {t('account.sy.keepMine')}
                      </button>
                      <button
                        type="button"
                        className="btn-ghost"
                        disabled={busy === c.key}
                        onClick={async () => {
                          setBusy(c.key);
                          await engine?.takeServer(c.key);
                          setBusy(null);
                        }}
                      >
                        {t('account.sy.takeServer')}
                      </button>
                    </>
                  ) : (
                    <button type="button" className="btn-ghost" onClick={() => engine?.dismiss(c.key)}>
                      {t('account.sy.closeHint')}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </section>
      ) : (
        <p className="text-[13px] text-ink-500">{t('account.sy.noConflicts')}</p>
      )}

      <Callout tone="info" title={t('account.sy.how')}>
        {t('account.sy.howText')}
      </Callout>
    </div>
  );
}
