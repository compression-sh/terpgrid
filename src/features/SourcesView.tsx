import { useIsServerMode } from '../app/auth';
import { BookOpen, ExternalLink, FunctionSquare, Lock } from 'lucide-react';
import { Callout } from '../components/ui/Callout';
import { Card } from '../components/ui/Card';
import {
  DECARB_EFFICIENCY_SPREAD,
  DEFAULT_DECARB_EFFICIENCY,
  DEFAULT_EXTRACTION_EFFICIENCY,
  DEFAULT_LABEL_UNCERTAINTY,
  EXTRACTION_EFFICIENCY_SPREAD,
} from '../lib/calc/constants';
import { fmtPercent } from '../lib/format';
import { FORMULAS, SOURCES } from '../lib/sources';

const ASSUMPTIONS = [
  { name: 'Decarboxylierungsausbeute', value: `${fmtPercent(DEFAULT_DECARB_EFFICIENCY)} ± ${fmtPercent(DECARB_EFFICIENCY_SPREAD)}`, basis: 'Annahme; Laborbedingungen nahezu vollständig (Wang et al. 2016), Haushaltsöfen schwanken stark.' },
  { name: 'Extraktionsausbeute ins Fett', value: `${fmtPercent(DEFAULT_EXTRACTION_EFFICIENCY)} ± ${fmtPercent(EXTRACTION_EFFICIENCY_SPREAD)}`, basis: 'Annahme; keine belastbaren Standardwerte für Heimverfahren.' },
  { name: 'Unsicherheit THC-Angabe', value: `± ${fmtPercent(DEFAULT_LABEL_UNCERTAINTY)} relativ`, basis: 'Orientierung an Schwabe et al. 2023 (deklarierte Werte häufig zu hoch).' },
  { name: 'Bioverfügbarkeit Rauchen', value: '10–35 % (Extreme 2–56 %)', basis: 'Grotenhermen 2003; Huestis 2007; Lindgren et al. 1981.' },
];

export function SourcesView() {
  const server = useIsServerMode();
  return (
    <div className="space-y-5">
      <Card title="Formeln" subtitle="So rechnet die App – alle Berechnungen laufen lokal im Browser" icon={<FunctionSquare className="size-4" />}>
        <div className="grid gap-3 md:grid-cols-2">
          {FORMULAS.map((f) => (
            <div key={f.title} className="rounded-xl border border-white/[0.06] bg-white/[0.015] p-4">
              <div className="text-[13px] font-semibold text-ink-100">{f.title}</div>
              <div className="mt-2 overflow-x-auto rounded-lg bg-ink-850 px-3 py-2 font-mono text-[12px] text-leaf-300">{f.formula}</div>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-400">{f.explanation}</p>
            </div>
          ))}
        </div>
      </Card>

      <Card title="Annahmen und Voreinstellungen" subtitle="Einstellbar und in der Oberfläche als „Annahme“ gekennzeichnet">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-[13px]">
            <thead>
              <tr className="border-b border-white/[0.06] text-xs text-ink-400">
                <th className="py-2 pr-4 font-medium">Parameter</th>
                <th className="py-2 pr-4 font-medium">Wert</th>
                <th className="py-2 font-medium">Grundlage</th>
              </tr>
            </thead>
            <tbody>
              {ASSUMPTIONS.map((a) => (
                <tr key={a.name} className="border-b border-white/[0.04] last:border-0">
                  <td className="py-2.5 pr-4 text-ink-100">{a.name}</td>
                  <td className="whitespace-nowrap py-2.5 pr-4 font-mono tabular text-ink-200">{a.value}</td>
                  <td className="py-2.5 text-ink-400">{a.basis}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card title="Quellen" subtitle="Behörden und Fachliteratur" icon={<BookOpen className="size-4" />}>
        <ol className="space-y-4">
          {SOURCES.map((s, i) => (
            <li key={s.id} className="grid grid-cols-[1.75rem_1fr] gap-2">
              <span className="font-mono text-xs text-ink-500">[{i + 1}]</span>
              <div>
                <div className="text-[13px] font-medium text-ink-100">{s.short}</div>
                <p className="mt-0.5 text-[13px] leading-relaxed text-ink-400">{s.citation}</p>
                <p className="mt-1 text-xs text-ink-500">Verwendet für: {s.usedFor}</p>
                {s.url && (
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer nofollow"
                    referrerPolicy="no-referrer"
                    className="mt-1 inline-flex items-center gap-1 break-all text-xs text-leaf-400 hover:text-leaf-300 hover:underline"
                  >
                    {s.url.replace(/^https:\/\//, '')} <ExternalLink className="size-3 shrink-0" />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ol>
        <p className="hint mt-5">
          Externe Links öffnen sich nur auf Klick in einem neuen Tab. Die Rechner des THC Lab arbeiten vollständig lokal; nur der Bereich Discover lädt Online-Sortendaten von externen Quellen.
        </p>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        <Callout tone="warn" title="Keine medizinische Beratung">
          Diese App ist ein Informations- und Rechenwerkzeug zur Schadensminimierung. Sie ersetzt keine ärztliche oder pharmazeutische Beratung und gibt
          keine Dosierungsempfehlung. Gesetzliche Regelungen zu Besitz, Anbau und Konsum unterscheiden sich je nach Land.
        </Callout>
        <Callout tone="ok" title="Datenschutz">
          <span className="inline-flex items-center gap-1">
            <Lock className="size-3" /> Kein Tracking. Berechnungen laufen lokal im Browser.
          </span>{' '}
          {server ? 'Eingaben werden als Entwurf und gespeicherte Berechnungen als Datensätze verschlüsselt mit deinem Konto synchronisiert.' : 'Eingaben und gespeicherte Berechnungen bleiben im lokalen Speicher dieses Browsers.'}
        </Callout>
      </div>
    </div>
  );
}
