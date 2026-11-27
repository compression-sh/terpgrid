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
      <PageHeader title="Einstellungen" subtitle={server ? 'Anzeige und Verhalten von TERPGRID – mit deinem Konto synchronisiert.' : 'Anzeige und Verhalten von TERPGRID – gespeichert in diesem Browser.'} />
      <div className="max-w-3xl">
        <div className="space-y-5">
          <Card title="Allgemein" icon={<Settings className="size-4" />}>
            <div className="space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="label">{t('shell.language.label')}</div>
                  <p className="hint">{t('shell.language.hint')}</p>
                </div>
                <LanguageOptions />
              </div>
              <SelectField label="Währung" value={settings.currency} onChange={(v) => v && updateSettings({ currency: v })} options={CURRENCIES.map((c) => ({ value: c, label: c }))} hint="Für Ausgaben, Sammlung und Rechner. Beträge werden nicht umgerechnet." />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="label">Übersicht</div>
                  <p className="hint">Reihenfolge und Sichtbarkeit der Bereiche stellst du direkt auf der Übersicht über „Anpassen“ ein.</p>
                </div>
                <div className="flex gap-2">
                  <a href={href('')} className="btn-ghost py-1.5 text-xs">
                    Zur Übersicht
                  </a>
                  <button type="button" className="btn-ghost py-1.5 text-xs" onClick={() => updateSettings({ dashboardOrder: [], dashboardHidden: [] }).then(() => toast('Standard wiederhergestellt'))}>
                    Standard wiederherstellen
                  </button>
                </div>
              </div>
              <Toggle
                label="Hinweise zur Risikominderung"
                checked={settings.showHarmReduction}
                onChange={(v) => updateSettings({ showHarmReduction: v })}
                hint="Zeigt sachliche Hinweise im Journal (z. B. verzögerte Wirkung von Edibles)."
              />
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="label">Hinweis im THC Lab</div>
                  <p className="hint mt-0.5">Den ausgeblendeten Sicherheitshinweis wieder anzeigen.</p>
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
                    toast('Hinweis wird wieder angezeigt');
                  }}
                >
                  Zurücksetzen
                </button>
              </div>
            </div>
          </Card>
          <AppCard />
          <OnlineCard />
          <Card title="Datenschutz" icon={<Lock className="size-4" />}>
            <ul className="space-y-1.5 text-[13px] text-ink-300">
              {server ? (
                <>
                  <li>• Self-hosted · Private Daten geschützt: Daten liegen auf deinem TERPGRID-Server, dort AES-256-GCM-verschlüsselt (keine Ende-zu-Ende-Verschlüsselung).</li>
                  <li>• Keine Analyse- oder Tracking-Dienste. Persönliche Daten werden nie an Sortendaten-Anbieter gesendet; Discover läuft über deinen Server.</li>
                  <li>• Fotos werden beim Import neu kodiert; eingebettete Metadaten wie GPS entfallen.</li>
                  <li>• Während der Sitzung liegt eine Arbeitskopie unverschlüsselt in diesem Browser; über die Sitzung hinaus nur mit eingeschalteter Offline-Nutzung. Details im Datenschutz-Center.</li>
                </>
              ) : (
                <>
                  <li>• Lokalmodus: Persönliche Daten nur in diesem Browser · Online-Sortendaten von externen Quellen.</li>
                  <li>• Keine Konten, keine Analyse- oder Tracking-Dienste. Growlogs, Fotos, Journal und Sammlung werden nie an Anbieter gesendet.</li>
                  <li>• Netzwerkzugriffe sind per Content-Security-Policy auf StrainAPI und CannaLib beschränkt – und nur, wenn du Discover nutzt.</li>
                  <li>• Fotos werden beim Import neu kodiert; eingebettete Metadaten wie GPS entfallen.</li>
                  <li>• Daten sind nicht verschlüsselt und nicht synchronisiert – Sicherung per Backup-Datei.</li>
                </>
              )}
            </ul>
            <a href={href('data')} className="btn-ghost mt-4 py-1.5 text-xs">
              Daten & Backup verwalten
            </a>
          </Card>
          <Card title="Über TERPGRID" icon={<Info className="size-4" />}>
            <div className="flex items-center gap-3">
              <LogoMark className="size-10" />
              <Wordmark />
            </div>
            <p className="hint mt-3">
              Version {__APP_VERSION__} · Datenbankschema v{DB_VERSION}. Informationswerkzeug zur persönlichen Dokumentation und Schadensminimierung – keine medizinische oder rechtliche
              Beratung. Gesetzliche Regelungen zu Besitz, Anbau und Konsum unterscheiden sich je nach Land.
            </p>
            <a href={href('lab/sources')} className="mt-3 inline-block text-xs text-leaf-300 hover:underline">
              Formeln & Quellen des THC Lab
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
    <Card title="App" subtitle="Installation, Updates und Darstellung auf diesem Gerät" icon={<Smartphone className="size-4" />}>
      <div className="space-y-5">
        <dl className="grid grid-cols-2 gap-3 text-[13px]">
          <div>
            <dt className="text-ink-500">Status</dt>
            <dd className="mt-0.5 text-ink-100">{pwa.installed ? 'Als App installiert' : 'Im Browser geöffnet'}</dd>
          </div>
          <div>
            <dt className="text-ink-500">Version</dt>
            <dd className="mt-0.5 font-mono text-[12px] text-ink-100" title={sw ?? undefined}>
              {__APP_VERSION__}
              {sw ? '' : ' · ohne Offline-Hülle'}
            </dd>
          </div>
        </dl>
        {pwa.updateReady ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-sky-400/25 bg-sky-400/[0.06] p-3 text-[13px] text-sky-50">
            Neue Version verfügbar.
            <button type="button" className="btn-primary py-1.5 text-xs" onClick={applyUpdate}>
              Aktualisieren
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
              toast(r === 'update' ? 'Neue Version verfügbar.' : r === 'current' ? 'TERPGRID ist aktuell.' : 'Update-Prüfung hier nicht möglich (kein Service Worker aktiv).', { tone: r === 'unavailable' ? 'info' : 'ok' });
            }}
          >
            <RefreshCw className={`size-3.5 ${checking ? 'animate-spin' : ''}`} /> Nach Updates suchen
          </button>
        )}
        {!pwa.installed && (
          <div className="space-y-2">
            <div className="flex flex-wrap gap-2">
              {pwa.canPrompt && (
                <button type="button" className="btn-primary py-1.5 text-xs" onClick={() => void promptInstall()}>
                  <Download className="size-3.5" /> Installieren
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
          label="Bewegung reduzieren"
          checked={reduce}
          onChange={(v) => {
            setReduceMotionPref(v);
            setReduce(v);
          }}
          hint="Schaltet Animationen und Übergänge auf diesem Gerät ab – zusätzlich zur Systemeinstellung."
        />
        {server && (
          <div className="flex flex-wrap gap-2 border-t border-white/[0.05] pt-4 text-xs">
            <a href={href('account?abschnitt=geraet')} className="btn-ghost py-1.5">
              Offline-Nutzung: {auth.offlineEnabled ? 'ein' : 'aus'}
            </a>
            <a href={href('together/notifications')} className="btn-ghost py-1.5">
              <Bell className="size-3.5" /> Benachrichtigungen
            </a>
          </div>
        )}
        <p className="hint">Push-Benachrichtigungen auf das Gerät gibt es bewusst nicht: Sie würden externe Push-Dienste der Browserhersteller einbinden. Neuigkeiten erscheinen in der App (Glocke).</p>
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
    <Card title="Online-Sortendaten" icon={<Globe className="size-4" />}>
      <div className="space-y-5">
        <Toggle
          label="Discover: Daten von StrainAPI laden"
          checked={settings.onlineCatalog}
          onChange={(v) => updateSettings({ onlineCatalog: v })}
          hint="Aus: Discover zeigt nur noch lokal zwischengespeicherte Einträge. Gesendet werden ausschließlich Suchbegriffe und Sortenkennungen."
        />
        <Toggle
          label="CannaLib-Forschungsdaten erlauben"
          checked={settings.cannalibEnabled}
          onChange={(v) => updateSettings({ cannalibEnabled: v })}
          hint="Nur auf ausdrücklichen Klick; übertragen wird der Sortenname. Anonymes Kontingent der Quelle ca. 20/Std."
        />
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-white/[0.05] pt-4">
          <div className="text-[12px] text-ink-400">
            Zwischenspeicher: <span className="font-mono text-ink-200">{info?.entries ?? '–'}</span> Antworten
            {info?.newest && ` · zuletzt ${fmtDateTime(nowLocal(new Date(info.newest)))}`}
            <div className="hint">Wird nach spätestens 7 Tagen verworfen, nicht ins Backup übernommen.</div>
          </div>
          <button
            type="button"
            className="btn-ghost py-1.5 text-xs"
            onClick={() =>
              catalog.clearCache().then(() => {
                toast('Zwischenspeicher geleert');
                refresh();
              })
            }
          >
            <Trash2 className="size-3.5" /> Leeren
          </button>
        </div>
      </div>
    </Card>
  );
}
