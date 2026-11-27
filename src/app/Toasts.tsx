import { CheckCircle2, Info, TriangleAlert, X } from 'lucide-react';
import { type ReactNode, createContext, useCallback, useContext, useMemo, useState } from 'react';
import { t } from '../i18n';

type Tone = 'ok' | 'info' | 'error';
interface Toast {
  id: number;
  tone: Tone;
  text: string;
  action?: { label: string; run: () => void };
}

const Ctx = createContext<(text: string, opts?: { tone?: Tone; action?: Toast['action'] }) => void>(() => {});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = (id: number) => setToasts((list) => list.filter((x) => x.id !== id));
  const push = useCallback((text: string, opts: { tone?: Tone; action?: Toast['action'] } = {}) => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list.slice(-2), { id, text, tone: opts.tone ?? 'ok', action: opts.action }]);
    window.setTimeout(() => dismiss(id), opts.tone === 'error' ? 7000 : 3800);
  }, []);
  const value = useMemo(() => push, [push]);
  return (
    <Ctx.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:px-6"
      >
        {toasts.map((toast) => {
          const Icon = toast.tone === 'error' ? TriangleAlert : toast.tone === 'info' ? Info : CheckCircle2;
          return (
            <div
              key={toast.id}
              role={toast.tone === 'error' ? 'alert' : 'status'}
              className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-xl border border-white/[0.08] bg-ink-800/95 px-3.5 py-2.5 text-[13px] text-ink-100 shadow-2xl backdrop-blur animate-fade-up"
            >
              <Icon className={`size-4 shrink-0 ${toast.tone === 'error' ? 'text-rose-300' : toast.tone === 'info' ? 'text-sky-300' : 'text-leaf-400'}`} />
              <span className="min-w-0 flex-1">{toast.text}</span>
              {toast.action && (
                <button type="button" className="font-medium text-leaf-300 hover:text-leaf-200" onClick={() => { toast.action!.run(); dismiss(toast.id); }}>
                  {toast.action.label}
                </button>
              )}
              <button type="button" aria-label={t('common.close')} className="text-ink-400 hover:text-ink-100" onClick={() => dismiss(toast.id)}>
                <X className="size-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </Ctx.Provider>
  );
}

export const useToast = () => useContext(Ctx);

export function errorText(e: unknown): string {
  if (e instanceof DOMException && e.name === 'QuotaExceededError') return t('common.errors.storageFull');
  return e instanceof Error ? e.message : t('common.errors.unknown');
}

