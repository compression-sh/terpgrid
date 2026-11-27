import { Download, FileJson, FileSpreadsheet, FileText, Printer } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { type ExportPayload, exportPayload } from '../../lib/exporters';
import { t } from '../../i18n';

export function ExportMenu({ build }: { build: () => ExportPayload }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const item = (icon: React.ReactNode, label: string, run: () => void) => (
    <button
      type="button"
      role="menuitem"
      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-[13px] text-ink-200 hover:bg-white/[0.05] hover:text-ink-50"
      onClick={() => {
        run();
        setOpen(false);
      }}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="relative no-print" ref={ref}>
      <button type="button" className="btn-ghost py-1.5" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Download className="size-4" aria-hidden />
        <span className="hidden sm:inline">{t('common.export.title')}</span>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-2 w-48 rounded-xl border border-white/[0.08] bg-ink-850 p-1 shadow-2xl animate-fade-up">
          {item(<FileSpreadsheet className="size-4 text-leaf-400" />, t('common.export.csv'), () => exportPayload(build(), 'csv'))}
          {item(<FileJson className="size-4 text-leaf-400" />, 'JSON', () => exportPayload(build(), 'json'))}
          {item(<FileText className="size-4 text-leaf-400" />, t('common.export.text'), () => exportPayload(build(), 'txt'))}
          {item(<Printer className="size-4 text-leaf-400" />, t('common.export.print'), () => window.print())}
        </div>
      )}
    </div>
  );
}
