/**
 * Mobile Bausteine der App-Hülle (Phase 5.6): Scroll-Wiederherstellung beim Zurückgehen, App-Verknüpfungen und Ziehen zum Aktualisieren.
 */
import { Loader2, RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { type Action, useQuickActions } from './QuickActions';
import { useAuth } from './auth';
import { type Route, setQuery } from './router';
import { isStandalone } from '../lib/pwa/pwa';

const CAPTURE_PARAM: Record<string, Action['kind']> = { log: 'log', photo: 'photo', journal: 'journal', task: 'task', capture: 'capture' };

/** App-Verknüpfungen (Manifest „shortcuts“): ?erfassen=log|photo|… öffnet die Schnellerfassung. */
export function useCaptureShortcut(route: Route) {
  const quick = useQuickActions();
  const want = route.query.get('erfassen');
  useEffect(() => {
    if (!want) return;
    const kind = CAPTURE_PARAM[want];
    setQuery(route, { erfassen: undefined });
    if (kind) quick({ kind } as Action);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [want]);
}

/**
 * Scroll-Position: Neue Seite → nach oben. Zurück/Vor (Verlauf) → vorherige Position.
 * Positionen nur im Arbeitsspeicher dieses Tabs.
 */
export function useScrollRestoration(key: string) {
  const positions = useRef(new Map<string, number>());
  const fromHistory = useRef(false);
  const current = useRef(key);
  useEffect(() => {
    const onPop = () => (fromHistory.current = true);
    const onScroll = () => positions.current.set(current.current, window.scrollY);
    window.addEventListener('popstate', onPop);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('scroll', onScroll);
    };
  }, []);
  useEffect(() => {
    current.current = key;
    const target = fromHistory.current ? (positions.current.get(key) ?? 0) : 0;
    fromHistory.current = false;
    // Hinweis: window.scrollTo() liefert in neueren Browsern ein Promise – nie aus dem Effekt zurückgeben
    if (target === 0) {
      window.scrollTo({ top: 0 });
      return;
    }
    // Inhalte (Listen, Bilder) brauchen ggf. einige Frames bis zur vollen Höhe
    let tries = 0;
    const tick = () => {
      window.scrollTo({ top: target });
      if (Math.abs(window.scrollY - target) > 2 && tries++ < 20) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [key]);
}

/**
 * Ziehen zum Aktualisieren – nur in der installierten App (dort fehlt die Browser-Geste),
 * nur am Seitenanfang und nur mit Server-Konto. Startet eine Synchronisation; ersetzt nie
 * den sichtbaren Knopf „Jetzt synchronisieren“ (Synchronisationsseite).
 */
export function PullToRefresh() {
  const { engine, state } = useAuth();
  const [pull, setPull] = useState(0);
  const [busy, setBusy] = useState(false);
  const startY = useRef<number | null>(null);
  const pullRef = useRef(0);
  const enabled = state.kind === 'authenticated' && !state.offline && !!engine && isStandalone();
  useEffect(() => {
    if (!enabled) return;
    const onStart = (e: TouchEvent) => {
      const t = e.target as HTMLElement | null;
      if (window.scrollY > 0 || t?.closest('dialog, [role="dialog"], input, textarea, select, [data-no-pull]')) return;
      startY.current = e.touches[0]?.clientY ?? null;
    };
    const onMove = (e: TouchEvent) => {
      if (startY.current === null) return;
      const d = (e.touches[0]?.clientY ?? 0) - startY.current;
      pullRef.current = d > 0 ? Math.min(d * 0.5, 90) : 0;
      setPull(pullRef.current);
    };
    const onEnd = () => {
      if (startY.current === null) return;
      startY.current = null;
      const p = pullRef.current;
      pullRef.current = 0;
      setPull(0);
      if (p >= 64) {
        setBusy(true);
        void engine!.syncNow().finally(() => setBusy(false));
      }
    };
    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd);
    window.addEventListener('touchcancel', onEnd);
    return () => {
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', onEnd);
    };
  }, [enabled, engine]);
  if (!enabled || (!pull && !busy)) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 top-[calc(3.75rem+env(safe-area-inset-top))] z-30 flex justify-center lg:hidden" role="status" aria-live="polite">
      <span className="flex items-center gap-2 rounded-full border border-white/[0.08] bg-ink-850/95 px-3 py-1.5 text-[12px] text-ink-200 shadow-xl" style={{ transform: `translateY(${busy ? 8 : pull / 3}px)`, opacity: busy ? 1 : Math.min(1, pull / 64) }}>
        {busy ? <Loader2 className="size-3.5 animate-spin text-leaf-300" /> : <RefreshCw className="size-3.5 text-leaf-300" style={{ transform: `rotate(${pull * 3}deg)` }} />}
        {busy ? 'Synchronisierung läuft' : pull >= 64 ? 'Loslassen zum Synchronisieren' : 'Zum Synchronisieren ziehen'}
      </span>
    </div>
  );
}
