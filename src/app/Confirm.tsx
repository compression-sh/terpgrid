import { type ReactNode, createContext, useCallback, useContext, useRef, useState } from 'react';
import { Modal } from '../components/ui/Modal';

interface ConfirmOptions {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'danger' | 'default';
}

const Ctx = createContext<(o: ConfirmOptions) => Promise<boolean>>(async () => false);

/** Promise-basierte Bestätigung für destruktive Aktionen. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [opts, setOpts] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(v: boolean) => void>(() => {});
  const confirm = useCallback(
    (o: ConfirmOptions) =>
      new Promise<boolean>((resolve) => {
        resolver.current = resolve;
        setOpts(o);
      }),
    [],
  );
  const close = (v: boolean) => {
    resolver.current(v);
    setOpts(null);
  };
  return (
    <Ctx.Provider value={confirm}>
      {children}
      <Modal
        open={!!opts}
        onClose={() => close(false)}
        title={opts?.title}
        size="sm"
        footer={
          <>
            <button type="button" className="btn-ghost" onClick={() => close(false)}>
              {opts?.cancelLabel ?? 'Abbrechen'}
            </button>
            <button
              type="button"
              autoFocus
              className={opts?.tone === 'danger' ? 'btn bg-rose-500/90 text-white hover:bg-rose-500' : 'btn-primary'}
              onClick={() => close(true)}
            >
              {opts?.confirmLabel ?? 'Bestätigen'}
            </button>
          </>
        }
      >
        <div className="text-[13px] leading-relaxed text-ink-300">{opts?.message}</div>
      </Modal>
    </Ctx.Provider>
  );
}

export const useConfirm = () => useContext(Ctx);
