/**
 * Re-Authentifizierung für sensible Aktionen (Passwort ändern, 2FA, Recovery-Codes,
 * Export, Kontolöschung, Admin). Der Server erzwingt sie; der Dialog fragt nur nach,
 * wenn das Zeitfenster abgelaufen ist.
 */
import { Loader2, ShieldCheck } from 'lucide-react';
import { type FormEvent, type ReactNode, createContext, useCallback, useContext, useRef, useState } from 'react';
import { Modal } from '../components/ui/Modal';
import { ApiError } from '../lib/server/api';
import { FormError, PasswordField } from '../pages/auth/fields';
import { useAuth } from './auth';
import { t } from '../i18n';

type Run = <T>(action: () => Promise<T>) => Promise<T | undefined>;
const Ctx = createContext<Run>(async (a) => a());

export function ReauthProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const resolver = useRef<(ok: boolean) => void>(() => {});
  const totp = auth.state.kind === 'authenticated' && auth.state.user.totpEnabled;

  const ask = () =>
    new Promise<boolean>((resolve) => {
      resolver.current = resolve;
      setPassword('');
      setCode('');
      setError(undefined);
      setOpen(true);
    });

  const run: Run = useCallback(
    async (action) => {
      const valid = auth.state.kind === 'authenticated' && auth.state.reauthUntil && new Date(auth.state.reauthUntil).getTime() - Date.now() > 15_000;
      if (!valid && !(await ask())) return undefined;
      try {
        return await action();
      } catch (e) {
        // Fenster serverseitig abgelaufen → einmal nachfragen und wiederholen
        if (e instanceof ApiError && e.reauthRequired) {
          if (!(await ask())) return undefined;
          return action();
        }
        throw e;
      }
    },
    [auth.state],
  );

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      await auth.reauth(password, totp ? code : undefined);
      setOpen(false);
      resolver.current(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('shell.reauth.failed'));
    } finally {
      setBusy(false);
      setPassword('');
    }
  };

  return (
    <Ctx.Provider value={run}>
      {children}
      <Modal
        open={open}
        size="sm"
        onClose={() => {
          setOpen(false);
          resolver.current(false);
        }}
        title={t('shell.reauth.title')}
        subtitle={t('shell.reauth.text')}
      >
        <form onSubmit={submit} className="space-y-4">
          <PasswordField label={t('shell.reauth.password')} value={password} onChange={setPassword} autoComplete="current-password" autoFocus />
          {totp && (
            <div className="space-y-1.5">
              <label className="label" htmlFor="reauth-code">
                {t('shell.reauth.code')}
              </label>
              <input id="reauth-code" className="input-base font-mono tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} required />
            </div>
          )}
          <FormError message={error} />
          <button type="submit" className="btn-primary w-full" disabled={busy || !password || (totp && code.length !== 6)}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} {t('common.confirm')}
          </button>
        </form>
      </Modal>
    </Ctx.Provider>
  );
}

export const useReauth = () => useContext(Ctx);
