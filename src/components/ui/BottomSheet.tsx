import { X } from 'lucide-react';
import { type PointerEvent as ReactPointerEvent, type ReactNode, useEffect, useRef, useState } from 'react';

/**
 * Bottom Sheet (mobil von unten, Desktop zentriert) auf Basis von <dialog>:
 * Fokusfalle, Esc, Hintergrund inert. Zusätzlich: Griff zum Herunterwischen (Schließen).
 * Wischen ist immer optional – Schließen-Knopf und Esc funktionieren ebenso (WCAG 2.5.7).
 */
export function BottomSheet({ title, onClose, children, footer }: { title: ReactNode; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const start = useRef<number | null>(null);
  const [dy, setDy] = useState(0);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);
  const down = (e: ReactPointerEvent) => {
    if (e.pointerType === 'mouse') return;
    start.current = e.clientY;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: ReactPointerEvent) => {
    if (start.current === null) return;
    setDy(Math.max(0, e.clientY - start.current));
  };
  const up = () => {
    if (start.current === null) return;
    start.current = null;
    if (dy > 90) onClose();
    setDy(0);
  };
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
      style={dy ? { transform: `translateY(${dy}px)`, transition: 'none' } : undefined}
      className="m-0 mt-auto flex max-h-[88dvh] w-full max-w-full flex-col rounded-t-2xl border border-white/[0.08] bg-ink-900 p-0 text-ink-100 shadow-2xl transition-transform backdrop:bg-black/70 backdrop:backdrop-blur-sm sm:m-auto sm:max-w-lg sm:rounded-2xl animate-fade-up"
    >
      <div className="touch-none select-none sm:hidden" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up}>
        <div className="mx-auto mt-2 h-1.5 w-10 rounded-full bg-white/20" aria-hidden="true" />
      </div>
      <header className="flex items-center justify-between gap-3 px-5 pt-3 pb-2 sm:pt-4">
        <h2 className="text-[15px] font-semibold tracking-tight text-ink-50">{title}</h2>
        <button type="button" onClick={onClose} aria-label="Schließen" className="btn-ghost -mr-1 p-1.5">
          <X className="size-4" />
        </button>
      </header>
      <div className={`sheet-scroll min-h-0 flex-1 overflow-y-auto px-4 pt-1 ${footer ? 'pb-4' : 'pb-[calc(1rem+env(safe-area-inset-bottom))]'}`}>{children}</div>
      {footer && <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-white/[0.06] px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-3">{footer}</footer>}
    </dialog>
  );
}
