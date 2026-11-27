/**
 * PWA-Oberflächen (Phase 5.6): Update-Hinweis, Installationskarte mit Anleitungen
 * und die einmalige Frage nach der Offline-Nutzung.
 */
import { CloudOff, Download, Share, Smartphone, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { accountDbName, useAuth } from './auth';
import { useRoute } from './router';
import { isSharedDevice } from '../lib/device';
import { markOfflineAsked, offlineAsked } from '../lib/offline';
import { type Platform, applyUpdate, detectPlatform, dismissInstall, installDismissed, promptInstall, usePwa } from '../lib/pwa/pwa';
import { t } from '../i18n';

/** „Neue Version verfügbar“ – aktualisiert erst auf Klick (nie mitten in einer Eingabe). */
export function UpdateBanner() {
  const { updateReady } = usePwa();
  const [later, setLater] = useState(false);
  if (!updateReady || later) return null;
  return (
    <div role="status" className="mb-4 flex flex-col gap-3 rounded-xl border border-sky-400/25 bg-sky-400/[0.07] p-3.5 text-[13px] text-sky-50 sm:flex-row sm:items-center sm:justify-between">
      <span className="flex items-start gap-2">
        <Sparkles className="mt-0.5 size-4 shrink-0 text-sky-300" />
        <span>
          <strong className="font-semibold">{t('shell.update.title')}</strong> {t('shell.update.text')}
        </span>
      </span>
      <span className="flex shrink-0 gap-2">
        <button type="button" className="btn-primary py-1.5" onClick={applyUpdate}>
          {t('shell.update.action')}
        </button>
        <button type="button" className="btn-ghost py-1.5" onClick={() => setLater(true)}>
          {t('shell.later')}
        </button>
      </span>
    </div>
  );
}

/** Installationsschritte je Plattform (übersetzt beim Zugriff). */
const STEPS = new Proxy({} as Record<Platform, { title: string; steps: string[] }>, {
  get: (_t, p: string) => ({
    title: t(`shell.install.${p as Platform}.title`),
    steps: [1, 2, 3, 4].map((i) => t(`shell.install.${p as Platform}.s${i as 1 | 2 | 3 | 4}`)),
  }),
});

/** Installationsanleitungen für alle Plattformen (Einstellungen). */
export function InstallInstructions({ only }: { only?: Platform }) {
  const list = only ? [only] : (['ios', 'ipados', 'android', 'desktop'] as Platform[]);
  return (
    <div className={`grid gap-3 ${only ? '' : 'sm:grid-cols-2'}`}>
      {list.map((p) => (
        <div key={p} className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-3.5">
          <div className="mb-1.5 text-[13px] font-medium text-ink-100">{STEPS[p].title}</div>
          <ol className="list-decimal space-y-1 pl-4 text-[12.5px] leading-snug text-ink-300">
            {STEPS[p].steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
        </div>
      ))}
    </div>
  );
}

/** Einmalige Installationskarte (nur Übersicht). Nach „Nicht jetzt“ nie wieder. */
export function InstallCard() {
  const route = useRoute();
  const pwa = usePwa();
  const [hidden, setHidden] = useState(installDismissed);
  const [showSteps, setShowSteps] = useState(false);
  const platform = detectPlatform();
  const apple = platform === 'ios' || platform === 'ipados';
  if (route.path.length > 0 || hidden || pwa.installed || (!pwa.canPrompt && !apple)) return null;
  const close = () => {
    dismissInstall();
    setHidden(true);
  };
  return (
    <div className="mb-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5 text-[13px] text-ink-200">
      <div className="flex items-start gap-3">
        <Smartphone className="mt-0.5 size-4 shrink-0 text-leaf-400" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink-50">{t('shell.install.cardTitle')}</p>
          <p className="mt-0.5 text-ink-400">{t('shell.install.cardText')}</p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {pwa.canPrompt ? (
              <button type="button" className="btn-primary py-1.5" onClick={() => void promptInstall().then((r) => r !== 'unavailable' && setHidden(true))}>
                <Download className="size-4" /> {t('shell.install.install')}
              </button>
            ) : (
              <button type="button" className="btn-primary py-1.5" aria-expanded={showSteps} onClick={() => setShowSteps((v) => !v)}>
                <Share className="size-4" /> {t('shell.install.howTo')}
              </button>
            )}
            <button type="button" className="btn-ghost py-1.5" onClick={close}>
              {t('shell.notNow')}
            </button>
          </div>
          {showSteps && (
            <div className="mt-3">
              <InstallInstructions only={platform} />
            </div>
          )}
        </div>
        <button type="button" className="btn-ghost -mt-1 -mr-1 p-1.5" aria-label={t('shell.install.dismiss')} onClick={close}>
          <X className="size-3.5" />
        </button>
      </div>
    </div>
  );
}

/**
 * Einmalige Frage nach der Offline-Nutzung je Konto und Gerät (nur Übersicht, nur online,
 * nicht auf geteilten Geräten). Standard bleibt „aus“.
 */
export function OfflineChoiceCard() {
  const route = useRoute();
  const auth = useAuth();
  const [, force] = useState(0);
  const st = auth.state;
  if (route.path.length > 0 || st.kind !== 'authenticated' || st.offline || isSharedDevice() || auth.offlineEnabled) return null;
  const db = accountDbName(st.user.accountKey);
  if (offlineAsked(db)) return null;
  return (
    <div className="mb-4 rounded-xl border border-white/[0.07] bg-white/[0.02] p-3.5 text-[13px] text-ink-200">
      <div className="flex items-start gap-3">
        <CloudOff className="mt-0.5 size-4 shrink-0 text-leaf-400" />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-ink-50">{t('shell.offlineAsk.title')}</p>
          <p className="mt-0.5 text-ink-400">
            {t('shell.offlineAsk.text')}
          </p>
          <div className="mt-2.5 flex flex-wrap gap-2">
            <button type="button" className="btn-primary py-1.5" onClick={() => auth.setOfflineMode(true)}>
              {t('shell.offlineAsk.enable')}
            </button>
            <button
              type="button"
              className="btn-ghost py-1.5"
              onClick={() => {
                markOfflineAsked(db);
                force((n) => n + 1);
              }}
            >
              {t('shell.notNow')}
            </button>
          </div>
          <p className="mt-2 text-[12px] text-ink-500">{t('shell.offlineAsk.later')}</p>
        </div>
      </div>
    </div>
  );
}
