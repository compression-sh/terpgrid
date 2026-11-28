/**
 * Befehlspalette (Strg/⌘ + K): Navigation, Aktionen und Suche.
 * - Eigene Daten: nur lokal auf den geladenen Daten des angemeldeten Kontos.
 * - Wissen: lokal (Cannabis-101-Artikel sind Teil der App).
 * - Katalog/Breeder (nur Servermodus mit importiertem Katalog): Anfrage an die EIGENE
 *   Instanz, nie an Dritte; persönliche Daten werden dabei nicht gesendet.
 */
import { BookOpen, BookOpenText, CornerDownLeft, Dna, FlaskConical, FlaskRound, Leaf, Loader2, LogOut, NotebookPen, Package, Plus, RefreshCw, Search, ShieldCheck, Sprout, Bell, Users } from 'lucide-react';
import type { GlossaryTerm } from '../lib/academy/glossary';
import type { KbArticle } from '../lib/knowledge';
import { type LibBreeder, type LibCultivar, library } from '../lib/catalog/library';
import { useLibraryStatus } from './library';
import { type ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { searchRecords, type SearchHit, normalize } from '../lib/search';
import { useAuth } from './auth';
import { useConfirm } from './Confirm';
import { useData } from './DataProvider';
import { ALL_NAV, DISCOVER_SECTIONS } from './nav';
import { useQuickActions } from './QuickActions';
import { navigate } from './router';
import { logoutFlow } from './SyncIndicator';
import { t, useLocale } from '../i18n';

interface Item {
  id: string;
  group: 'data' | 'catalog' | 'breeders' | 'knowledge' | 'glossary' | 'atlas' | 'actions' | 'navigation';
  label: string;
  hint?: string;
  icon: ReactNode;
  run: () => void;
}

const KIND_ICON: Record<SearchHit['kind'], ReactNode> = {
  grow: <Sprout className="size-4" />,
  plant: <Sprout className="size-4" />,
  strain: <Leaf className="size-4" />,
  journal: <BookOpenText className="size-4" />,
  inventory: <Package className="size-4" />,
  labReport: <FlaskRound className="size-4" />,
  reminder: <Bell className="size-4" />,
};

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const { data } = useData();
  const quick = useQuickActions();
  const auth = useAuth();
  const confirm = useConfirm();
  const server = auth.state.kind === 'authenticated';
  const admin = server && auth.state.kind === 'authenticated' && auth.state.user.role === 'admin';
  const lib = useLibraryStatus();
  // Wissensartikel erst beim Öffnen laden (hält das Start-Bundle klein)
  const [articles, setArticles] = useState<KbArticle[]>([]);
  const catLabel = useRef<(c: string) => string>((c) => c);
  const [glossary, setGlossary] = useState<{ search: (q: string) => GlossaryTerm[] } | null>(null);
  const [terps, setTerps] = useState<{ id: string; name: string; aliases: string[]; className: string }[]>([]);
  useEffect(() => {
    if (open && !articles.length) void import('../lib/knowledge').then((m) => {
      catLabel.current = m.categoryLabel;
      setArticles(m.KB_ARTICLES);
    });
    if (open && !glossary) void import('../lib/academy/glossary').then((m) => setGlossary({ search: m.searchGlossary }));
    if (open && !terps.length) void import('../lib/catalog/terpenes').then((m) => setTerps(m.TERPENES));
  }, [open, articles.length, glossary, terps.length]);
  const [remote, setRemote] = useState<{ q: string; cultivars: LibCultivar[]; breeders: LibBreeder[]; loading: boolean }>({ q: '', cultivars: [], breeders: [], loading: false });
  useEffect(() => {
    const term = q.trim();
    if (!open || !lib || term.length < 2) return setRemote({ q: '', cultivars: [], breeders: [], loading: false });
    const c = new AbortController();
    setRemote((r) => ({ ...r, loading: true }));
    const t = window.setTimeout(() => {
      Promise.all([library.search({ q: term, perPage: 5 }, c.signal), library.breeders({ q: term, perPage: 3 }, c.signal)])
        .then(([s, b]) => setRemote({ q: term, cultivars: s.items, breeders: b.items, loading: false }))
        .catch(() => !c.signal.aborted && setRemote({ q: term, cultivars: [], breeders: [], loading: false }));
    }, 220);
    return () => {
      window.clearTimeout(t);
      c.abort();
    };
  }, [q, open, lib]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('terpgrid:palette', onOpen);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('terpgrid:palette', onOpen);
    };
  }, []);
  // Fokus sofort beim Öffnen (Layout-Phase), damit direkt getippte Zeichen nicht verloren gehen.
  useLayoutEffect(() => {
    if (open) {
      setQ('');
      setActive(0);
      inputRef.current?.focus();
    }
  }, [open]);

  const locale = useLocale();
  const items = useMemo<Item[]>(() => {
    const close = (fn: () => void) => () => {
      setOpen(false);
      fn();
    };
    const nav: Item[] = [...ALL_NAV, ...DISCOVER_SECTIONS]
      .filter((n) => !n.serverOnly || server)
      .map((n) => {
        const Icon = n.icon;
        return { id: `nav-${n.id}`, group: 'navigation', label: n.label, icon: <Icon className="size-4" />, run: close(() => navigate(n.to)) };
      });
    if (server) {
      nav.push({ id: 'nav-privacy', group: 'navigation', label: t('shell.palette.privacy'), icon: <ShieldCheck className="size-4" />, run: close(() => { navigate('account'); setTimeout(() => document.getElementById('datenschutz')?.scrollIntoView(), 300); }) });
      nav.push({ id: 'nav-sync', group: 'navigation', label: t('shell.palette.sync'), icon: <RefreshCw className="size-4" />, run: close(() => navigate('account/sync')) });
      if (admin) nav.push({ id: 'nav-admin', group: 'navigation', label: t('shell.palette.admin'), icon: <Users className="size-4" />, run: close(() => navigate('admin')) });
    }
    const actions: Item[] = [
      { id: 'a-log', group: 'actions', label: t('shell.newMenu.log'), icon: <NotebookPen className="size-4" />, run: close(() => quick({ kind: 'log' })) },
      { id: 'a-grow', group: 'actions', label: t('shell.newMenu.grow'), icon: <Plus className="size-4" />, run: close(() => quick({ kind: 'grow' })) },
      { id: 'a-plant', group: 'actions', label: t('shell.newMenu.plant'), icon: <Plus className="size-4" />, run: close(() => quick({ kind: 'plant' })) },
      { id: 'a-photo', group: 'actions', label: t('shell.newMenu.photo'), icon: <Plus className="size-4" />, run: close(() => quick({ kind: 'photo' })) },
      { id: 'a-journal', group: 'actions', label: t('shell.newMenu.journal'), icon: <Plus className="size-4" />, run: close(() => quick({ kind: 'journal' })) },
    ];
    if (server) {
      actions.push({ id: 'a-sync', group: 'actions', label: t('shell.palette.syncNow'), icon: <RefreshCw className="size-4" />, run: close(() => auth.engine?.schedule(0)) });
      actions.push({ id: 'a-logout', group: 'actions', label: t('shell.palette.logout'), icon: <LogOut className="size-4" />, run: close(() => void logoutFlow(auth, confirm)) });
    }
    const query = normalize(q);
    const match = (i: Item) => !query || query.split(/\s+/).every((w) => normalize(i.label).includes(w));
    const records: Item[] = searchRecords(data, q, 12).map((h) => ({
      id: `r-${h.kind}-${h.id}`,
      group: 'data',
      label: h.title,
      hint: h.subtitle,
      icon: KIND_ICON[h.kind],
      run: close(() => navigate(h.to)),
    }));
    const catalogItems: Item[] = remote.q && remote.q === q.trim() ? remote.cultivars.map((c) => ({ id: `c-${c.id}`, group: 'catalog', label: c.version ? `${c.name} (${c.version})` : c.name, hint: c.breeder.name + (c.auto ? ' · Auto' : ''), icon: <Dna className="size-4" />, run: close(() => navigate(`discover/cultivar/${c.id}`)) })) : [];
    if (catalogItems.length && remote.q) catalogItems.push({ id: 'c-all', group: 'catalog', label: t('shell.palette.allMatches', { q: remote.q }), icon: <Search className="size-4" />, run: close(() => navigate(`discover?q=${encodeURIComponent(remote.q)}`)) });
    const breederItems: Item[] = remote.q && remote.q === q.trim() ? remote.breeders.map((b) => ({ id: `b-${b.id}`, group: 'breeders', label: b.name, hint: t('shell.palette.strainCount', { count: b.cultivarCount }), icon: <Users className="size-4" />, run: close(() => navigate(`discover/breeders/${b.id}`)) })) : [];
    const knowledge: Item[] = query.length >= 2 ? articles.filter((a) => normalize(`${a.title} ${a.summary}`).includes(query)).slice(0, 4).map((a) => ({ id: `k-${a.id}`, group: 'knowledge', label: a.title, hint: `Academy · ${catLabel.current(a.category)}`, icon: <BookOpen className="size-4" />, run: close(() => navigate(`discover/learn/${a.id}`)) })) : [];
    const terms: Item[] = glossary
      ? glossary
          .search(q)
          .slice(0, 4)
          .map((g) => ({ id: `g-${g.id}`, group: 'glossary', label: g.term, hint: g.definition, icon: <BookOpen className="size-4" />, run: close(() => navigate(`discover/learn/${g.article}`)) }))
      : [];
    const atlas: Item[] =
      query.length >= 3
        ? terps
            .filter((t) => [t.name, ...t.aliases].some((a) => normalize(a).includes(query)))
            .slice(0, 3)
            .map((t) => ({ id: `t-${t.id}`, group: 'atlas', label: t.name, hint: t.className, icon: <FlaskConical className="size-4" />, run: close(() => navigate(`discover/terpenes/${t.id}`)) }))
        : [];
    return [...records, ...catalogItems, ...breederItems, ...knowledge, ...terms, ...atlas, ...actions.filter(match), ...nav.filter(match)];
    // Sprache als Abhängigkeit: übersetzte Beschriftungen nach einem Sprachwechsel neu berechnen
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, data, quick, auth, confirm, server, admin, remote, articles, glossary, terps, locale]);

  useEffect(() => {
    setActive(0);
  }, [q]);
  useEffect(() => {
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (!open) return null;
  let lastGroup = '';
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 px-3 pt-[12vh] backdrop-blur-sm" role="presentation" onMouseDown={(e) => e.target === e.currentTarget && setOpen(false)}>
      <div role="dialog" aria-modal="true" aria-label={t('shell.palette.title')} className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/[0.08] bg-ink-900 shadow-2xl animate-fade-up">
        <div className="flex items-center gap-2.5 border-b border-white/[0.06] px-4">
          <Search className="size-4 shrink-0 text-ink-500" />
          <input
            ref={inputRef}
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setOpen(false);
              else if (e.key === 'ArrowDown') {
                e.preventDefault();
                setActive((a) => Math.min(items.length - 1, a + 1));
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setActive((a) => Math.max(0, a - 1));
              } else if (e.key === 'Enter') {
                e.preventDefault();
                items[active]?.run();
              }
            }}
            placeholder={t('shell.palette.placeholder')}
            className="h-12 w-full bg-transparent text-[14px] text-ink-50 outline-none placeholder:text-ink-500"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-list"
            aria-activedescendant={items[active] ? `palette-${items[active].id}` : undefined}
            autoComplete="off"
            spellCheck={false}
          />
          <kbd className="hidden rounded border border-white/10 px-1.5 py-0.5 text-[10px] text-ink-500 sm:block">Esc</kbd>
        </div>
        <ul id="palette-list" ref={listRef} role="listbox" className="max-h-[55vh] overflow-y-auto p-1.5">
          {items.length === 0 && (
            <li className="px-4 py-7 text-center">
              <div className="text-[13px] text-ink-300">{t('shell.palette.noMatches', { q })}</div>
              <div className="mt-1 text-[12px] text-ink-500">{t('shell.palette.scope')}</div>
            </li>
          )}
          {items.map((it, i) => {
            const header = it.group !== lastGroup ? it.group : null;
            lastGroup = it.group;
            return (
              <li key={it.id} role="presentation">
                {header && <div className="px-3 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-500">{t(`shell.palette.group.${header}`)}</div>}
                <div
                  id={`palette-${it.id}`}
                  role="option"
                  aria-selected={i === active}
                  data-index={i}
                  onMouseMove={() => setActive(i)}
                  onClick={it.run}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-[13.5px] ${i === active ? 'bg-white/[0.06] text-ink-50' : 'text-ink-200'}`}
                >
                  <span className={i === active ? 'text-leaf-300' : 'text-ink-500'}>{it.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{it.label}</span>
                  {it.hint && <span className="hidden truncate text-[11.5px] text-ink-500 sm:block">{it.hint}</span>}
                  {i === active && <CornerDownLeft className="size-3.5 text-ink-500" />}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex items-center justify-between border-t border-white/[0.05] px-4 py-2 text-[11px] text-ink-500">
          <span className="inline-flex items-center gap-1.5">
            {remote.loading && <Loader2 className="size-3 animate-spin" />}
            {lib ? t('shell.palette.footerServer') : t('shell.palette.footerLocal')}
          </span>
          <span className="hidden sm:inline">{t('shell.palette.keys')}</span>
        </div>
      </div>
    </div>
  );
}
