import { GraduationCap, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { href } from '../../app/router';
import type { KbArticle } from '../../lib/knowledge';
import { t } from '../../i18n';

const isNarrow = () => typeof window !== 'undefined' && window.matchMedia('(max-width: 639px)').matches;

/**
 * Kontextuelle Hilfe: kleiner Hinweis mit passenden Academy-Artikeln.
 * Desktop: Aufklappmenü unter der Schaltfläche. Schmale Bildschirme: Leiste am unteren Rand (per Portal,
 * damit sie nicht von transformierten Vorfahren beschnitten wird). Artikel werden erst beim Öffnen geladen.
 */
export function ContextHelp({ ids, label = t('discover.help.background') }: { ids: string[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<KbArticle[]>([]);
  const rootRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  useEffect(() => {
    if (!open || items.length) return;
    void import('../../lib/knowledge').then((m) => setItems(ids.map((id) => m.KB_ARTICLES.find((a) => a.id === id)).filter((a): a is KbArticle => !!a)));
  }, [open, ids, items.length]);

  // Schließen mit Escape oder Klick außerhalb
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || document.getElementById(panelId)?.contains(t)) return;
      setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onDown);
    };
  }, [open, panelId]);

  const body = (
    <>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-500">{t('discover.help.fromAcademy')}</p>
        <button type="button" className="rounded p-1 text-ink-500 hover:text-ink-100" aria-label={t('common.close')} onClick={() => setOpen(false)}>
          <X className="size-3.5" />
        </button>
      </div>
      {items.length === 0 ? (
        <p className="hint">{t('discover.help.loading')}</p>
      ) : (
        <ul className="space-y-2">
          {items.map((a) => (
            <li key={a.id}>
              <a href={href(`discover/learn/${a.id}`)} className="block rounded-lg p-2 hover:bg-white/[0.04]" onClick={() => setOpen(false)}>
                <span className="block text-[13px] font-medium text-ink-100">{a.title}</span>
                <span className="mt-0.5 line-clamp-2 block text-[12px] leading-relaxed text-ink-400">{a.summary}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
    </>
  );

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 py-1 text-[12px] text-ink-300 hover:border-leaf-500/30 hover:text-leaf-200"
      >
        <GraduationCap className="size-3.5" /> {label}
      </button>
      {open &&
        (isNarrow() ? (
          createPortal(
            <div id={panelId} role="dialog" aria-label={t('discover.help.fromAcademy')} className="fixed inset-x-3 bottom-20 z-[60] max-h-[65vh] overflow-y-auto rounded-xl border border-white/[0.1] bg-ink-900 p-3 shadow-2xl">
              {body}
            </div>,
            document.body,
          )
        ) : (
          <div id={panelId} role="dialog" aria-label={t('discover.help.fromAcademy')} className="absolute right-0 z-30 mt-2 w-[22rem] rounded-xl border border-white/[0.08] bg-ink-900 p-3 shadow-2xl">
            {body}
          </div>
        ))}
    </div>
  );
}
