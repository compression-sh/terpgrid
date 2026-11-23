import { ArrowDown, ArrowUp, Eye, EyeOff, Info, LayoutDashboard, Lock, Settings } from 'lucide-react';
import { useData } from '../app/DataProvider';
import { useToast } from '../app/Toasts';
import { href } from '../app/router';
import { LogoMark, Wordmark } from '../components/brand/Logo';
import { SelectField } from '../components/forms/Fields';
import { Card } from '../components/ui/Card';
import { PageHeader } from '../components/ui/PageHeader';
import { Toggle } from '../components/ui/Toggle';
import { DB_VERSION } from '../lib/db/database';
import type { DashboardWidget } from '../lib/db/types';

const WIDGET_LABEL: Record<DashboardWidget, string> = {
  stats: 'Kennzahlen',
  grows: 'Aktive Grows',
  reminders: 'Erinnerungen',
  photos: 'Neueste Fotos',
  activity: 'Letzte Aktivitäten',
  journal: 'Journal',
  calculations: 'Gespeicherte Berechnungen',
  strains: 'Zuletzt bearbeitete Sorten',
};

const CURRENCIES = ['EUR', 'CHF', 'USD', 'GBP', 'CAD'];

export function SettingsPage() {
  const { settings, updateSettings } = useData();
  const toast = useToast();
  const order = settings.dashboardOrder;
  const hidden = new Set(settings.dashboardHidden);

  const move = (i: number, d: -1 | 1) => {
    const j = i + d;
    if (j < 0 || j >= order.length) return;
    const next = [...order];
    [next[i], next[j]] = [next[j]!, next[i]!];
    updateSettings({ dashboardOrder: next });
  };
  const toggle = (w: DashboardWidget) => {
    const s = new Set(hidden);
    if (s.has(w)) s.delete(w);
    else s.add(w);
    updateSettings({ dashboardHidden: [...s] });
  };

  return (
    <div>
      <PageHeader title="Einstellungen" subtitle="Anzeige und Verhalten von TERPGRID – gespeichert nur auf diesem Gerät." />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Card title="Übersicht anpassen" subtitle="Reihenfolge und Sichtbarkeit der Dashboard-Karten" icon={<LayoutDashboard className="size-4" />}>
          <ol className="space-y-1.5">
            {order.map((w, i) => (
              <li key={w} className={`flex items-center justify-between gap-2 rounded-lg border border-white/[0.06] px-3 py-2 ${hidden.has(w) ? 'opacity-50' : ''}`}>
                <span className="text-[13px] text-ink-100">{WIDGET_LABEL[w]}</span>
                <span className="flex gap-1">
                  <button type="button" className="btn-ghost p-1" aria-label={`${WIDGET_LABEL[w]} nach oben`} disabled={i === 0} onClick={() => move(i, -1)}>
                    <ArrowUp className="size-3.5" />
                  </button>
                  <button type="button" className="btn-ghost p-1" aria-label={`${WIDGET_LABEL[w]} nach unten`} disabled={i === order.length - 1} onClick={() => move(i, 1)}>
                    <ArrowDown className="size-3.5" />
                  </button>
                  <button type="button" className="btn-ghost p-1" aria-pressed={!hidden.has(w)} aria-label={hidden.has(w) ? `${WIDGET_LABEL[w]} einblenden` : `${WIDGET_LABEL[w]} ausblenden`} onClick={() => toggle(w)}>
                    {hidden.has(w) ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
                  </button>
                </span>
              </li>
            ))}
          </ol>
          <button type="button" className="btn-ghost mt-3 py-1.5 text-xs" onClick={() => updateSettings({ dashboardOrder: [], dashboardHidden: [] }).then(() => toast('Standard wiederhergestellt'))}>
            Standard wiederherstellen
          </button>
        </Card>

        <div className="space-y-5">
          <Card title="Allgemein" icon={<Settings className="size-4" />}>
            <div className="space-y-5">
              <SelectField label="Währung" value={settings.currency} onChange={(v) => v && updateSettings({ currency: v })} options={CURRENCIES.map((c) => ({ value: c, label: c }))} hint="Für Ausgaben, Sammlung und Rechner. Beträge werden nicht umgerechnet." />
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
          <Card title="Datenschutz" icon={<Lock className="size-4" />}>
            <ul className="space-y-1.5 text-[13px] text-ink-300">
              <li>• Keine Konten, kein Server, keine Analyse- oder Tracking-Dienste.</li>
              <li>• Die App lädt keine externen Ressourcen; der Produktions-Build verbietet Netzwerkverbindungen per Content-Security-Policy.</li>
              <li>• Fotos werden beim Import neu kodiert; eingebettete Metadaten wie GPS entfallen.</li>
              <li>• Daten sind nicht verschlüsselt und nicht synchronisiert – Sicherung per Backup-Datei.</li>
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
