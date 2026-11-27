/**
 * Sprachwahl und Abgleich mit dem Konto (6.1).
 *
 * Reihenfolge: (1) Sprache in den Kontoeinstellungen (nach der Anmeldung, geräteübergreifend) →
 * (2) ausdrückliche Wahl auf diesem Gerät → (3) Browsersprache → (4) Deutsch.
 * Eine Wahl in der App gilt sofort, wird auf dem Gerät gespeichert und – angemeldet – im Konto.
 * Die Sprache ist keine private Information; sie bleibt beim Abmelden auf dem Gerät erhalten.
 */
import { Check, Globe } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { AVAILABLE_LOCALES, type LocaleCode, getLocale, setLocale, t, useLocale } from '../i18n';
import { useOptionalData } from './DataProvider';

/** Übernimmt die im Konto gespeicherte Sprache nach dem Laden der Einstellungen. */
export function LocaleSync() {
  const data = useOptionalData();
  const wanted = data?.ready ? data.settings.locale : undefined;
  useEffect(() => {
    if (wanted && wanted !== getLocale()) void setLocale(wanted, { persist: true });
  }, [wanted]);
  return null;
}

export function useChooseLocale() {
  const data = useOptionalData();
  return async (code: LocaleCode) => {
    await setLocale(code, { persist: true });
    if (data?.ready && data.settings.locale !== code) await data.updateSettings({ locale: code }).catch(() => {});
  };
}

/** Sprachwahl als Liste (Einstellungen). */
export function LanguageOptions() {
  const current = useLocale();
  const choose = useChooseLocale();
  return (
    <div role="radiogroup" aria-label={t('shell.language.label')} className="flex flex-wrap gap-2">
      {AVAILABLE_LOCALES.map((l) => (
        <button
          key={l.code}
          type="button"
          role="radio"
          aria-checked={current === l.code}
          lang={l.code}
          onClick={() => void choose(l.code)}
          className={`inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px] ${current === l.code ? 'border-leaf-500/40 bg-leaf-500/10 text-leaf-100' : 'border-white/[0.08] text-ink-200 hover:border-white/[0.16]'}`}
        >
          {current === l.code && <Check className="size-3.5" />}
          {l.nativeName}
        </button>
      ))}
    </div>
  );
}

/** Kompakte Sprachwahl mit Globus (Anmeldung, Seitenleiste). */
export function LanguageMenu({ align = 'left', compact = false }: { align?: 'left' | 'right'; compact?: boolean }) {
  const current = useLocale();
  const choose = useChooseLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  const info = AVAILABLE_LOCALES.find((l) => l.code === current)!;
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`${t('shell.language.label')}: ${info.nativeName}`}
        onClick={() => setOpen((o) => !o)}
        className={compact ? 'btn-ghost p-1.5' : 'inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] text-ink-400 hover:bg-white/[0.04] hover:text-ink-100'}
      >
        <Globe className="size-4" />
        {!compact && <span>{info.nativeName}</span>}
      </button>
      {open && (
        <div role="menu" className={`absolute z-50 mt-1 w-40 rounded-lg border border-white/[0.08] bg-ink-850 p-1 shadow-2xl ${align === 'right' ? 'right-0' : 'left-0'} ${compact ? '' : 'bottom-full mb-1 mt-0'}`}>
          {AVAILABLE_LOCALES.map((l) => (
            <button
              key={l.code}
              type="button"
              role="menuitemradio"
              aria-checked={current === l.code}
              lang={l.code}
              onClick={() => {
                setOpen(false);
                void choose(l.code);
              }}
              className="flex w-full items-center justify-between rounded-md px-2.5 py-1.5 text-left text-[13px] text-ink-200 hover:bg-white/[0.05] hover:text-ink-50"
            >
              {l.nativeName}
              {current === l.code && <Check className="size-3.5 text-leaf-400" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
