import { GraduationCap } from 'lucide-react';
import { useEffect, useState } from 'react';
import { href } from '../../app/router';
import type { KbArticle } from '../../lib/knowledge';

/**
 * Kontextuelle Hilfe: kleiner, aufklappbarer Hinweis mit passenden Academy-Artikeln.
 * Artikel werden erst beim Öffnen nachgeladen (kein Einfluss auf das Start-Bundle).
 */
export function ContextHelp({ ids, label = 'Hintergrund' }: { ids: string[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<KbArticle[]>([]);
  useEffect(() => {
    if (!open || items.length) return;
    void import('../../lib/knowledge').then((m) => setItems(ids.map((id) => m.KB_ARTICLES.find((a) => a.id === id)).filter((a): a is KbArticle => !!a)));
  }, [open, ids, items.length]);
  return (
    <details className="group relative inline-block" onToggle={(e) => setOpen((e.target as HTMLDetailsElement).open)}>
      <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 rounded-lg border border-white/[0.08] px-2.5 py-1 text-[12px] text-ink-300 hover:border-leaf-500/30 hover:text-leaf-200 [&::-webkit-details-marker]:hidden">
        <GraduationCap className="size-3.5" /> {label}
      </summary>
      <div className="fixed inset-x-4 bottom-4 z-50 max-h-[70vh] overflow-y-auto rounded-xl border border-white/[0.08] bg-ink-900 p-3 shadow-2xl sm:absolute sm:inset-x-auto sm:bottom-auto sm:right-0 sm:mt-2 sm:w-[22rem]">
        <p className="mb-2 text-[10.5px] font-semibold uppercase tracking-[0.14em] text-ink-500">Aus der Academy</p>
        {items.length === 0 ? (
          <p className="hint">Wird geladen …</p>
        ) : (
          <ul className="space-y-2">
            {items.map((a) => (
              <li key={a.id}>
                <a href={href(`discover/learn/${a.id}`)} className="block rounded-lg p-2 hover:bg-white/[0.04]">
                  <span className="block text-[13px] font-medium text-ink-100">{a.title}</span>
                  <span className="mt-0.5 line-clamp-2 block text-[12px] leading-relaxed text-ink-400">{a.summary}</span>
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  );
}
