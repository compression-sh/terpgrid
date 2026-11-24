import {
  Download,
  HardDrive,
  KeyRound,
  Laptop,
  Loader2,
  LockKeyhole,
  LogOut,
  RefreshCw,
  Server,
  ShieldAlert,
  ShieldCheck,
  Smartphone,
  Trash2,
  UserRound,
  Users,
} from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import { accountDbName, useAuth } from '../../app/auth';
import { useConfirm } from '../../app/Confirm';
import { useReauth } from '../../app/reauth';
import { href } from '../../app/router';
import { logoutFlow } from '../../app/SyncIndicator';
import { useToast } from '../../app/Toasts';
import { Callout } from '../../components/ui/Callout';
import { Modal } from '../../components/ui/Modal';
import { PageHeader } from '../../components/ui/PageHeader';
import { deleteDatabase, storageEstimate, useDatabaseName } from '../../lib/db/database';
import { isSharedDevice, setSharedDevice } from '../../lib/device';
import { useData } from '../../app/DataProvider';
import { formatBytes } from '../../lib/media/images';
import { ApiError, type ServerUser, api } from '../../lib/server/api';
import { FormError, PasswordField, PasswordStrength, passwordHints } from '../auth/fields';
import { RecoveryCodesPanel } from '../auth/RecoveryCodes';

interface Overview {
  createdAt: string;
  lastLoginAt: string | null;
  passwordChangedAt: string;
  storageBytes: number;
  quotaBytes: number;
  recoveryCodesRemaining: number;
  sessions: number;
  totpEnabled: boolean;
  securityEvents: { type: string; created_at: string }[];
}
interface SessionRow {
  handle: string;
  current: boolean;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  userAgent: string | null;
}

const EVENT_LABEL: Record<string, string> = {
  'login.success': 'Anmeldung',
  'login.failure': 'Fehlgeschlagene Anmeldung',
  'password.change': 'Passwort geändert',
  'recovery.success': 'Zugang per Recovery-Code wiederhergestellt',
  'recovery.regenerate': 'Neue Recovery-Codes erzeugt',
  'totp.enable': '2FA aktiviert',
  'totp.disable': '2FA deaktiviert',
  'session.revoke': 'Sitzung beendet',
};

const dt = (s: string | null | undefined) => (s ? new Date(s).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '–');
const errText = (e: unknown) => (e instanceof ApiError ? e.message : 'Unerwarteter Fehler.');

function describeUa(ua: string | null): { label: string; mobile: boolean } {
  if (!ua) return { label: 'Unbekanntes Gerät', mobile: false };
  const mobile = /Mobile|Android|iPhone|iPad/.test(ua);
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  const os = /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) && !/iPhone|iPad/.test(ua) ? 'macOS' : /iPhone|iPad/.test(ua) ? 'iOS' : /Android/.test(ua) ? 'Android' : /Linux/.test(ua) ? 'Linux' : '';
  return { label: `${browser}${os ? ` · ${os}` : ''}`, mobile };
}

function Section({ id, icon, title, subtitle, children }: { id: string; icon: ReactNode; title: string; subtitle?: string; children: ReactNode }) {
  return (
    <section id={id} className="card scroll-mt-24 p-5 sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-leaf-500/10 text-leaf-300">{icon}</span>
        <div>
          <h2 className="text-[15px] font-semibold text-ink-50">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[13px] text-ink-400">{subtitle}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

export function AccountPage() {
  const auth = useAuth();
  const reauth = useReauth();
  const toast = useToast();
  const confirm = useConfirm();
  const user = auth.state.kind === 'authenticated' ? auth.state.user : null;
  const offline = auth.state.kind === 'authenticated' && auth.state.offline;
  const [ov, setOv] = useState<Overview | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [loadError, setLoadError] = useState<string>();

  const load = useCallback(async () => {
    try {
      const [o, s] = await Promise.all([api<Overview>('GET', '/api/account/overview'), api<{ sessions: SessionRow[] }>('GET', '/api/auth/sessions')]);
      setOv(o);
      setSessions(s.sessions);
      setLoadError(undefined);
    } catch (e) {
      setLoadError(errText(e));
    }
  }, []);
  useEffect(() => {
    if (!offline) void load();
  }, [load, offline]);

  if (!user) return null;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader title="Konto & Datenschutz" subtitle="Profil, Sicherheit, Sitzungen und deine Daten." />
      <nav aria-label="Abschnitte" className="-mt-2 flex flex-wrap gap-1.5 text-[12px]">
        {[
          ['profil', 'Profil'],
          ['sicherheit', 'Sicherheit'],
          ['sitzungen', 'Sitzungen'],
          ['daten', 'Daten'],
          ['geraet', 'Dieses Gerät'],
          ['datenschutz', 'Datenschutz-Center'],
          ['loeschen', 'Konto löschen'],
          ...(user.role === 'admin' ? [['admin', 'Administration']] : []),
        ].map(([id, label]) =>
          id === 'admin' ? (
            <a key={id} href={href('admin')} className="rounded-full border border-leaf-500/25 bg-leaf-500/[0.07] px-2.5 py-1 text-leaf-200">
              {label}
            </a>
          ) : (
            <a key={id} href={`#/account`} onClick={(e) => { e.preventDefault(); document.getElementById(id!)?.scrollIntoView({ behavior: 'smooth' }); }} className="rounded-full border border-white/[0.06] px-2.5 py-1 text-ink-300 hover:text-ink-50">
              {label}
            </a>
          ),
        )}
      </nav>

      {offline && <Callout tone="warn">Offline-Modus: Kontoeinstellungen sind erst wieder verfügbar, wenn der Server erreichbar ist.</Callout>}
      {loadError && <Callout tone="danger">{loadError}</Callout>}

      <ProfileSection user={user} ov={ov} onSaved={(displayName) => auth.setUser({ displayName })} disabled={offline} />
      <SecuritySection user={user} ov={ov} reload={load} disabled={offline} />

      <Section id="sitzungen" icon={<Laptop className="size-4" />} title="Aktive Sitzungen" subtitle="Geräte, auf denen du angemeldet bist. Unbekannte Sitzungen sofort beenden.">
        <ul className="divide-y divide-white/[0.05]">
          {sessions.map((s) => {
            const d = describeUa(s.userAgent);
            return (
              <li key={s.handle} className="flex items-center gap-3 py-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/[0.04] text-ink-300">{d.mobile ? <Smartphone className="size-4" /> : <Laptop className="size-4" />}</span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[13.5px] text-ink-100">
                    {d.label}
                    {s.current && <span className="rounded-full bg-leaf-500/15 px-2 py-0.5 text-[10.5px] text-leaf-200">Dieses Gerät</span>}
                  </div>
                  <div className="text-[11.5px] text-ink-500">
                    Angemeldet {dt(s.createdAt)} · zuletzt aktiv {dt(s.lastSeenAt)}
                  </div>
                </div>
                {!s.current && (
                  <button
                    type="button"
                    className="btn-ghost px-2.5 py-1.5 text-xs"
                    onClick={async () => {
                      try {
                        await api('DELETE', `/api/auth/sessions/${s.handle}`);
                        toast('Sitzung beendet.', { tone: 'ok' });
                        void load();
                      } catch (e) {
                        toast(errText(e), { tone: 'error' });
                      }
                    }}
                  >
                    Beenden
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-ghost"
            disabled={offline || sessions.length < 2}
            onClick={async () => {
              const r = await api<{ revoked: number }>('POST', '/api/auth/sessions/revoke-others').catch((e) => (toast(errText(e), { tone: 'error' }), null));
              if (r) toast(`${r.revoked} andere Sitzung(en) beendet.`, { tone: 'ok' });
              void load();
            }}
          >
            <LogOut className="size-4" /> Alle anderen Sitzungen beenden
          </button>
          <button type="button" className="btn-ghost" onClick={() => void logoutFlow(auth.logout, confirm)}>
            <LogOut className="size-4" /> Auf diesem Gerät abmelden
          </button>
        </div>
      </Section>

      <Section id="daten" icon={<Download className="size-4" />} title="Deine Daten" subtitle="Export, Synchronisation und Übernahme lokaler Daten.">
        <div className="grid gap-3 sm:grid-cols-3">
          <button
            type="button"
            className="btn-ghost justify-start"
            disabled={offline}
            onClick={async () => {
              try {
                const buf = await reauth(() => api<ArrayBuffer>('GET', '/api/account/export', undefined, { binary: true }));
                if (!buf) return;
                const url = URL.createObjectURL(new Blob([buf], { type: 'application/zip' }));
                const a = document.createElement('a');
                a.href = url;
                a.download = `terpgrid-export-${new Date().toISOString().slice(0, 10)}.zip`;
                a.click();
                setTimeout(() => URL.revokeObjectURL(url), 2000);
              } catch (e) {
                toast(errText(e), { tone: 'error' });
              }
            }}
          >
            <Download className="size-4" /> Vollständiger Export (ZIP)
          </button>
          <a className="btn-ghost justify-start" href={href('account/sync')}>
            <RefreshCw className="size-4" /> Synchronisation
          </a>
          <a className="btn-ghost justify-start" href={href('account/import')}>
            <HardDrive className="size-4" /> Lokale Daten übernehmen
          </a>
        </div>
        <p className="hint mt-3">Der Export nutzt das TERPGRID-Backup-Format (Format 2) und lässt sich unter „Daten & Backup“ wieder importieren – auch im Lokalmodus.</p>
        {ov && (
          <div className="mt-4">
            <div className="mb-1 flex justify-between text-[12px] text-ink-400">
              <span>Speicher für Fotos & Dokumente</span>
              <span className="tabular">
                {formatBytes(ov.storageBytes)} von {formatBytes(ov.quotaBytes)}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.06]">
              <div className="h-full bg-leaf-400" style={{ width: `${Math.min(100, (ov.storageBytes / ov.quotaBytes) * 100)}%` }} />
            </div>
          </div>
        )}
      </Section>

      <DeviceSection />
      <PrivacyCenter />
      <DeleteSection user={user} disabled={offline} />
    </div>
  );
}

function ProfileSection({ user, ov, onSaved, disabled }: { user: ServerUser; ov: Overview | null; onSaved: (n: string | null) => void; disabled: boolean }) {
  const [name, setName] = useState(user.displayName ?? '');
  const [busy, setBusy] = useState(false);
  const toast = useToast();
  return (
    <Section id="profil" icon={<UserRound className="size-4" />} title="Profil" subtitle="Kein Klarname, keine E-Mail, keine Telefonnummer.">
      <dl className="mb-4 grid gap-3 text-[13px] sm:grid-cols-2">
        <div>
          <dt className="text-ink-500">Kennung ({user.loginKind === 'generated' ? 'Konto-ID' : 'Benutzername'})</dt>
          <dd className="mt-0.5 select-all font-mono text-ink-100">{user.loginName}</dd>
        </div>
        <div>
          <dt className="text-ink-500">Konto erstellt</dt>
          <dd className="mt-0.5 text-ink-100">{dt(ov?.createdAt)}</dd>
        </div>
      </dl>
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            const r = await api<{ displayName: string | null }>('PATCH', '/api/account', { displayName: name.trim() || null });
            onSaved(r.displayName);
            toast('Anzeigename gespeichert.', { tone: 'ok' });
          } catch (err) {
            toast(errText(err), { tone: 'error' });
          } finally {
            setBusy(false);
          }
        }}
      >
        <div className="flex-1 space-y-1.5">
          <label className="label" htmlFor="display-name">
            Anzeigename (optional)
          </label>
          <input id="display-name" className="input-base" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} disabled={disabled} />
        </div>
        <button type="submit" className="btn-primary" disabled={busy || disabled || name === (user.displayName ?? '')}>
          Speichern
        </button>
      </form>
    </Section>
  );
}

function SecuritySection({ user, ov, reload, disabled }: { user: ServerUser; ov: Overview | null; reload: () => void; disabled: boolean }) {
  const auth = useAuth();
  const reauth = useReauth();
  const toast = useToast();
  const confirm = useConfirm();
  const [pwOpen, setPwOpen] = useState(false);
  const [totpOpen, setTotpOpen] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);

  return (
    <Section id="sicherheit" icon={<ShieldCheck className="size-4" />} title="Sicherheit" subtitle="Passwort, Zwei-Faktor-Authentifizierung und Wiederherstellung.">
      <div className="divide-y divide-white/[0.05]">
        <Row icon={<KeyRound className="size-4" />} title="Passwort" text={`Zuletzt geändert: ${dt(ov?.passwordChangedAt)}`}>
          <button type="button" className="btn-ghost" disabled={disabled} onClick={() => setPwOpen(true)}>
            Ändern
          </button>
        </Row>
        <Row
          icon={<LockKeyhole className="size-4" />}
          title="Zwei-Faktor-Authentifizierung (TOTP)"
          text={user.totpEnabled ? 'Aktiv – beim Anmelden wird zusätzlich ein Code aus deiner Authenticator-App abgefragt.' : 'Nicht aktiv. Empfohlen: schützt dein Konto, falls dein Passwort bekannt wird.'}
          badge={user.totpEnabled ? <span className="rounded-full bg-leaf-500/15 px-2 py-0.5 text-[10.5px] text-leaf-200">Aktiv</span> : <span className="rounded-full bg-amber-400/15 px-2 py-0.5 text-[10.5px] text-amber-200">Aus</span>}
        >
          {user.totpEnabled ? (
            <button
              type="button"
              className="btn-ghost"
              disabled={disabled}
              onClick={async () => {
                const ok = await confirm({ title: '2FA deaktivieren?', message: 'Dein Konto ist danach nur noch durch das Passwort geschützt.', confirmLabel: 'Deaktivieren', tone: 'danger' });
                if (!ok) return;
                try {
                  const r = await reauth(() => api<{ user: ServerUser }>('POST', '/api/auth/totp/disable'));
                  if (r) {
                    auth.setUser({ totpEnabled: false });
                    toast('2FA deaktiviert.', { tone: 'ok' });
                    reload();
                  }
                } catch (e) {
                  toast(errText(e), { tone: 'error' });
                }
              }}
            >
              Deaktivieren
            </button>
          ) : (
            <button type="button" className="btn-primary" disabled={disabled} onClick={() => setTotpOpen(true)}>
              Einrichten
            </button>
          )}
        </Row>
        <Row
          icon={<ShieldAlert className="size-4" />}
          title="Wiederherstellungscodes"
          text={ov ? `${ov.recoveryCodesRemaining} von 10 noch unbenutzt. ${ov.recoveryCodesRemaining <= 3 ? 'Bitte neue Codes erzeugen.' : ''}` : '…'}
        >
          <button
            type="button"
            className="btn-ghost"
            disabled={disabled}
            onClick={async () => {
              const ok = await confirm({ title: 'Neue Codes erzeugen?', message: 'Alle bisherigen Wiederherstellungscodes werden sofort ungültig.', confirmLabel: 'Neue Codes erzeugen' });
              if (!ok) return;
              try {
                const r = await reauth(() => api<{ recoveryCodes: string[] }>('POST', '/api/auth/recovery-codes'));
                if (r) setCodes(r.recoveryCodes);
              } catch (e) {
                toast(errText(e), { tone: 'error' });
              }
            }}
          >
            Neu erzeugen
          </button>
        </Row>
      </div>

      {ov && ov.securityEvents.length > 0 && (
        <details className="mt-4 rounded-xl border border-white/[0.05] bg-white/[0.015] p-3">
          <summary className="cursor-pointer text-[13px] text-ink-300">Letzte Sicherheitsereignisse</summary>
          <ul className="mt-2 space-y-1 text-[12.5px]">
            {ov.securityEvents.map((e, i) => (
              <li key={`${e.created_at}-${i}`} className={`flex justify-between gap-3 ${e.type === 'login.failure' ? 'text-amber-200' : 'text-ink-300'}`}>
                <span>{EVENT_LABEL[e.type] ?? e.type}</span>
                <span className="tabular text-ink-500">{dt(e.created_at)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <PasswordModal open={pwOpen} onClose={() => setPwOpen(false)} login={user.loginName} onDone={reload} />
      <TotpModal open={totpOpen} onClose={() => setTotpOpen(false)} onDone={() => { auth.setUser({ totpEnabled: true }); reload(); }} />
      <Modal open={!!codes} onClose={() => setCodes(null)} title="Neue Wiederherstellungscodes" subtitle="Nur jetzt sichtbar. Die alten Codes sind ungültig.">
        {codes && <RecoveryCodesPanel codes={codes} loginName={user.loginName} doneLabel="Fertig" onDone={() => { setCodes(null); reload(); }} />}
      </Modal>
    </Section>
  );
}

function Row({ icon, title, text, badge, children }: { icon: ReactNode; title: string; text: string; badge?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex gap-3">
        <span className="mt-0.5 text-ink-400">{icon}</span>
        <div>
          <div className="flex items-center gap-2 text-[13.5px] font-medium text-ink-100">
            {title} {badge}
          </div>
          <p className="mt-0.5 text-[12.5px] text-ink-400">{text}</p>
        </div>
      </div>
      <div className="shrink-0 pl-7 sm:pl-0">{children}</div>
    </div>
  );
}

function PasswordModal({ open, onClose, login, onDone }: { open: boolean; onClose: () => void; login: string; onDone: () => void }) {
  const auth = useAuth();
  const toast = useToast();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const ok = passwordHints(next, login).ok && next === confirmPw && current.length > 0;
  const close = () => {
    setCurrent('');
    setNext('');
    setConfirmPw('');
    setError(undefined);
    onClose();
  };
  return (
    <Modal open={open} onClose={close} title="Passwort ändern" subtitle="Alle anderen Sitzungen werden danach beendet.">
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError(undefined);
          try {
            const r = await api<{ user: ServerUser }>('POST', '/api/auth/password', { currentPassword: current, newPassword: next });
            auth.setUser(r.user);
            toast('Passwort geändert. Andere Sitzungen wurden beendet.', { tone: 'ok' });
            close();
            onDone();
          } catch (err) {
            setError(errText(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <PasswordField label="Aktuelles Passwort" value={current} onChange={setCurrent} autoComplete="current-password" autoFocus />
        <PasswordField label="Neues Passwort" value={next} onChange={setNext} autoComplete="new-password" />
        {next && <PasswordStrength password={next} login={login} />}
        <PasswordField label="Neues Passwort wiederholen" value={confirmPw} onChange={setConfirmPw} autoComplete="new-password" />
        <FormError message={error} />
        <button type="submit" className="btn-primary w-full" disabled={busy || !ok}>
          {busy && <Loader2 className="size-4 animate-spin" />} Passwort ändern
        </button>
      </form>
    </Modal>
  );
}

function TotpModal({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const reauth = useReauth();
  const toast = useToast();
  const [setup, setSetup] = useState<{ secret: string; qrSvg: string } | null>(null);
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) {
      setSetup(null);
      setCode('');
      setError(undefined);
      return;
    }
    reauth(() => api<{ secret: string; qrSvg: string }>('POST', '/api/auth/totp/setup'))
      .then((r) => (r ? setSetup(r) : onClose()))
      .catch((e) => setError(errText(e)));
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const qrUrl = useMemo(() => (setup ? URL.createObjectURL(new Blob([setup.qrSvg], { type: 'image/svg+xml' })) : ''), [setup]);
  useEffect(() => () => {
    if (qrUrl) URL.revokeObjectURL(qrUrl);
  }, [qrUrl]);

  return (
    <Modal open={open} onClose={onClose} title="2FA einrichten" subtitle="Mit einer Authenticator-App (z. B. Aegis, 2FAS, Google Authenticator, 1Password).">
      {!setup ? (
        error ? <FormError message={error} /> : <div className="flex items-center gap-2 text-sm text-ink-400"><Loader2 className="size-4 animate-spin" /> Bereite vor …</div>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(undefined);
            try {
              await reauth(() => api('POST', '/api/auth/totp/enable', { code }));
              toast('2FA ist aktiv.', { tone: 'ok' });
              onDone();
              onClose();
            } catch (err) {
              setError(errText(err));
              setCode('');
            } finally {
              setBusy(false);
            }
          }}
        >
          <ol className="list-decimal space-y-1 pl-5 text-[13px] text-ink-300">
            <li>QR-Code mit der App scannen (oder Schlüssel manuell eingeben).</li>
            <li>Den angezeigten 6-stelligen Code unten eintragen.</li>
          </ol>
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
            <img src={qrUrl} alt="QR-Code für die Authenticator-App" className="size-44 rounded-xl bg-white p-2" />
            <div className="min-w-0 space-y-1">
              <div className="text-[11px] uppercase tracking-[0.14em] text-ink-500">Schlüssel</div>
              <code className="block break-all select-all font-mono text-[13px] text-leaf-200">{setup.secret.replace(/(.{4})/g, '$1 ').trim()}</code>
              <p className="hint">Nur hier sichtbar. Der Schlüssel wird verschlüsselt auf dem Server gespeichert.</p>
            </div>
          </div>
          <input
            className="input-base text-center font-mono text-xl tracking-[0.4em]"
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-label="Bestätigungscode"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
          />
          <FormError message={error} />
          <button type="submit" className="btn-primary w-full" disabled={busy || code.length !== 6}>
            {busy && <Loader2 className="size-4 animate-spin" />} Aktivieren
          </button>
        </form>
      )}
    </Modal>
  );
}

function DeviceSection() {
  const auth = useAuth();
  const confirm = useConfirm();
  const { data } = useData();
  const [shared, setShared] = useState(isSharedDevice);
  const [usage, setUsage] = useState<number | undefined>();
  const [busy, setBusy] = useState(false);
  const user = auth.state.kind === 'authenticated' ? auth.state.user : null;
  useEffect(() => {
    void storageEstimate().then((e) => setUsage(e.usage));
  }, []);
  const records = Object.values(data).reduce((n, l) => n + l.length, 0);
  return (
    <Section id="geraet" icon={<Smartphone className="size-4" />} title="Dieses Gerät" subtitle="Lokale Arbeitskopie in diesem Browser – für Offline-Nutzung und Synchronisation.">
      <dl className="mb-4 grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-3">
        <div>
          <dt className="text-ink-500">Lokale Datensätze</dt>
          <dd className="mt-0.5 tabular text-ink-100">{records}</dd>
        </div>
        <div>
          <dt className="text-ink-500">Belegter Browser-Speicher</dt>
          <dd className="mt-0.5 tabular text-ink-100">{usage !== undefined ? formatBytes(usage) : 'unbekannt'}</dd>
        </div>
        <div>
          <dt className="text-ink-500">Noch nicht übertragen</dt>
          <dd className={`mt-0.5 tabular ${auth.sync.pending ? 'text-amber-200' : 'text-ink-100'}`}>{auth.sync.pending}</dd>
        </div>
      </dl>
      <label className="flex items-start gap-3 rounded-xl border border-white/[0.06] bg-white/[0.015] p-3.5">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-leaf-500"
          checked={shared}
          onChange={(e) => {
            setSharedDevice(e.target.checked);
            setShared(e.target.checked);
          }}
        />
        <span>
          <span className="block text-[13.5px] font-medium text-ink-100">Geteiltes Gerät</span>
          <span className="mt-0.5 block text-[12.5px] leading-relaxed text-ink-400">
            Beim Abmelden wird die lokale Kopie immer gelöscht, deine Kennung wird nicht gemerkt und Offline-Weiterarbeiten ist aus. Empfohlen für Geräte, die auch andere nutzen.
          </span>
        </span>
      </label>
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn-ghost"
          disabled={busy || !user}
          onClick={async () => {
            if (!user) return;
            const pending = auth.sync.pending;
            const ok = await confirm({
              title: 'Lokale Kopie löschen?',
              message:
                pending > 0
                  ? `${pending} Änderung(en) wurden noch nicht vom Server bestätigt und gehen dabei verloren. Besser zuerst synchronisieren.`
                  : 'Die Daten werden aus diesem Browser entfernt und anschließend frisch vom Server geladen. Auf dem Server ändert sich nichts.',
              confirmLabel: pending > 0 ? 'Trotzdem löschen' : 'Löschen und neu laden',
              tone: pending > 0 ? 'danger' : 'default',
            });
            if (!ok) return;
            setBusy(true);
            auth.engine?.stop();
            useDatabaseName(accountDbName(user.accountKey));
            await deleteDatabase().catch(() => {});
            window.location.reload();
          }}
        >
          <HardDrive className="size-4" /> Lokale Kopie löschen und neu laden
        </button>
      </div>
      <p className="hint mt-3">
        Die lokale Kopie ist nicht verschlüsselt. Eine Verschlüsselung im Browser würde einen Schlüssel auf demselben Gerät erfordern und gegen Personen mit Zugriff auf das entsperrte
        Gerät keinen echten Schutz bieten. Schütze das Gerät selbst (Bildschirmsperre, Geräteverschlüsselung).
      </p>
    </Section>
  );
}

function PrivacyCenter() {
  const Item = ({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) => (
    <div className="flex gap-3">
      <span className="mt-0.5 text-leaf-400">{icon}</span>
      <div>
        <div className="text-[13.5px] font-medium text-ink-100">{title}</div>
        <div className="mt-0.5 text-[12.5px] leading-relaxed text-ink-400">{children}</div>
      </div>
    </div>
  );
  return (
    <Section id="datenschutz" icon={<ShieldCheck className="size-4" />} title="Datenschutz-Center" subtitle="Was TERPGRID speichert, wo und wie geschützt – ohne Übertreibung.">
      <div className="space-y-4">
        <Item icon={<Server className="size-4" />} title="Auf deinem TERPGRID-Server">
          Growlogs, Pflanzen, Fotos, Journal, Sammlung, Laborberichte, Einstellungen. Inhalte sind mit AES-256-GCM und einem eigenen Schlüssel je Konto verschlüsselt; dieser ist mit
          einem Master-Key geschützt, der nicht in der Datenbank liegt. <strong className="text-ink-200">Keine Ende-zu-Ende-Verschlüsselung:</strong> Wer den laufenden Server
          vollständig kontrolliert (z. B. der Betreiber mit Shell-Zugriff), könnte technisch entschlüsseln. Die Administration hat dafür bewusst keine Funktion.
        </Item>
        <Item icon={<UserRound className="size-4" />} title="Unverschlüsselt auf dem Server (Metadaten)">
          Kennung, Anzeigename, Rolle, Zeitpunkte von Anmeldungen und Änderungen, Anzahl und Größe der Datensätze/Dateien, gekürzter Browser-Typ je Sitzung. IP-Adressen nur als
          gekürzter, nicht umkehrbarer Hash im Sicherheitsprotokoll (180 Tage).
        </Item>
        <Item icon={<Laptop className="size-4" />} title="In diesem Browser">
          Eine Arbeitskopie deiner Daten (IndexedDB, je Konto getrennt, <strong className="text-ink-200">unverschlüsselt</strong>) für Offline-Nutzung, ausstehende Änderungen und die
          Eingabefelder des THC Lab (localStorage). Das Sitzungs-Cookie ist für Skripte nicht lesbar. Auf gemeinsam genutzten Geräten beim Abmelden die lokale Kopie löschen.
        </Item>
        <Item icon={<RefreshCw className="size-4" />} title="Externe Sortendaten">
          Discover nutzt StrainAPI und (auf Klick) CannaLib über deinen Server. Die Anbieter sehen nur die Server-Adresse und Suchbegriffe – keine persönlichen Daten, keine Cookies.
        </Item>
        <Item icon={<Users className="size-4" />} title="Administration">
          Administratoren sehen Kennungen, Status, Speicherverbrauch und Systemzustand – aber keine Inhalte. Es gibt keinen Generalschlüssel und keine versteckte Zugriffsfunktion.
        </Item>
        <Item icon={<HardDrive className="size-4" />} title="Backups und Löschung">
          Server-Backups sind zusätzlich verschlüsselt. Nach einer Kontolöschung bleiben (verschlüsselte) Daten bis zum Ablauf der Backup-Aufbewahrung erhalten (Standard bis zu ca. 6
          Monate).
        </Item>
        <Item icon={<ShieldCheck className="size-4" />} title="Kein Tracking">Keine Analyse-, Werbe- oder Tracking-Dienste. Keine E-Mail, keine Telefonnummer, kein Klarname.</Item>
      </div>
    </Section>
  );
}

function DeleteSection({ user, disabled }: { user: ServerUser; disabled: boolean }) {
  const auth = useAuth();
  const reauth = useReauth();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  return (
    <Section id="loeschen" icon={<Trash2 className="size-4" />} title="Konto löschen" subtitle="Endgültig – Datensätze, Fotos, Dokumente, Sitzungen und Recovery-Codes.">
      <button type="button" className="btn border border-rose-400/30 bg-rose-500/10 text-rose-200 hover:bg-rose-500/20" disabled={disabled} onClick={() => setOpen(true)}>
        <Trash2 className="size-4" /> Konto endgültig löschen …
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="Konto endgültig löschen?" size="sm">
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(undefined);
            try {
              const r = await reauth(() => api('DELETE', '/api/account', { confirm: typed }));
              if (!r) return;
              useDatabaseName(accountDbName(user.accountKey));
              await deleteDatabase().catch(() => {});
              toast('Dein Konto wurde gelöscht.', { tone: 'ok' });
              await auth.logout();
            } catch (err) {
              setError(errText(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Callout tone="danger">
            Alle Inhalte werden sofort vom Server und von diesem Gerät entfernt. Lade vorher einen Export herunter, falls du die Daten behalten möchtest. In Server-Backups bleiben
            verschlüsselte Kopien bis zum Ablauf der Aufbewahrung.
          </Callout>
          <div className="space-y-1.5">
            <label className="label" htmlFor="del-confirm">
              Zur Bestätigung deine Kennung eingeben: <span className="font-mono text-ink-100">{user.loginName}</span>
            </label>
            <input id="del-confirm" className="input-base font-mono" value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" spellCheck={false} />
          </div>
          <FormError message={error} />
          <button type="submit" className="btn w-full border border-rose-400/40 bg-rose-500/20 text-rose-100 hover:bg-rose-500/30" disabled={busy || typed.trim().toLowerCase() !== user.loginName}>
            {busy && <Loader2 className="size-4 animate-spin" />} Endgültig löschen
          </button>
        </form>
      </Modal>
    </Section>
  );
}
