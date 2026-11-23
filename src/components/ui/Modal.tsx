import { X } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl';
}

const widths = { sm: 'sm:max-w-md', md: 'sm:max-w-xl', lg: 'sm:max-w-3xl', xl: 'sm:max-w-5xl' };

/**
 * Barrierearmer Dialog auf Basis von <dialog> (Fokusfalle, Esc, Hintergrund inert).
 * Auf Mobilgeräten als Bottom-Sheet, auf Desktop zentriert.
 */
export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }: ModalProps) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  if (!open) return null;
  return (
    <dialog
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={`m-0 mt-auto flex max-h-[92dvh] w-full max-w-full flex-col rounded-t-2xl border border-white/[0.08] bg-ink-900 p-0 text-ink-100 shadow-2xl backdrop:bg-black/70 backdrop:backdrop-blur-sm sm:m-auto sm:max-h-[88dvh] sm:rounded-2xl ${widths[size]} animate-fade-up`}
    >
      <header className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-ink-50">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[13px] text-ink-400">{subtitle}</p>}
        </div>
        <button type="button" onClick={onClose} aria-label="Schließen" className="btn-ghost -mr-1 p-1.5">
          <X className="size-4" />
        </button>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
      {footer && (
        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-white/[0.06] px-5 py-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom))] sm:pb-3.5">
          {footer}
        </footer>
      )}
    </dialog>
  );
}
