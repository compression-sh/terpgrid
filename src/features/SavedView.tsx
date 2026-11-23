import { Bookmark, Download, FolderOpen, Trash2, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { Callout } from '../components/ui/Callout';
import { Card } from '../components/ui/Card';
import { downloadFile } from '../lib/exporters';
import type { SavedCalculation } from '../lib/storage';

const KIND_LABEL: Record<SavedCalculation['kind'], string> = {
  edibles: 'Edibles',
  smoking: 'Joint',
  compare: 'Vergleich',
};

interface Props {
  items: SavedCalculation[];
  onOpen: (item: SavedCalculation) => void;
  onDelete: (id: string) => void;
  onClear: () => void;
  onImport: (items: SavedCalculation[]) => number;
}

export function SavedView({ items, onOpen, onDelete, onClear, onImport }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);

  return (
    <div className="space-y-5">
      <Callout tone="ok" title="Nur auf diesem Gerät gespeichert">
        Gespeicherte Berechnungen liegen ausschließlich im lokalen Speicher dieses Browsers. Es werden keine Daten an einen Server übertragen.
        Beim Löschen der Browserdaten gehen sie verloren – für eine Sicherung die JSON-Exportfunktion nutzen.
      </Callout>

      <Card
        title="Gespeicherte Berechnungen"
        subtitle={`${items.length} ${items.length === 1 ? 'Eintrag' : 'Einträge'}`}
        icon={<Bookmark className="size-4" />}
        actions={
          <div className="flex gap-2 no-print">
            <button
              type="button"
              className="btn-ghost py-1.5"
              disabled={items.length === 0}
              onClick={() => downloadFile(`cannabisrechner-sicherung-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(items, null, 2), 'application/json')}
            >
              <Download className="size-4" />
              <span className="hidden sm:inline">Sichern</span>
            </button>
            <button type="button" className="btn-ghost py-1.5" onClick={() => fileRef.current?.click()}>
              <Upload className="size-4" />
              <span className="hidden sm:inline">Importieren</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                e.target.value = '';
                if (!file) return;
                try {
                  if (file.size > 2_000_000) throw new Error('zu groß');
                  const parsed: unknown = JSON.parse(await file.text());
                  const n = onImport(Array.isArray(parsed) ? (parsed as SavedCalculation[]) : []);
                  setMsg(n > 0 ? { tone: 'ok', text: `${n} Berechnung(en) importiert.` } : { tone: 'warn', text: 'Keine gültigen Einträge gefunden.' });
                } catch {
                  setMsg({ tone: 'warn', text: 'Die Datei konnte nicht gelesen werden.' });
                }
              }}
            />
          </div>
        }
      >
        {msg && (
          <div className="mb-4">
            <Callout tone={msg.tone}>{msg.text}</Callout>
          </div>
        )}
        {items.length === 0 ? (
          <div className="grid place-items-center py-12 text-center">
            <Bookmark className="size-8 text-ink-500" />
            <p className="mt-3 text-sm text-ink-300">Noch keine Berechnungen gespeichert.</p>
            <p className="hint mt-1">In den Rechnern auf „Speichern“ klicken, um ein Ergebnis hier abzulegen.</p>
          </div>
        ) : (
          <ul className="divide-y divide-white/[0.05]">
            {items.map((it) => (
              <li key={it.id} className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full border border-leaf-500/20 bg-leaf-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-leaf-300">
                      {KIND_LABEL[it.kind]}
                    </span>
                    <span className="truncate text-[14px] font-medium text-ink-50">{it.name}</span>
                  </div>
                  <div className="mt-1 text-xs text-ink-400">{new Date(it.createdAt).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' })}</div>
                  <dl className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
                    {Object.entries(it.summary).map(([k, v]) => (
                      <div key={k} className="flex gap-1.5">
                        <dt className="text-ink-400">{k}:</dt>
                        <dd className="font-mono tabular text-ink-200">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
                <div className="flex shrink-0 gap-2 no-print">
                  <button type="button" className="btn-ghost py-1.5" onClick={() => onOpen(it)}>
                    <FolderOpen className="size-4" /> Öffnen
                  </button>
                  <button type="button" className="btn-ghost py-1.5 hover:text-rose-300" aria-label={`${it.name} löschen`} onClick={() => onDelete(it.id)}>
                    <Trash2 className="size-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {items.length > 0 && (
          <div className="mt-5 flex justify-end border-t border-white/[0.05] pt-4 no-print">
            {confirmClear ? (
              <div className="flex items-center gap-2 text-[13px] text-ink-300">
                Wirklich alle löschen?
                <button type="button" className="btn rounded-lg bg-rose-500/80 py-1.5 text-white hover:bg-rose-500" onClick={() => { onClear(); setConfirmClear(false); }}>
                  Ja, löschen
                </button>
                <button type="button" className="btn-ghost py-1.5" onClick={() => setConfirmClear(false)}>
                  Abbrechen
                </button>
              </div>
            ) : (
              <button type="button" className="btn-ghost py-1.5 text-rose-300/80" onClick={() => setConfirmClear(true)}>
                <Trash2 className="size-4" /> Alle löschen
              </button>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
