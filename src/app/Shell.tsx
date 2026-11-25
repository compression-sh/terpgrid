import { Lock, MoreHorizontal, Plus, Search, X } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { LogoMark, Wordmark } from '../components/brand/Logo';
import { MOBILE_NAV_IDS, type NavItem, PRIMARY_NAV, SECONDARY_NAV, isActive } from './nav';
import { useQuickActions } from './QuickActions';
import { useAuth } from './auth';
import { AccountFooter, SyncPill } from './SyncIndicator';
import { CommandPalette } from './CommandPalette';
import { href, useRoute } from './router';

function SideLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <a
      href={href(item.to)}
      aria-current={active ? 'page' : undefined}
      className={`group relative flex items-center gap-3 rounded-lg px-3 py-[7px] text-[13px] font-medium transition-colors ${
        active ? 'bg-white/[0.06] text-ink-50' : 'text-ink-400 hover:bg-white/[0.03] hover:text-ink-100'
      }`}
    >
      {active && <span className="absolute inset-y-2 -left-3 w-0.5 rounded-full bg-leaf-400" />}
      <Icon className={`size-4 shrink-0 ${active ? 'text-leaf-400' : 'text-ink-500 group-hover:text-ink-300'}`} />
      {item.label}
    </a>
  );
}

function QuickAddMenu({ align = 'right' }: { align?: 'right' | 'left' }) {
  const quick = useQuickActions();
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
  const item = (label: string, run: () => void) => (
    <button
      type="button"
      role="menuitem"
      className="w-full rounded-md px-3 py-2 text-left text-[13px] text-ink-200 hover:bg-white/[0.05] hover:text-ink-50"
      onClick={() => {
        setOpen(false);
        run();
      }}
    >
      {label}
    </button>
  );
  return (
    <div className="relative" ref={ref}>
      <button type="button" className="btn-primary w-full py-1.5" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Plus className="size-4" /> Neu
      </button>
      {open && (
        <div role="menu" className={`absolute z-40 mt-2 w-52 rounded-xl border border-white/[0.08] bg-ink-850 p-1 shadow-2xl animate-fade-up ${align === 'right' ? 'right-0' : 'left-0'}`}>
          {item('Schnell-Log (Beobachtung, Messung)', () => quick({ kind: 'log' }))}
          {item('Neuer Grow', () => quick({ kind: 'grow' }))}
          {item('Pflanze hinzufügen', () => quick({ kind: 'plant' }))}
          {item('Foto hochladen', () => quick({ kind: 'photo' }))}
          {item('Journal-Eintrag', () => quick({ kind: 'journal' }))}
        </div>
      )}
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const route = useRoute();
  const { state } = useAuth();
  const modeLine = state.kind === 'local' ? 'Lokalmodus: Daten nur auf diesem Gerät' : 'Konto & Datenschutz · Self-hosted';
  const [moreOpen, setMoreOpen] = useState(false);
  const mobileItems = MOBILE_NAV_IDS.map((id) => PRIMARY_NAV.find((n) => n.id === id)!);
  const moreItems = [...PRIMARY_NAV.filter((n) => !MOBILE_NAV_IDS.includes(n.id)), ...SECONDARY_NAV];
  const moreActive = moreItems.some((i) => isActive(i, route.path));

  // Seitenwechsel → nach oben scrollen und Mehr-Menü schließen.
  useEffect(() => {
    setMoreOpen(false);
    window.scrollTo({ top: 0 });
  }, [route.path.join('/')]);

  return (
    <div className="min-h-dvh lg:pl-60">
      {/* Desktop-Seitenleiste */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-white/[0.05] bg-ink-950/90 backdrop-blur-xl lg:flex">
        <a href={href('')} className="flex items-center gap-3 px-5 pt-6 pb-5">
          <LogoMark className="size-9 shrink-0" />
          <Wordmark />
        </a>
        <div className="space-y-2 px-4 pb-3">
          <QuickAddMenu align="left" />
          <button
            type="button"
            onClick={() => window.dispatchEvent(new Event('terpgrid:palette'))}
            className="flex w-full items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-1.5 text-[12.5px] text-ink-400 hover:border-white/[0.12] hover:text-ink-200"
          >
            <Search className="size-3.5" /> Suchen …
            <kbd className="ml-auto rounded border border-white/10 px-1 text-[10px]">Strg K</kbd>
          </button>
        </div>
        <nav aria-label="Hauptnavigation" className="flex-1 space-y-5 overflow-y-auto px-4 pt-2 pb-6 [mask-image:linear-gradient(to_bottom,black_calc(100%-28px),transparent)]">
          <div className="space-y-0.5">
            {PRIMARY_NAV.map((n) => (
              <SideLink key={n.id} item={n} active={isActive(n, route.path)} />
            ))}
          </div>
          <div>
            <div className="mb-1.5 px-3 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">Werkzeuge</div>
            <div className="space-y-0.5">
              {SECONDARY_NAV.map((n) => (
                <SideLink key={n.id} item={n} active={isActive(n, route.path)} />
              ))}
            </div>
          </div>
        </nav>
        <AccountFooter />
      </aside>

      {/* Mobile Kopfzeile */}
      <header className="no-print sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-white/[0.05] bg-ink-950/85 px-4 py-3 backdrop-blur-xl lg:hidden">
        <a href={href('')} className="flex min-w-0 items-center gap-2.5">
          <LogoMark className="size-8 shrink-0" />
          <Wordmark withTagline={false} />
        </a>
        <div className="flex items-center gap-2">
          <button type="button" className="btn-ghost p-1.5" aria-label="Suchen" onClick={() => window.dispatchEvent(new Event('terpgrid:palette'))}>
            <Search className="size-4" />
          </button>
          <SyncPill compact />
          <div className="w-24">
            <QuickAddMenu />
          </div>
        </div>
      </header>

      <CommandPalette />
      <main id="main" className="mx-auto w-full max-w-6xl px-4 pt-5 pb-[calc(6.5rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-10 lg:pt-9 lg:pb-16">
        {children}
      </main>

      {/* Mobile untere Navigation */}
      <nav
        aria-label="Hauptnavigation"
        className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.06] bg-ink-950/92 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden"
      >
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {mobileItems.map((n) => {
            const active = isActive(n, route.path);
            const Icon = n.icon;
            return (
              <li key={n.id}>
                <a
                  href={href(n.to)}
                  aria-current={active ? 'page' : undefined}
                  className={`flex min-h-[3.5rem] flex-col items-center justify-center gap-1 text-[10.5px] font-medium ${active ? 'text-leaf-300' : 'text-ink-400'}`}
                >
                  <Icon className="size-5" />
                  <span className="max-w-full truncate px-1">{n.label}</span>
                </a>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-expanded={moreOpen}
              className={`flex min-h-[3.5rem] w-full flex-col items-center justify-center gap-1 text-[10.5px] font-medium ${moreActive ? 'text-leaf-300' : 'text-ink-400'}`}
            >
              <MoreHorizontal className="size-5" />
              Mehr
            </button>
          </li>
        </ul>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Weitere Bereiche">
          <button type="button" aria-label="Schließen" className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setMoreOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl border-t border-white/[0.08] bg-ink-900 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] animate-fade-up">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-ink-50">Alle Bereiche</span>
              <button type="button" className="btn-ghost p-1.5" aria-label="Schließen" onClick={() => setMoreOpen(false)}>
                <X className="size-4" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {moreItems.map((n) => {
                const Icon = n.icon;
                const active = isActive(n, route.path);
                return (
                  <a
                    key={n.id}
                    href={href(n.to)}
                    onClick={() => setMoreOpen(false)}
                    className={`flex min-h-[4.5rem] flex-col items-center justify-center gap-1.5 rounded-xl border text-center text-[12px] font-medium ${
                      active ? 'border-leaf-500/30 bg-leaf-500/10 text-leaf-200' : 'border-white/[0.06] bg-white/[0.02] text-ink-200'
                    }`}
                  >
                    <Icon className="size-5" />
                    {n.label}
                  </a>
                );
              })}
            </div>
            <a href={href('account')} onClick={() => setMoreOpen(false)} className="mt-3 flex items-center justify-center gap-1.5 rounded-xl border border-white/[0.06] py-2.5 text-[12px] text-ink-300">
              <Lock className="size-3.5" /> {modeLine}
            </a>
          </div>
        </div>
      )}
    </div>
  );
}
