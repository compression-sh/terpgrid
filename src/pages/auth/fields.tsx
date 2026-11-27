import { Eye, EyeOff } from 'lucide-react';
import { useId, useState } from 'react';
import { t } from '../../i18n';

export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  hint,
  autoFocus,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: 'current-password' | 'new-password';
  hint?: string;
  autoFocus?: boolean;
}) {
  const id = useId();
  const [show, setShow] = useState(false);
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={show ? 'text' : 'password'}
          className="input-base pr-10"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          spellCheck={false}
          autoCapitalize="none"
          maxLength={256}
          autoFocus={autoFocus}
          required
        />
        <button
          type="button"
          className="absolute inset-y-0 right-0 grid w-10 place-items-center text-ink-400 hover:text-ink-100"
          aria-label={show ? t('account.pw.hide') : t('account.pw.show')}
          aria-pressed={show}
          onClick={() => setShow((s) => !s)}
        >
          {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

/** Spiegelt die serverseitige Richtlinie als Hinweis – die Prüfung erfolgt auf dem Server. */
export function passwordHints(pw: string, login?: string): { ok: boolean; items: { text: string; ok: boolean }[] } {
  const len = [...pw].length;
  const items = [
    { text: t('account.pw.min12'), ok: len >= 12 },
    { text: t('account.pw.notLogin'), ok: !login || login.length < 3 || !pw.toLowerCase().includes(login.toLowerCase()) },
    { text: t('account.pw.distinct'), ok: new Set([...pw]).size >= 5 },
  ];
  return { ok: items.every((i) => i.ok), items };
}

export function PasswordStrength({ password, login }: { password: string; login?: string }) {
  const { items } = passwordHints(password, login);
  const len = [...password].length;
  const score = len === 0 ? 0 : len < 12 ? 1 : len < 16 ? 2 : len < 20 ? 3 : 4;
  const colors = ['bg-white/10', 'bg-red-400', 'bg-amber-400', 'bg-leaf-400', 'bg-leaf-300'];
  return (
    <div className="space-y-2" aria-live="polite">
      <div className="flex gap-1" aria-hidden>
        {[1, 2, 3, 4].map((i) => (
          <span key={i} className={`h-1 flex-1 rounded-full transition-colors ${score >= i ? colors[score] : 'bg-white/[0.06]'}`} />
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1">
        {items.map((i) => (
          <li key={i.text} className={`text-[11.5px] ${i.ok ? 'text-leaf-300' : 'text-ink-500'}`}>
            {i.ok ? '✓' : '○'} {i.text}
          </li>
        ))}
      </ul>
      <p className="hint">{t('account.pw.tip')}</p>
    </div>
  );
}

export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-lg border border-red-400/25 bg-red-500/10 px-3 py-2 text-[13px] text-red-200">
      {message}
    </p>
  );
}
