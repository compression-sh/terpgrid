import { Activity, AlertTriangle, Ban, CheckCircle2, Copy, Database, HardDrive, Link2, Loader2, Plus, RotateCcw, ShieldCheck, Users } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../app/auth';
import { useConfirm } from '../../app/Confirm';
import { useReauth } from '../../app/reauth';
import { useToast } from '../../app/Toasts';
import { Callout } from '../../components/ui/Callout';
import { EmptyState } from '../../components/ui/EmptyState';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { formatBytes } from '../../lib/media/images';
import { ApiError, api } from '../../lib/server/api';

interface OverviewData {
  version: string;
  startedAt: string;
  inviteOnly: boolean;
  users: { total: number; active: number; suspended: number; storage: number };
  openInvites: number;
  activeSessions: number;
  errors: { count: number; last?: string };
  securityEvents7d: Record<string, number>;
  recentSecurityEvents: { type: string; created_at: string; ip_tag: string | null }[];
  disk: { freeBytes: number; totalBytes: number } | null;
  backup: { ok: boolean; lastSuccess: string | null; lastCheck: string | null } | null;
}
interface AdminUser {
  id: string;
  login_name: string;
  login_kind: string;
  display_name: string | null;
  role: string;
  status: 'active' | 'suspended';
  totp_enabled: boolean;
  storage_bytes: number;
  created_at: string;
  last_login_at: string | null;
}
interface Invite {
  id: string;
  note: string | null;
  created_at: string;
  expires_at: string;
  used_at: string | null;
  revoked_at: string | null;
  used_by: string | null;
}

const dt = (s: string | null | undefined) => (s ? new Date(s).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' }) : '–');
const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Unerwarteter Fehler.');
const EVENT: Record<string, string> = {
  'login.failure': 'Fehlgeschlagene Anmeldungen',
  'login.throttled': 'Gebremste Anmeldeversuche',
  'recovery.failure': 'Fehlgeschlagene Wiederherstellungen',
  'recovery.success': 'Wiederherstellungen',
  'admin.user.status': 'Kontostatus geändert',
  'invite.create': 'Einladungen erstellt',
  'invite.revoke': 'Einladungen widerrufen',
  'account.delete': 'Konten gelöscht',
};

function Stat({ icon, label, value, sub, tone = 'default' }: { icon: ReactNode; label: string; value: ReactNode; sub?: ReactNode; tone?: 'default' | 'warn' | 'ok' }) {
  return (
    <div className="card p-4">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-ink-500">
        {icon} {label}
      </div>
      <div className={`mt-1.5 text-xl font-semibold tabular ${tone === 'warn' ? 'text-amber-200' : tone === 'ok' ? 'text-leaf-200' : 'text-ink-50'}`}>{value}</div>
      {sub && <div className="mt-0.5 text-[11.5px] text-ink-500">{sub}</div>}
    </div>
  );
}

export function AdminPage() {
  const auth = useAuth();
  const reauth = useReauth();
  const toast = useToast();
  const confirm = useConfirm();
  const isAdmin = auth.state.kind === 'authenticated' && auth.state.user.role === 'admin';
  const [ov, setOv] = useState<OverviewData | null>(null);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [error, setError] = useState<string>();
  const [newInvite, setNewInvite] = useState<{ url: string; expiresInDays: number } | null>(null);
  const [inviteForm, setInviteForm] = useState({ days: 7, note: '' });
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const [o, u, i] = await Promise.all([
        api<OverviewData>('GET', '/api/admin/overview'),
        api<{ users: AdminUser[] }>('GET', '/api/admin/users'),
        api<{ invites: Invite[] }>('GET', '/api/admin/invites'),
      ]);
      setOv(o);
      setUsers(u.users);
      setInvites(i.invites);
      setError(undefined);
    } catch (e) {
      setError(errText(e));
    }
  }, []);
  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin, load]);

  if (!isAdmin) return <EmptyState icon={<ShieldCheck />} title="Keine Berechtigung" text="Dieser Bereich ist der Administration vorbehalten." />;

  const backupAge = ov?.backup?.lastSuccess ? (Date.now() - new Date(ov.backup.lastSuccess).getTime()) / 3_600_000 : null;
  const backupTone = !ov?.backup ? 'warn' : ov.backup.ok && backupAge !== null && backupAge < 36 ? 'ok' : 'warn';

  return (
    <div className="space-y-6">
      <PageHeader title="Administration" subtitle="Konten, Einladungen und Systemzustand – ohne Zugriff auf private Inhalte." crumbs={[{ label: 'Konto', to: 'account' }, { label: 'Administration' }]} />
      <Callout tone="info">
        Bewusst eingeschränkt: Administratoren sehen keine Growlogs, Fotos, Journaleinträge oder sonstigen Inhalte anderer Personen. Es gibt keine Funktion zum Einsehen, Exportieren oder
        Zurücksetzen fremder Konten.
      </Callout>
      {error && <Callout tone="danger">{error}</Callout>}

      {ov && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat icon={<Users className="size-3.5" />} label="Konten" value={ov.users.total} sub={`${ov.users.active} aktiv · ${ov.users.suspended} gesperrt`} />
          <Stat icon={<Link2 className="size-3.5" />} label="Offene Einladungen" value={ov.openInvites} sub={ov.inviteOnly ? 'Registrierung nur mit Einladung' : 'Öffentliche Registrierung aktiv'} tone={ov.inviteOnly ? 'default' : 'warn'} />
          <Stat icon={<HardDrive className="size-3.5" />} label="Speicher (Dateien)" value={formatBytes(ov.users.storage)} sub={ov.disk ? `${formatBytes(ov.disk.freeBytes)} frei von ${formatBytes(ov.disk.totalBytes)}` : 'Datenträger unbekannt'} />
          <Stat
            icon={<Database className="size-3.5" />}
            label="Backup"
            value={ov.backup ? (ov.backup.ok ? 'OK' : 'Fehler') : 'nicht konfiguriert'}
            sub={ov.backup?.lastSuccess ? `Letzter Erfolg ${dt(ov.backup.lastSuccess)}` : 'Kein erfolgreiches Backup bekannt'}
            tone={backupTone}
          />
          <Stat icon={<Activity className="size-3.5" />} label="System" value={<span className="flex items-center gap-1.5"><CheckCircle2 className="size-4 text-leaf-400" /> Läuft</span>} sub={`Version ${ov.version} · seit ${dt(ov.startedAt)}`} />
          <Stat icon={<Users className="size-3.5" />} label="Aktive Sitzungen" value={ov.activeSessions} />
          <Stat icon={<AlertTriangle className="size-3.5" />} label="Serverfehler" value={ov.errors.count} sub={ov.errors.last ? `zuletzt ${dt(ov.errors.last)}` : 'seit Start keine'} tone={ov.errors.count ? 'warn' : 'default'} />
          <Stat
            icon={<ShieldCheck className="size-3.5" />}
            label="Sicherheit (7 Tage)"
            value={(ov.securityEvents7d['login.failure'] ?? 0) + (ov.securityEvents7d['login.throttled'] ?? 0)}
            sub="fehlgeschlagene/gebremste Anmeldungen"
            tone={(ov.securityEvents7d['login.throttled'] ?? 0) > 0 ? 'warn' : 'default'}
          />
        </div>
      )}

      <section className="card p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[15px] font-semibold text-ink-50">Einladungen</h2>
        </div>
        <form
          className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end"
          onSubmit={async (e) => {
            e.preventDefault();
            setCreating(true);
            try {
              const r = await reauth(() => api<{ url: string; expiresInDays: number }>('POST', '/api/admin/invites', { days: inviteForm.days, ...(inviteForm.note.trim() ? { note: inviteForm.note.trim() } : {}) }));
              if (r) {
                setNewInvite(r);
                setInviteForm({ days: 7, note: '' });
                void load();
              }
            } catch (err) {
              toast(errText(err), { tone: 'error' });
            } finally {
              setCreating(false);
            }
          }}
        >
          <div className="flex-1 space-y-1.5">
            <label className="label" htmlFor="inv-note">
              Notiz (nur für dich, optional)
            </label>
            <input id="inv-note" className="input-base" maxLength={120} value={inviteForm.note} placeholder="z. B. „für Alex“" onChange={(e) => setInviteForm((f) => ({ ...f, note: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <label className="label" htmlFor="inv-days">
              Gültig (Tage)
            </label>
            <input id="inv-days" type="number" min={1} max={30} className="input-base w-28" value={inviteForm.days} onChange={(e) => setInviteForm((f) => ({ ...f, days: Math.min(30, Math.max(1, Number(e.target.value) || 7)) }))} />
          </div>
          <button type="submit" className="btn-primary" disabled={creating}>
            {creating ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />} Einladung erstellen
          </button>
        </form>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12.5px]">
            <thead className="text-[11px] text-ink-500">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Notiz</th>
                <th className="py-1.5 pr-3 font-medium">Erstellt</th>
                <th className="py-1.5 pr-3 font-medium">Status</th>
                <th className="py-1.5" />
              </tr>
            </thead>
            <tbody>
              {invites.map((i) => {
                const expired = new Date(i.expires_at).getTime() < Date.now();
                const status = i.used_at ? `verwendet von ${i.used_by ?? 'gelöschtem Konto'}` : i.revoked_at ? 'widerrufen' : expired ? 'abgelaufen' : `offen bis ${dt(i.expires_at)}`;
                const open = !i.used_at && !i.revoked_at && !expired;
                return (
                  <tr key={i.id} className="border-t border-white/[0.04]">
                    <td className="py-2 pr-3 text-ink-200">{i.note ?? '–'}</td>
                    <td className="py-2 pr-3 text-ink-400">{dt(i.created_at)}</td>
                    <td className={`py-2 pr-3 ${open ? 'text-leaf-200' : 'text-ink-500'}`}>{status}</td>
                    <td className="py-2 text-right">
                      {open && (
                        <button
                          type="button"
                          className="btn-ghost px-2 py-1 text-xs"
                          onClick={async () => {
                            try {
                              await reauth(() => api('DELETE', `/api/admin/invites/${i.id}`));
                              void load();
                            } catch (e) {
                              toast(errText(e), { tone: 'error' });
                            }
                          }}
                        >
                          Widerrufen
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {invites.length === 0 && (
                <tr>
                  <td colSpan={4} className="py-3 text-ink-500">
                    Noch keine Einladungen.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-3 text-[15px] font-semibold text-ink-50">Konten</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[12.5px]">
            <thead className="text-[11px] text-ink-500">
              <tr>
                <th className="py-1.5 pr-3 font-medium">Kennung</th>
                <th className="py-1.5 pr-3 font-medium">Rolle</th>
                <th className="py-1.5 pr-3 font-medium">2FA</th>
                <th className="py-1.5 pr-3 font-medium">Speicher</th>
                <th className="py-1.5 pr-3 font-medium">Letzte Anmeldung</th>
                <th className="py-1.5" />
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const self = auth.state.kind === 'authenticated' && auth.state.user.loginName === u.login_name;
                return (
                  <tr key={u.id} className="border-t border-white/[0.04]">
                    <td className="py-2 pr-3">
                      <div className="font-mono text-ink-100">{u.login_name}</div>
                      {u.display_name && <div className="text-[11px] text-ink-500">{u.display_name}</div>}
                    </td>
                    <td className="py-2 pr-3 text-ink-300">{u.role === 'admin' ? 'Admin' : 'Mitglied'}</td>
                    <td className="py-2 pr-3">{u.totp_enabled ? <span className="text-leaf-300">an</span> : <span className="text-ink-500">aus</span>}</td>
                    <td className="py-2 pr-3 tabular text-ink-300">{formatBytes(u.storage_bytes)}</td>
                    <td className="py-2 pr-3 text-ink-400">{dt(u.last_login_at)}</td>
                    <td className="py-2 text-right">
                      {!self && (
                        <button
                          type="button"
                          className={`btn-ghost px-2 py-1 text-xs ${u.status === 'active' ? 'text-rose-200' : 'text-leaf-200'}`}
                          onClick={async () => {
                            const suspend = u.status === 'active';
                            const ok = await confirm({
                              title: suspend ? `${u.login_name} sperren?` : `${u.login_name} entsperren?`,
                              message: suspend ? 'Alle Sitzungen werden sofort beendet; eine Anmeldung ist bis zur Entsperrung nicht möglich. Daten bleiben erhalten.' : 'Das Konto kann sich wieder anmelden.',
                              confirmLabel: suspend ? 'Sperren' : 'Entsperren',
                              tone: suspend ? 'danger' : 'default',
                            });
                            if (!ok) return;
                            try {
                              await reauth(() => api('POST', `/api/admin/users/${u.id}/status`, { status: suspend ? 'suspended' : 'active' }));
                              void load();
                            } catch (e) {
                              toast(errText(e), { tone: 'error' });
                            }
                          }}
                        >
                          {u.status === 'active' ? (
                            <>
                              <Ban className="size-3.5" /> Sperren
                            </>
                          ) : (
                            <>
                              <RotateCcw className="size-3.5" /> Entsperren
                            </>
                          )}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {ov && ov.recentSecurityEvents.length > 0 && (
        <section className="card p-5">
          <h2 className="mb-3 text-[15px] font-semibold text-ink-50">Sicherheitsereignisse</h2>
          <ul className="space-y-1 text-[12.5px]">
            {ov.recentSecurityEvents.map((e, i) => (
              <li key={`${e.created_at}-${i}`} className="flex justify-between gap-3 text-ink-300">
                <span>{EVENT[e.type] ?? e.type}</span>
                <span className="tabular text-ink-500">
                  {dt(e.created_at)}
                  {e.ip_tag && <span className="ml-2 font-mono text-[11px]">#{e.ip_tag.slice(0, 6)}</span>}
                </span>
              </li>
            ))}
          </ul>
          <p className="hint mt-2">IP-Adressen werden nur als gekürzter, nicht umkehrbarer Hash gespeichert.</p>
        </section>
      )}

      <Modal open={!!newInvite} onClose={() => setNewInvite(null)} title="Einladungslink" subtitle={`Einmalig nutzbar, ${newInvite?.expiresInDays ?? 7} Tage gültig. Wird nur jetzt angezeigt.`}>
        {newInvite && (
          <div className="space-y-3">
            <code className="block break-all select-all rounded-lg bg-ink-950 p-3 font-mono text-[12.5px] text-leaf-200">{newInvite.url}</code>
            <button
              type="button"
              className="btn-primary w-full"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(newInvite.url);
                  toast('Link kopiert.', { tone: 'ok' });
                } catch {
                  toast('Kopieren nicht möglich – bitte manuell markieren.', { tone: 'error' });
                }
              }}
            >
              <Copy className="size-4" /> Link kopieren
            </button>
            <p className="hint">Teile den Link nur über einen vertraulichen Kanal. Gespeichert wird nur ein Hash; verlorene Links können nicht erneut angezeigt werden.</p>
          </div>
        )}
      </Modal>
    </div>
  );
}
