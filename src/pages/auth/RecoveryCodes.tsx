import { Check, Copy, Download, ShieldAlert } from 'lucide-react';
import { useState } from 'react';

export function downloadText(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Zeigt Recovery-Codes genau einmal an. Sie werden nirgends im Browser gespeichert. */
export function RecoveryCodesPanel({ codes, loginName, onDone, doneLabel = 'Weiter zu TERPGRID' }: { codes: string[]; loginName: string; onDone: () => void; doneLabel?: string }) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = `TERPGRID – Wiederherstellungscodes\nKennung: ${loginName}\nErstellt: ${new Date().toLocaleString('de-DE')}\n\nJeder Code funktioniert genau einmal.\n\n${codes.join('\n')}\n`;
  return (
    <div className="space-y-5">
      <div className="flex gap-3 rounded-xl border border-amber-400/25 bg-amber-400/[0.07] p-3.5 text-[13px] leading-relaxed text-amber-100">
        <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-300" />
        <div>
          <strong className="font-semibold">Ohne E-Mail gibt es keinen anderen Weg zurück.</strong> Wenn du dein Passwort vergisst und diese Codes verlierst, ist dein Konto
          endgültig verloren – auch die Administration kann es nicht wiederherstellen. Bewahre die Codes getrennt vom Gerät auf (Passwort-Manager oder Papier).
        </div>
      </div>
      <div className="rounded-xl border border-white/[0.06] bg-ink-950/60 p-4">
        <div className="mb-2 text-[11px] uppercase tracking-[0.14em] text-ink-500">Kennung</div>
        <div className="mb-4 select-all font-mono text-[15px] text-leaf-200">{loginName}</div>
        <ol className="grid grid-cols-1 gap-2 font-mono text-[13.5px] text-ink-50 min-[400px]:grid-cols-2">
          {codes.map((c, i) => (
            <li key={c} className="flex items-center gap-2 rounded-md bg-white/[0.03] px-2 py-1.5">
              <span className="w-5 text-right text-[11px] text-ink-500">{i + 1}</span>
              <span className="select-all whitespace-nowrap">{c}</span>
            </li>
          ))}
        </ol>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-ghost" onClick={() => downloadText(`terpgrid-wiederherstellung-${loginName}.txt`, text)}>
          <Download className="size-4" /> Als Datei speichern
        </button>
        <button
          type="button"
          className="btn-ghost"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(text);
              setCopied(true);
            } catch {
              setCopied(false);
            }
          }}
        >
          {copied ? <Check className="size-4 text-leaf-300" /> : <Copy className="size-4" />} {copied ? 'Kopiert' : 'Kopieren'}
        </button>
      </div>
      <label className="flex items-start gap-2.5 text-[13px] text-ink-200">
        <input type="checkbox" className="mt-0.5 size-4 accent-leaf-500" checked={saved} onChange={(e) => setSaved(e.target.checked)} />
        Ich habe Kennung und Wiederherstellungscodes sicher aufbewahrt.
      </label>
      <button type="button" className="btn-primary w-full" disabled={!saved} onClick={onDone}>
        {doneLabel}
      </button>
    </div>
  );
}
