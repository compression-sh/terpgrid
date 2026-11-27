import { LanguageOptions } from '../app/locale';
import { t } from '../i18n';
import { useAuth, useIsServerMode } from '../app/auth';
import { InstallInstructions } from '../app/pwaUi';
import { applyUpdate, checkForUpdate, promptInstall, swVersion, usePwa } from '../lib/pwa/pwa';
import { reduceMotionPref, setReduceMotionPref } from '../lib/pwa/prefs';
import { Bell, Download, Globe, Info, Lock, RefreshCw, Settings, Smartphone, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { catalog } from '../lib/catalog/service';
import { fmtDateTime, nowLocal } from '../lib/dates';
import { useData } from '../app/DataProvider';
import { useToast } from '../app/Toasts';
import { href } from '../app/router';
import { LogoMark, Wordmark } from '../components/brand/Logo';
import { SelectField } from '../components/forms/Fields';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { Toggle } from '../components/ui/Toggle';
import { DB_VERSION } from '../lib/db/database';

const CURRENCIES = ['EUR', 'CHF', 'USD', 'GBP', 'CAD'];

export function SettingsPage() {
  const server = useIsServerMode();
  const { settings, updateSettings } = useData();
  const toast = useToast();
  return (
    <div>
      <PageHeader title={t('settings.title')} subtitle={server ? t('settings.subServer') : t('settings.subLocal')} />
      <div className="max-w-3xl">
        <div className="space-y-5">
          <Card title={t('settings.general')} icon={<Settings className="size-4" />}>
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="label">{t('shell.language.label')}</div>
                  <p className="hint">{t('shell.language.hint')}</p>
                </div>
                <LanguageOptions />
              </div>
              <SelectField label={t('settings.currency')} value={settings.currency} onChange={(v) => v && updateSettings({ currency: v })} options={CURRENCIES.map((c) => ({ value: c, label: c }))} hint={t('settings.currencyHint')} />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="label">{t('settings.overview')}</div>
                  <p className="hint">{t('settings.overviewHint')}</p>
                </div>
                <div className="flex gap-2">
                  <a href={href('')} className="btn-ghost py-1.5 text-xs">
                    {t('settings.toOverview')}
                  </a>
                  <button type="button" className="btn-ghost py-1.5 text-xs" onClick={() => updateSettings({ dashboardOrder: [], dashboardHidden: [] }).then(() => toast(t('settings.restored')))}>
                    {t('settings.restore')}
                  </button>
                </div>
              </div>
              <Toggle
                label={t('settings.harm')}
                checked={settings.showHarmReduction}
                onChange={(v) => updateSettings({ showHarmReduction: v })}
                hint={t('settings.harmHint')}
              />
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="label">{t('settings.labNotice')}</div>
                  <p className="hint mt-0.5">{t('settings.labNoticeHint')}</p>
                </div>
                <button
                  type="button"
                  className="btn-ghost py-1.5 text-xs"
                  onClick={() => {
                    try {
                      localStorage.removeItem('cannabisrechner.disclaimer.v1');
                    } catch {
                      /* ignore */
                    }
                    toast(t('settings.labNoticeShown'));
                  }}
                >
                  {t('settings.reset')}
                </button>
              </div>
            </div>
          </Card>
          <AppCard />
          <OnlineCard />
          <Card title={t('settings.privacy')} icon={<Lock className="size-4" />}>
            <ul className="space-y-1.5 text-[13px] text-ink-300">
              {server ? (
                <>
                  <li>{t('settings.p1')}</li>
                  <li>{t('settings.p2')}</li>
                  <li>{t('settings.p3')}</li>
                  <li>{t('settings.p4')}</li>
                </>
              ) : (
                <>
                  <li>{t('settings.l1')}</li>
                  <li>{t('settings.l2')}</li>
                  <li>{t('settings.l3')}</li>
                  <li>{t('settings.p3')}</li>
                  <li>{t('settings.l5')}</li>
                </>
              )}
            </ul>
            <a href={href('data')} className="btn-ghost mt-4 py-1.5 text-xs">
              {t('settings.manageData')}
            </a>
          </Card>
          <Card title={t('settings.about')} icon={<Info className="size-4" />}>
            <div className="flex items-center gap-3">
              <LogoMark className="size-10" />
              <Wordmark />
            </div>
            <p className="hint mt-3">
              {t('settings.aboutText', { v: __APP_VERSION__, db: String(DB_VERSION) })}
            </p>
            <a href={href('lab/sources')} className="mt-3 inline-block text-xs text-leaf-300 hover:underline">
              {t('settings.labSources')}
            </a>
          </Card>
        </div>
      </div>
    </div>
  );
}

function AppCard() {
  const server = useIsServerMode();
  const auth = useAuth();
  const pwa = usePwa();
  const toast = useToast();
  const [reduce, setReduce] = useState(reduceMotionPref);
  const [sw, setSw] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);
  const [steps, setSteps] = useState(false);
  useEffect(() => {
    void swVersion().then(setSw);
  }, []);
  return (
    <Card title={t('settings.app')} subtitle={t('settings.appSub')} icon={<Smartphone className="size-4" />}>
      <div className="space-y-5">
        <dl className="grid grid-cols-2 gap-3 text-[13px]">
          <div>
            <dt className="text-ink-500">{t('settings.status')}</dt>
            <dd className="mt-0.5 text-ink-100">{pwa.installed ? t('settings.installed') : t('settings.inBrowser')}</dd>
          </div>
          <div>
            <dt className="text-ink-500">{t('settings.version')}</dt>
            <dd className="mt-0.5 font-mono text-[12px] text-ink-100" title={sw ?? undefined}>
              {__APP_VERSION__}
              {sw ? '' : ' · ohne Offline-Hülle'}
            </dd>
          </div>
        </dl>
        {pwa.updateReady ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-400/25 bg-sky-400/[0.06] p-3 text-[13px] text-sky-50">
            {t('settings.newVersion')}
            <button type="button" className="btn-primary py-1.5 text-xs" onClick={applyUpdate}>
              {t('settings.update')}
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="btn-ghost py-1.5 text-xs"
            disabled={checking}
            onClick={async () => {
              setChecking(true);
              const r = await checkForUpdate();
              setChecking(false);
              toast(r === 'update' ? t('settings.newVersion') : r === 'current' ? t('settings.current') : t('settings.noSw'), { tone: r === 'unavailable' ? 'info' : 'ok' });
            }}
          >
            <RefreshCw className={`size-3.5 ${checking ? 'animate-spin' : ''}`} /> {t('settings.check')}
          </button>
        )}
        {!pwa.installed && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {pwa.canPrompt && (
                <button type="button" className="btn-primary py-1.5 text-xs" onClick={() => void promptInstall()}>
                  <Download className="size-3.5" /> {t('settings.install')}
                </button>
              )}
              <button type="button" className="btn-ghost py-1.5 text-xs" aria-expanded={steps} onClick={() => setSteps((v) => !v)}>
                Installationsanleitung {steps ? 'ausblenden' : 'anzeigen'}
              </button>
            </div>
            {steps && <InstallInstructions />}
          </div>
        )}
        <Toggle
          label={t('settings.motion')}
          checked={reduce}
          onChange={(v) => {
            setReduceMotionPref(v);
            setReduce(v);
          }}
          hint={t('settings.motionHint')}
        />
        {server && (
          <div className="flex flex-wrap gap-2 border-t border-white/[0.05] pt-4 text-xs">
            <a href={href('account?abschnitt=geraet')} className="btn-ghost py-1.5">
              Offline-Nutzung: {auth.offlineEnabled ? 'ein' : 'aus'}
            </a>
            <a href={href('together/notifications')} className="btn-ghost py-1.5">
              <Bell className="size-3.5" /> {t('settings.notifications')}
            </a>
          </div>
        )}
        <p className="hint">{t('settings.noPush')}</p>
      </div>
    </Card>
  );
}

function OnlineCard() {
  const { settings, updateSettings } = useData();
  const toast = useToast();
  const [info, setInfo] = useState<{ entries: number; oldest?: string; newest?: string }>();
  const refresh = () => catalog.cacheInfo().then(setInfo).catch(() => setInfo(undefined));
  useEffect(() => {
    refresh();
  }, []);
  return (
    <Card title={t('settings.online')} icon={<Globe className="size-4" />}>
      <div className="space-y-5">
        <Toggle
          label={t('settings.strainapi')}
          checked={settings.onlineCatalog}
          onChange={(v) => updateSettings({ onlineCatalog: v })}
          hint={t('settings.strainapiHint')}
        />
        <Toggle
          label={t('settings.cannalib')}
          checked={settings.cannalibEnabled}
          onChange={(v) => updateSettings({ cannalibEnabled: v })}
          hint={t('settings.cannalibHint')}
        />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.05] pt-4">
          <div className="text-[12px] text-ink-400">
            {t('settings.cache')} <span className="font-mono text-ink-200">{info?.entries ?? '–'}</span> {t('settings.responses')}
            {info?.newest && t('settings.lastAt', { date: fmtDateTime(nowLocal(new Date(info.newest))) })}
            <div className="hint">{t('settings.cacheHint')}</div>
          </div>
          <button
            type="button"
            className="btn-ghost py-1.5 text-xs"
            onClick={() =>
              catalog.clearCache().then(() => {
                toast(t('settings.cleared'));
                refresh();
              })
            }
          >
            <Trash2 className="size-3.5" /> {t('settings.clear')}
          </button>
        </div>
      </div>
    </Card>
  );
}
