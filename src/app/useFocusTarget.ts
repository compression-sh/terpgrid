import { useEffect } from 'react';
import { useRoute } from './router';

/** DOM-ID eines anspringbaren Eintrags (z. B. aus der Suche). */
export const focusId = (kind: string, id: string) => `ziel-${kind}-${id}`;

/**
 * Springt zu dem Eintrag, dessen ID im Query-Parameter steht (z. B. „journal?entry=…“),
 * und hebt ihn kurz hervor. Rein lokal; ohne Treffer passiert nichts.
 */
export function useFocusTarget(kind: string, param: string, ready = true) {
  const route = useRoute();
  const target = route.query.get(param);
  useEffect(() => {
    if (!target || !ready) return;
    let tries = 0;
    let timer = 0;
    const attempt = () => {
      const el = document.getElementById(focusId(kind, target));
      if (!el) {
        if (++tries < 20) timer = window.setTimeout(attempt, 100);
        return;
      }
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
      el.setAttribute('data-focus-target', '');
      if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
      el.focus({ preventScroll: true });
      timer = window.setTimeout(() => el.removeAttribute('data-focus-target'), 2600);
    };
    attempt();
    return () => window.clearTimeout(timer);
  }, [kind, target, ready]);
}
