/**
 * PWA-Lebenszyklus (Phase 5.6): Service-Worker-Registrierung, Update-Erkennung,
 * Installationsaufforderung und Plattformerkennung.
 *
 * - Updates werden nie automatisch aktiviert. Wartet ein neuer Worker, erscheint
 *   „Neue Version verfügbar“; erst „Aktualisieren“ sendet SKIP_WAITING und lädt neu.
 * - Die Installationsaufforderung (beforeinstallprompt, nur Chromium) wird abgefangen und
 *   nur auf ausdrücklichen Klick gezeigt. Nach „Nicht jetzt“ erscheint die Karte nicht wieder.
 */
import { useSyncExternalStore } from 'react';

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface PwaState {
  /** Ein neuer Service Worker wartet auf Aktivierung */
  updateReady: boolean;
  /** Natives Installationsangebot verfügbar (Chromium) */
  canPrompt: boolean;
  installed: boolean;
}

let state: PwaState = { updateReady: false, canPrompt: false, installed: false };
let waiting: ServiceWorker | null = null;
let deferred: BeforeInstallPromptEvent | null = null;
let registration: ServiceWorkerRegistration | null = null;
const listeners = new Set<() => void>();

function set(patch: Partial<PwaState>) {
  state = { ...state, ...patch };
  for (const l of listeners) l();
}

export function usePwa(): PwaState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => state,
    () => state,
  );
}

/** Läuft als installierte App (Startbildschirm/Dock)? */
export function isStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  const nav = navigator as Navigator & { standalone?: boolean };
  return nav.standalone === true || window.matchMedia?.('(display-mode: standalone)').matches === true;
}

export type Platform = 'ios' | 'ipados' | 'android' | 'desktop';

/** Grobe Plattformerkennung nur für passende Installationshinweise – keine Funktionsentscheidung. */
export function detectPlatform(ua = typeof navigator !== 'undefined' ? navigator.userAgent : '', touchPoints = typeof navigator !== 'undefined' ? navigator.maxTouchPoints : 0): Platform {
  if (/iPhone|iPod/.test(ua)) return 'ios';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && touchPoints > 1)) return 'ipados';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}

const DISMISS_KEY = 'terpgrid.device.installDismissed';
export function installDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}
export function dismissInstall(): void {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* ignorieren */
  }
}

/** Zeigt das native Installationsangebot (nur nach Klick). */
export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable';
  const ev = deferred;
  deferred = null;
  set({ canPrompt: false });
  await ev.prompt();
  const { outcome } = await ev.userChoice;
  if (outcome === 'dismissed') dismissInstall();
  return outcome;
}

function track(reg: ServiceWorkerRegistration) {
  registration = reg;
  const markWaiting = (w: ServiceWorker | null) => {
    // Nur ein echtes Update (es gibt bereits einen steuernden Worker) – nicht die Erstinstallation
    if (w && navigator.serviceWorker.controller) {
      waiting = w;
      set({ updateReady: true });
    }
  };
  markWaiting(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const nw = reg.installing;
    nw?.addEventListener('statechange', () => {
      if (nw.state === 'installed') markWaiting(nw);
    });
  });
}

/** Neue Version aktivieren und die Seite neu laden, sobald sie steuert. */
export function applyUpdate(): void {
  const w = waiting ?? registration?.waiting;
  if (!w) return window.location.reload();
  let reloaded = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloaded) return;
    reloaded = true;
    window.location.reload();
  });
  w.postMessage({ type: 'SKIP_WAITING' });
}

/** Manuell nach Updates suchen (Einstellungen). */
export async function checkForUpdate(): Promise<'update' | 'current' | 'unavailable'> {
  if (!registration) return 'unavailable';
  try {
    await registration.update();
  } catch {
    return 'unavailable';
  }
  return registration.waiting && navigator.serviceWorker.controller ? (track(registration), 'update') : 'current';
}

/** Version des aktiven Service Workers (für die Einstellungen). */
export function swVersion(): Promise<string | null> {
  const ctl = typeof navigator !== 'undefined' ? navigator.serviceWorker?.controller : null;
  if (!ctl) return Promise.resolve(null);
  return new Promise((resolve) => {
    const ch = new MessageChannel();
    const t = window.setTimeout(() => resolve(null), 1500);
    ch.port1.onmessage = (e) => {
      window.clearTimeout(t);
      resolve((e.data as { version?: string })?.version ?? null);
    };
    ctl.postMessage({ type: 'GET_VERSION' }, [ch.port2]);
  });
}

export function initPwa(enableSw: boolean): void {
  if (typeof window === 'undefined') return;
  set({ installed: isStandalone() });
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e as BeforeInstallPromptEvent;
    set({ canPrompt: true });
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    set({ canPrompt: false, installed: true });
  });
  if (!enableSw || !('serviceWorker' in navigator) || !window.isSecureContext) return;
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('./sw.js')
      .then((reg) => {
        track(reg);
        // Beim Zurückkehren in die App (z. B. aus dem Hintergrund) nach Updates sehen
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') void reg.update().catch(() => {});
        });
      })
      .catch(() => {});
  });
}
