import { ArrowLeft, Fingerprint, KeyRound, Loader2, LogIn, ShieldCheck, Sparkles, UserPlus, UserRound, WifiOff } from 'lucide-react';
import { type FormEvent, type ReactNode, useEffect, useId, useState } from 'react';
import { useAuth } from '../../app/auth';
import { LogoMark, Wordmark } from '../../components/brand/Logo';
import { ApiError, type ServerUser, api } from '../../lib/server/api';
import { passkeyErrorText, passkeysSupported } from '../../lib/server/passkeys';
import { FormError, PasswordField, PasswordStrength, passwordHints } from './fields';
import { RecoveryCodesPanel } from './RecoveryCodes';

type View = 'login' | 'mfa' | 'register' | 'codes' | 'recover';

const message = (e: unknown) => {
  if (e instanceof ApiError) {
    if (e.status === 429) return `${e.message}${typeof e.extra.retryAfter === 'number' ? ` (in ${Math.ceil(e.extra.retryAfter)} s)` : ''}`;
    return e.message;
  }
  return 'Unerwarteter Fehler. Bitte erneut versuchen.';
};

/** Einladungs-Token aus dem Link lesen und sofort aus der Adresszeile entfernen. */
function takeInvite(): string | undefined {
  const m = /[?&]invite=([A-Za-z0-9_-]{16,100})/.exec(window.location.hash);
  if (!m) return undefined;
  history.replaceState(null, '', `${window.location.pathname}#/register`);
  return m[1];
}

function Shell({ children, title, subtitle, back }: { children: ReactNode; title: string; subtitle?: ReactNode; back?: () => void }) {
  return (
    <div className="relative grid min-h-dvh place-items-center overflow-hidden px-4 py-10">
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[32rem] w-[32rem] -translate-x-1/2 rounded-full bg-leaf-500/[0.07] blur-3xl" />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{ backgroundImage: 'radial-gradient(rgb(95 227 154 / 0.08) 1px, transparent 1px)', backgroundSize: '22px 22px', maskImage: 'radial-gradient(ellipse at center, black 30%, transparent 75%)' }}
        />
      </div>
      <div className="relative w-full max-w-md animate-fade-up">
        <div className="mb-7 flex items-center justify-center gap-3">
          <LogoMark className="size-11" />
          <Wordmark />
        </div>
        <div className="card p-6 sm:p-7">
          {back && (
            <button type="button" onClick={back} className="mb-4 inline-flex items-center gap-1.5 text-[12px] text-ink-400 hover:text-ink-100">
              <ArrowLeft className="size-3.5" /> Zurück zur Anmeldung
            </button>
          )}
          <h1 className="text-xl font-semibold tracking-tight text-ink-50">{title}</h1>
          {subtitle && <p className="mt-1.5 text-[13px] leading-relaxed text-ink-400">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
        <p className="mt-5 flex items-center justify-center gap-1.5 text-center text-[11.5px] text-ink-500">
          <ShieldCheck className="size-3.5 text-leaf-500" /> Self-hosted · Private Daten geschützt · Kein Tracking
        </p>
      </div>
    </div>
  );
}

export function AuthScreen() {
  const auth = useAuth();
  const [invite] = useState(takeInvite);
  const [view, setView] = useState<View>(invite || window.location.hash.startsWith('#/register') ? 'register' : 'login');
  const [mfaToken, setMfaToken] = useState('');
  const [registered, setRegistered] = useState<{ user: ServerUser; codes: string[] } | null>(null);
  const offline = auth.state.kind === 'anonymous' && auth.state.offline === true;
  const inviteOnly = auth.state.kind === 'anonymous' ? auth.state.config.inviteOnly : true;

  if (view === 'codes' && registered)
    return (
      <Shell title="Konto erstellt – jetzt absichern" subtitle="Speichere deine Kennung und die Wiederherstellungscodes. Sie werden nur dieses eine Mal angezeigt.">
        <RecoveryCodesPanel codes={registered.codes} loginName={registered.user.loginName} onDone={() => auth.enter(registered.user)} />
      </Shell>
    );
  if (view === 'mfa') return <MfaView token={mfaToken} back={() => setView('login')} />;
  if (view === 'recover') return <RecoverView back={() => setView('login')} />;
  if (view === 'register')
    return (
      <RegisterView
        invite={invite}
        inviteOnly={inviteOnly}
        back={() => setView('login')}
        onDone={(user, codes) => {
          setRegistered({ user, codes });
          setView('codes');
        }}
      />
    );
  return (
    <LoginView
      offline={offline}
      onMfa={(t) => {
        setMfaToken(t);
        setView('mfa');
      }}
      onRegister={() => setView('register')}
      onRecover={() => setView('recover')}
    />
  );
}

function LoginView({ offline, onMfa, onRegister, onRecover }: { offline: boolean; onMfa: (t: string) => void; onRegister: () => void; onRecover: () => void }) {
  const auth = useAuth();
  const id = useId();
  const [login, setLogin] = useState(auth.lastAccount?.loginName ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [pkBusy, setPkBusy] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const r = await auth.login(login.trim(), password);
      if (r.status === 'mfa') onMfa(r.mfaToken);
    } catch (err) {
      setError(message(err));
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Shell title="Willkommen zurück" subtitle="Melde dich mit Benutzername oder Konto-ID an.">
      {offline && (
        <div className="mb-5 space-y-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3.5 text-[13px] text-amber-100">
          <p className="flex items-start gap-2">
            <WifiOff className="mt-0.5 size-4 shrink-0 text-amber-300" /> Der Server ist gerade nicht erreichbar.
          </p>
          {auth.lastAccount && (
            <button type="button" className="btn-ghost w-full" onClick={auth.continueOffline}>
              Offline weiter als {auth.lastAccount.displayName || auth.lastAccount.loginName}
            </button>
          )}
          <p className="text-[12px] text-amber-200/80">Änderungen bleiben auf diesem Gerät, bis der Server sie bestätigt hat.</p>
        </div>
      )}
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor={id} className="label">
            Benutzername oder Konto-ID
          </label>
          <div className="relative">
            <UserRound className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-500" />
            <input id={id} className="input-base pl-9" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={80} required autoFocus={!login} />
          </div>
        </div>
        <PasswordField label="Passwort" value={password} onChange={setPassword} autoComplete="current-password" autoFocus={!!login} />
        <FormError message={error} />
        <button type="submit" className="btn-primary w-full py-2.5" disabled={busy || !login || !password}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <LogIn className="size-4" />} Anmelden
        </button>
      </form>
      {passkeysSupported() && (
        <>
          <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-[0.14em] text-ink-500">
            <span className="h-px flex-1 bg-white/[0.06]" /> oder <span className="h-px flex-1 bg-white/[0.06]" />
          </div>
          <button
            type="button"
            className="btn-ghost w-full py-2.5"
            disabled={pkBusy}
            onClick={async () => {
              setPkBusy(true);
              setError(undefined);
              try {
                await auth.loginPasskey();
              } catch (err) {
                setError(passkeyErrorText(err));
              } finally {
                setPkBusy(false);
              }
            }}
          >
            {pkBusy ? <Loader2 className="size-4 animate-spin" /> : <Fingerprint className="size-4" />} Mit Passkey anmelden
          </button>
        </>
      )}
      <div className="mt-6 flex flex-col gap-2 border-t border-white/[0.05] pt-5 text-[13px] sm:flex-row sm:justify-between">
        <button type="button" className="inline-flex items-center gap-1.5 text-ink-300 hover:text-leaf-200" onClick={onRegister}>
          <UserPlus className="size-3.5" /> Konto erstellen
        </button>
        <button type="button" className="inline-flex items-center gap-1.5 text-ink-300 hover:text-leaf-200" onClick={onRecover}>
          <KeyRound className="size-3.5" /> Passwort vergessen?
        </button>
      </div>
    </Shell>
  );
}

function MfaView({ token, back }: { token: string; back: () => void }) {
  const auth = useAuth();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await auth.completeMfa(token, code.replace(/\s/g, ''));
    } catch (err) {
      setError(message(err));
      setCode('');
      if (err instanceof ApiError && /abgelaufen|Zu viele/.test(err.message)) setTimeout(back, 1500);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell title="Zwei-Faktor-Bestätigung" subtitle="Gib den 6-stelligen Code aus deiner Authenticator-App ein." back={back}>
      <form onSubmit={submit} className="space-y-4">
        <input
          className="input-base text-center font-mono text-2xl tracking-[0.5em]"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, '').slice(0, 6))}
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label="Bestätigungscode"
          autoFocus
          required
        />
        <FormError message={error} />
        <button type="submit" className="btn-primary w-full py-2.5" disabled={busy || code.length !== 6}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} Bestätigen
        </button>
        <p className="hint">Kein Zugriff auf die App? Über „Passwort vergessen?“ kannst du dich mit einem Wiederherstellungscode anmelden – 2FA wird dabei deaktiviert und Passkeys werden entfernt.</p>
      </form>
    </Shell>
  );
}

function RegisterView({ invite, inviteOnly, back, onDone }: { invite?: string; inviteOnly: boolean; back: () => void; onDone: (u: ServerUser, codes: string[]) => void }) {
  const auth = useAuth();
  const ids = { user: useId(), name: useId(), inv: useId() };
  const [mode, setMode] = useState<'username' | 'generated'>('username');
  const [username, setUsername] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [inviteCode, setInviteCode] = useState(invite ?? '');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [adult, setAdult] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [inviteValid, setInviteValid] = useState<boolean | null>(null);
  const [available, setAvailable] = useState<{ name: string; ok: boolean; problem?: string } | null>(null);

  useEffect(() => {
    if (!inviteCode) return setInviteValid(null);
    const t = setTimeout(() => {
      api<{ valid: boolean }>('GET', `/api/auth/invite/${encodeURIComponent(inviteCode)}`)
        .then((r) => setInviteValid(r.valid))
        .catch(() => setInviteValid(null));
    }, 300);
    return () => clearTimeout(t);
  }, [inviteCode]);

  useEffect(() => {
    const name = username.trim();
    if (mode !== 'username' || name.length < 3 || (inviteOnly && !inviteValid)) return setAvailable(null);
    const t = setTimeout(() => {
      const q = new URLSearchParams({ name, ...(inviteCode ? { invite: inviteCode } : {}) });
      api<{ available: boolean; problem?: string }>('GET', `/api/auth/username-available?${q}`)
        .then((r) => setAvailable({ name, ok: r.available, problem: r.problem }))
        .catch(() => setAvailable(null));
    }, 400);
    return () => clearTimeout(t);
  }, [username, mode, inviteCode, inviteOnly, inviteValid]);

  const hints = passwordHints(password, mode === 'username' ? username : undefined);
  const canSubmit = adult && hints.ok && password === confirm && (mode === 'generated' || username.trim().length >= 3) && (!inviteOnly || inviteCode.length > 0);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const r = await auth.register({
        mode,
        ...(mode === 'username' ? { username: username.trim() } : {}),
        ...(displayName.trim() ? { displayName: displayName.trim() } : {}),
        ...(inviteCode ? { invite: inviteCode } : {}),
        password,
        ageConfirmed: adult,
      });
      onDone(r.user, r.recoveryCodes);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };

  const ModeCard = ({ value, icon, title, text }: { value: 'username' | 'generated'; icon: ReactNode; title: string; text: string }) => (
    <button
      type="button"
      role="radio"
      aria-checked={mode === value}
      onClick={() => setMode(value)}
      className={`flex flex-1 flex-col items-start gap-1 rounded-xl border p-3 text-left transition-colors ${mode === value ? 'border-leaf-500/40 bg-leaf-500/[0.08]' : 'border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12]'}`}
    >
      <span className={`flex items-center gap-1.5 text-[13px] font-medium ${mode === value ? 'text-leaf-200' : 'text-ink-100'}`}>
        {icon} {title}
      </span>
      <span className="text-[11.5px] leading-snug text-ink-400">{text}</span>
    </button>
  );

  return (
    <Shell title="Konto erstellen" subtitle="Ohne E-Mail, Telefonnummer oder Klarnamen. Nur für Erwachsene." back={back}>
      <form onSubmit={submit} className="space-y-5">
        {(inviteOnly || invite) && (
          <div className="space-y-1.5">
            <label htmlFor={ids.inv} className="label">
              Einladungscode
            </label>
            <input id={ids.inv} className="input-base font-mono text-[13px]" value={inviteCode} onChange={(e) => setInviteCode(e.target.value.trim())} autoComplete="off" spellCheck={false} required={inviteOnly} />
            {inviteValid === false && <p className="text-[12px] text-red-300">Diese Einladung ist ungültig, abgelaufen oder bereits verwendet.</p>}
            {inviteValid === true && <p className="text-[12px] text-leaf-300">Einladung gültig.</p>}
            {!inviteCode && <p className="hint">Diese Instanz ist nur auf Einladung zugänglich. Den Link erhältst du von der Administration.</p>}
          </div>
        )}
        <div role="radiogroup" aria-label="Art der Kennung" className="flex flex-col gap-2 sm:flex-row">
          <ModeCard value="username" icon={<UserRound className="size-3.5" />} title="Benutzername" text="Frei gewählt, z. B. ein Pseudonym." />
          <ModeCard value="generated" icon={<Sparkles className="size-3.5" />} title="Zufällige Konto-ID" text="Maximal anonym – wird für dich erzeugt." />
        </div>
        {mode === 'username' ? (
          <div className="space-y-1.5">
            <label htmlFor={ids.user} className="label">
              Benutzername
            </label>
            <input id={ids.user} className="input-base" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={32} required />
            {available?.name === username.trim() && (
              <p className={`text-[12px] ${available.ok ? 'text-leaf-300' : 'text-red-300'}`}>{available.ok ? 'Verfügbar' : (available.problem ?? 'Bereits vergeben')}</p>
            )}
            <p className="hint">3–32 Zeichen: Kleinbuchstaben, Ziffern, Punkt, Unterstrich, Bindestrich. Verwende keinen echten Namen.</p>
          </div>
        ) : (
          <p className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3 text-[12.5px] leading-relaxed text-ink-300">
            Nach dem Erstellen erhältst du eine Kennung wie <span className="font-mono text-leaf-200">tg-7k2m9-…</span>. Du brauchst sie zum Anmelden – bewahre sie zusammen mit den
            Wiederherstellungscodes auf.
          </p>
        )}
        <div className="space-y-1.5">
          <label htmlFor={ids.name} className="label">
            Anzeigename <span className="font-normal text-ink-500">(optional)</span>
          </label>
          <input id={ids.name} className="input-base" value={displayName} onChange={(e) => setDisplayName(e.target.value)} maxLength={60} autoComplete="off" />
        </div>
        <PasswordField label="Passwort" value={password} onChange={setPassword} autoComplete="new-password" />
        {password && <PasswordStrength password={password} login={mode === 'username' ? username : undefined} />}
        <PasswordField label="Passwort wiederholen" value={confirm} onChange={setConfirm} autoComplete="new-password" />
        {confirm && confirm !== password && <p className="-mt-3 text-[12px] text-red-300">Die Passwörter stimmen nicht überein.</p>}
        <label className="flex items-start gap-2.5 text-[13px] text-ink-200">
          <input type="checkbox" className="mt-0.5 size-4 accent-leaf-500" checked={adult} onChange={(e) => setAdult(e.target.checked)} />
          Ich bin volljährig und nutze TERPGRID im Rahmen der für mich geltenden Gesetze.
        </label>
        <FormError message={error} />
        <button type="submit" className="btn-primary w-full py-2.5" disabled={busy || !canSubmit}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <UserPlus className="size-4" />} Konto erstellen
        </button>
      </form>
    </Shell>
  );
}

function RecoverView({ back }: { back: () => void }) {
  const auth = useAuth();
  const ids = { login: useId(), code: useId() };
  const [login, setLogin] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const hints = passwordHints(password, login);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await auth.recover(login.trim(), code.trim(), password);
    } catch (err) {
      setError(message(err));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Shell
      title="Zugang wiederherstellen"
      subtitle="Mit einem deiner Wiederherstellungscodes setzt du ein neues Passwort. Der Code ist danach verbraucht; alle Sitzungen werden beendet, 2FA wird deaktiviert und registrierte Passkeys werden entfernt."
      back={back}
    >
      <form onSubmit={submit} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor={ids.login} className="label">
            Benutzername oder Konto-ID
          </label>
          <input id={ids.login} className="input-base" value={login} onChange={(e) => setLogin(e.target.value)} autoComplete="username" autoCapitalize="none" spellCheck={false} required />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={ids.code} className="label">
            Wiederherstellungscode
          </label>
          <input id={ids.code} className="input-base font-mono tracking-wider" placeholder="xxxx-xxxx-xxxx-xxxx" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" spellCheck={false} required />
        </div>
        <PasswordField label="Neues Passwort" value={password} onChange={setPassword} autoComplete="new-password" />
        {password && <PasswordStrength password={password} login={login} />}
        <FormError message={error} />
        <button type="submit" className="btn-primary w-full py-2.5" disabled={busy || !hints.ok || !login || code.length < 16}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />} Passwort neu setzen
        </button>
        <p className="hint">Keine Codes mehr? Ohne Wiederherstellungscode kann das Konto nicht zurückgesetzt werden – das ist Absicht: Es gibt keinen Generalschlüssel.</p>
      </form>
    </Shell>
  );
}
