import { MoreHorizontal, Plus, Search, X } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { LogoMark, Wordmark } from '../components/brand/Logo';
import { ALL_NAV, MOBILE_LABEL, MOBILE_NAV_IDS, type NavItem, SETTINGS_NAV, isActive, visibleGroups } from './nav';
import { useQuickActions } from './QuickActions';
import { useAuth } from './auth';
import { AccountFooter, SyncPill } from './SyncIndicator';
import { CommandPalette } from './CommandPalette';
import { NotificationBell } from '../components/collab/Notifications';
import { href, useRoute } from './router';
import { PullToRefresh, useCaptureShortcut, useScrollRestoration } from './mobile';
import { InstallCard, OfflineChoiceCard, UpdateBanner } from './pwaUi';

function SideLink({ item, active, small }: { item: NavItem; active: boolean; small?: boolean }) {
  const Icon = item.icon;
  return (
    <a
      href={href(item.to)}
      aria-current={active ? 'page' : undefined}
      className={`group flex items-center gap-2.5 rounded-md px-2.5 ${small ? 'py-[3px] text-[12.5px]' : 'py-[5px] text-[13px]'} font-medium transition-colors ${
        active ? 'bg-white/[0.06] text-ink-50' : 'text-ink-400 hover:bg-white/[0.03] hover:text-ink-100'
      }`}
    >
      <Icon className={`size-4 shrink-0 ${active ? 'text-leaf-400' : 'text-ink-500 group-hover:text-ink-300'}`} />
      {item.label}
    </a>
  );
}

/** Globale Schnellerfassung (Seitenleiste und Übersicht). */
export function QuickAddMenu({ align = 'right', full = true }: { align?: 'right' | 'left'; full?: boolean }) {
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
      <button type="button" className={`btn-primary py-1.5 ${full ? 'w-full' : ''}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Plus className="size-4" /> Neu
      </button>
      {open && (
        <div role="menu" className={`absolute z-40 mt-2 w-52 rounded-xl border border-white/[0.08] bg-ink-850 p-1 shadow-2xl animate-fade-up ${align === 'right' ? 'right-0' : 'left-0'}`}>
          {item('Schnell-Log (Beobachtung, Messung)', () => quick({ kind: 'log' }))}
          {item('Neuer Grow', () => quick({ kind: 'grow' }))}
          {item('Pflanze hinzufügen', () => quick({ kind: 'plant' }))}
          {item('Foto hochladen', () => quick({ kind: 'photo' }))}
          {item('Journal-Eintrag', () => quick({ kind: 'journal' }))}
          {item('Aufgabe / Erinnerung', () => quick({ kind: 'task' }))}
          {item('Sammlungsnotiz', () => quick({ kind: 'collection' }))}
          {item('Ausrüstungsnotiz', () => quick({ kind: 'equipment' }))}
          {item('Laborbericht', () => quick({ kind: 'labReport' }))}
        </div>
      )}
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const route = useRoute();
  const { state } = useAuth();
  const quick = useQuickActions();
  const [moreOpen, setMoreOpen] = useState(false);
  const server = state.kind === 'authenticated';
  const groups = visibleGroups(server);
  const settingsNav = SETTINGS_NAV.filter((n) => !n.serverOnly || server);
  const mobileItems = MOBILE_NAV_IDS.map((id) => ALL_NAV.find((n) => n.id === id)!);
  const inBar = new Set<string>(MOBILE_NAV_IDS);
  const moreGroups = [...groups.map((g) => ({ ...g, items: g.items.filter((n) => !inBar.has(n.id)) })), { id: 'settings', label: 'Einstellungen', items: settingsNav }].filter((g) => g.items.length > 0);
  const moreActive = moreGroups.some((g) => g.items.some((i) => isActive(i, route.path)));

  // Seitenwechsel → Mehr-Menü schließen; Scroll-Position: neu → oben, Zurück → wiederherstellen.
  const pathKey = route.path.join('/');
  useEffect(() => setMoreOpen(false), [pathKey]);
  useScrollRestoration(pathKey);
  useCaptureShortcut(route);
  useEffect(() => {
    if (!moreOpen) return;
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setMoreOpen(false);
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [moreOpen]);

  const tab = (n: NavItem) => {
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
          <span className="max-w-full truncate px-1">{MOBILE_LABEL[n.id] ?? n.label}</span>
        </a>
      </li>
    );
  };

  return (
    <div className="min-h-dvh lg:pl-60">
      {/* Desktop-Seitenleiste: Produktbereiche, darunter Einstellungen und Konto */}
      <aside className="no-print fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-white/[0.05] bg-ink-950 lg:flex">
        <a href={href('')} className="flex items-center gap-2.5 px-5 pt-4 pb-3" aria-label="TERPGRID – Übersicht">
          <LogoMark className="size-7 shrink-0" />
          <Wordmark withTagline={false} />
        </a>
        <div className="space-y-2 px-3 pb-2">
          <QuickAddMenu align="left" />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => window.dispatchEvent(new Event('terpgrid:palette'))}
              className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-white/[0.06] px-2.5 py-1.5 text-[12.5px] text-ink-400 hover:border-white/[0.12] hover:text-ink-200"
            >
              <Search className="size-3.5" /> Suchen …
              <kbd className="ml-auto rounded border border-white/10 px-1 text-[10px]">Strg K</kbd>
            </button>
            {server && <NotificationBell compact align="left" />}
          </div>
        </div>
        <nav aria-label="Hauptnavigation" className="flex-1 space-y-3 overflow-y-auto px-3 pt-2 pb-3">
          {groups.map((g) => (
            <div key={g.id} role="group" aria-labelledby={g.label ? `nav-${g.id}` : undefined}>
              {g.label && (
                <div id={`nav-${g.id}`} className="section-label mb-1 px-2.5">
                  {g.label}
                </div>
              )}
              <div className="space-y-px">
                {g.items.map((n) => (
                  <SideLink key={n.id} item={n} active={isActive(n, route.path)} />
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="space-y-px border-t border-white/[0.05] px-3 py-1.5">
          {settingsNav.map((n) => (
            <SideLink key={n.id} item={n} small active={isActive(n, route.path)} />
          ))}
        </div>
        <AccountFooter />
      </aside>

      {/* Mobile Kopfzeile */}
      <header className="no-print sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-white/[0.05] bg-ink-950/90 pt-[calc(0.6rem+env(safe-area-inset-top))] pr-[max(1rem,env(safe-area-inset-right))] pb-2.5 pl-[max(1rem,env(safe-area-inset-left))] backdrop-blur-xl lg:hidden">
        <a href={href('')} className="flex min-w-0 items-center gap-2" aria-label="TERPGRID – Übersicht">
          <LogoMark className="size-7 shrink-0" />
          <Wordmark withTagline={false} />
        </a>
        <div className="flex items-center gap-1.5">
          <button type="button" className="btn-ghost p-1.5" aria-label="Suchen" onClick={() => window.dispatchEvent(new Event('terpgrid:palette'))}>
            <Search className="size-4" />
          </button>
          <NotificationBell compact />
          <SyncPill compact />
        </div>
      </header>
      <PullToRefresh />

      <CommandPalette />
      <main id="main" className="mx-auto w-full max-w-6xl px-[max(1rem,env(safe-area-inset-left))] pt-5 pb-[calc(7rem+env(safe-area-inset-bottom))] sm:px-6 lg:px-10 lg:pt-8 lg:pb-16 2xl:max-w-7xl">
        <UpdateBanner />
        <OfflineChoiceCard />
        <InstallCard />
        {children}
      </main>

      {/* Mobile untere Navigation: Übersicht · Grows · Erfassen · Entdecken · Mehr */}
      <nav
        aria-label="Hauptnavigation"
        className="no-print fixed inset-x-0 bottom-0 z-40 border-t border-white/[0.06] bg-ink-950/95 pr-[env(safe-area-inset-right)] pb-[env(safe-area-inset-bottom)] pl-[env(safe-area-inset-left)] backdrop-blur-xl lg:hidden"
      >
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {tab(mobileItems[0]!)}
          {tab(mobileItems[1]!)}
          <li className="flex items-center justify-center">
            <button
              type="button"
              aria-label="Schnell erfassen"
              onClick={() => quick({ kind: 'capture' })}
              className="grid size-12 place-items-center rounded-2xl bg-leaf-500 text-ink-950 transition-transform active:scale-95"
            >
              <Plus className="size-6" strokeWidth={2.4} />
            </button>
          </li>
          {tab(mobileItems[2]!)}
          <li>
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-expanded={moreOpen}
              aria-haspopup="dialog"
              className={`flex min-h-[3.5rem] w-full flex-col items-center justify-center gap-1 text-[10.5px] font-medium ${moreActive ? 'text-leaf-300' : 'text-ink-400'}`}
            >
              <MoreHorizontal className="size-5" />
              Mehr
            </button>
          </li>
        </ul>
      </nav>

      {moreOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Alle Bereiche">
          <button type="button" aria-label="Schließen" className="absolute inset-0 bg-black/60" onClick={() => setMoreOpen(false)} />
          <div className="sheet-scroll absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-2xl border-t border-white/[0.08] bg-ink-900 px-4 pt-3 pb-[calc(1rem+env(safe-area-inset-bottom))] animate-fade-up">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-sm font-semibold text-ink-50">Alle Bereiche</span>
              <button type="button" className="btn-ghost p-1.5" aria-label="Schließen" onClick={() => setMoreOpen(false)}>
                <X className="size-4" />
              </button>
            </div>
            <div className="space-y-3">
              {moreGroups.map((g) => (
                <section key={g.id} aria-label={g.label}>
                  {g.label && <h3 className="section-label mb-1 px-1">{g.label}</h3>}
                  <ul className="grid grid-cols-2 gap-1.5">
                    {g.items.map((n) => {
                      const Icon = n.icon;
                      const active = isActive(n, route.path);
                      return (
                        <li key={n.id}>
                          <a
                            href={href(n.to)}
                            onClick={() => setMoreOpen(false)}
                            aria-current={active ? 'page' : undefined}
                            className={`flex min-h-11 items-center gap-2.5 rounded-lg px-3 text-[13px] font-medium ${active ? 'bg-leaf-500/10 text-leaf-200' : 'bg-white/[0.03] text-ink-200 active:bg-white/[0.06]'}`}
                          >
                            <Icon className={`size-4 shrink-0 ${active ? 'text-leaf-300' : 'text-ink-400'}`} />
                            <span className="min-w-0 truncate">{n.label}</span>
                          </a>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
            {state.kind === 'local' && <p className="hint mt-3 px-1">Lokalmodus: Daten nur auf diesem Gerät, keine Synchronisation.</p>}
          </div>
        </div>
      )}
    </div>
  );
}
