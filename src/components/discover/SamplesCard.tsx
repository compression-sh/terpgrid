import { Microscope } from 'lucide-react';
import { href } from '../../app/router';
import type { LibSampleStat, LibSampleSummary } from '../../lib/catalog/library';
import { REGION_LABEL, SAMPLE_CANNABINOIDS, SAMPLE_TERPENES, ownReportPercent } from '../../lib/catalog/samples';
import type { LabReport } from '../../lib/db/types';
import { fmt } from '../../lib/format';
import { Card } from '../ui/Card';
import { EvidenceTag } from './EvidenceTag';

const pct = (v: number) => `${fmt(v, v < 0.1 ? 3 : 2)} %`;

/**
 * Öffentliche Laborproben GLEICHNAMIGER Handelsprodukte (Smith et al. 2022).
 * Bewusst kein „Sortenprofil“: Verteilung über Proben ohne Breeder-Zuordnung, mit n je Wert.
 * Eigene (private) Laborberichte werden nur im Browser daneben gestellt.
 */
export function SamplesCard({ s, cultivarName, ownReports }: { s: LibSampleSummary; cultivarName: string; ownReports: LabReport[] }) {
  const own = ownReports[0] ? { report: ownReports[0], ...ownReportPercent(ownReports[0]) } : undefined;
  const cannabinoids = SAMPLE_CANNABINOIDS.map((c) => ({ ...c, st: s.stats[c.key] })).filter((c): c is typeof c & { st: LibSampleStat } => !!c.st && (c.key === 'thc_total' || c.key === 'cbd_total' || c.st.detected > 0));
  const terpenes = SAMPLE_TERPENES.map((t) => ({ ...t, st: s.stats[t.column] }))
    .filter((t): t is typeof t & { st: LibSampleStat } => !!t.st)
    .sort((a, b) => b.st.median - a.st.median || b.st.p75 - a.st.p75);
  const scale = Math.max(...terpenes.map((t) => t.st.p75), 0.0001);
  const total = s.stats.total_terpenes;
  const regions = Object.entries(s.regions).sort((a, b) => b[1] - a[1]);
  return (
    <Card title="Laborproben gleichnamiger Produkte" subtitle="Öffentlicher Forschungsdatensatz – Messwerte je Probe, ohne Breeder" icon={<Microscope className="size-4" />}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-1.5">
          <EvidenceTag kind="science" source="Smith et al. 2022" />
          <EvidenceTag kind="name-only" />
        </div>
        <p className="text-[12.5px] leading-relaxed text-ink-300">
          {fmt(s.samples, 0)} Blütenproben aus US-Laboren tragen den Produktnamen „{cultivarName}“
          {s.terpeneSamples > 0 ? `, ${fmt(s.terpeneSamples, 0)} davon mit Terpenmessung` : ''}. Wer sie angebaut hat und von welchem Breeder die Genetik stammt, ist nicht bekannt.
          {s.sameNameBreeders > 1 && ` ${s.sameNameBreeders} Breeder im Katalog führen eine Sorte dieses Namens.`} Die Werte beschreiben gleichnamige Handelsware – nicht diese Breeder-Linie und
          nicht deine Pflanze.
        </p>

        {cannabinoids.length > 0 && (
          <section aria-label="Cannabinoide der Proben">
            <h3 className="mb-1.5 text-[12px] font-semibold text-ink-200">Cannabinoide (berechnete Gesamtwerte)</h3>
            <div className="overflow-x-auto" tabIndex={0} role="region" aria-label="Cannabinoid-Tabelle (horizontal scrollbar)">
              <table className="w-full min-w-[22rem] text-left text-[12px]">
                <thead className="text-[11px] text-ink-500">
                  <tr>
                    <th className="py-1 pr-2 font-medium">Wert</th>
                    <th className="py-1 pr-2 text-right font-medium">Median</th>
                    <th className="py-1 pr-2 text-right font-medium">mittlere 50 %</th>
                    <th className="py-1 pr-2 text-right font-medium">Proben</th>
                    {own && Object.keys(own.cannabinoids).length > 0 && <th className="py-1 text-right font-medium">Deine Probe</th>}
                  </tr>
                </thead>
                <tbody className="font-mono tabular text-ink-100">
                  {cannabinoids.map((c) => (
                    <tr key={c.key} className="border-t border-white/[0.04]">
                      <td className="py-1 pr-2 font-sans text-ink-200">{c.label}</td>
                      <td className="py-1 pr-2 text-right">{pct(c.st.median)}</td>
                      <td className="py-1 pr-2 text-right text-ink-300">
                        {fmt(c.st.p25, 1)}–{fmt(c.st.p75, 1)} %
                      </td>
                      <td className="py-1 pr-2 text-right text-ink-400">{fmt(c.st.n, 0)}</td>
                      {own && Object.keys(own.cannabinoids).length > 0 && <td className="py-1 text-right text-leaf-200">{own.cannabinoids[c.key] !== undefined ? pct(own.cannabinoids[c.key]!) : '–'}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {terpenes.length > 0 ? (
          <section aria-label="Terpene der Proben">
            <h3 className="mb-1 text-[12px] font-semibold text-ink-200">Terpene je Probe gemessen</h3>
            <p className="mb-2 text-[11px] text-ink-500">Balken: mittlere 50 % der Proben, Strich: Median. „nachgewiesen“ = Anteil der Proben mit Wert über 0.</p>
            <ul className="space-y-1.5">
              {terpenes.map((t) => (
                <li key={t.column} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_auto] items-center gap-2 text-[12px]">
                  <a href={href(`discover/terpenes/${t.atlasId}`)} className="truncate text-ink-200 hover:underline" title={t.isomerSum}>
                    {t.label}
                    {t.isomerSum && <span className="text-ink-500"> (Σ)</span>}
                  </a>
                  <span className="relative h-2 rounded-full bg-ink-700" role="img" aria-label={`${t.label}: Median ${pct(t.st.median)}, mittlere 50 % ${pct(t.st.p25)} bis ${pct(t.st.p75)}`}>
                    <span className="absolute inset-y-0 rounded-full bg-teal-400/45" style={{ left: `${(t.st.p25 / scale) * 100}%`, width: `${Math.max(1, ((t.st.p75 - t.st.p25) / scale) * 100)}%` }} />
                    <span className="absolute -inset-y-0.5 w-0.5 rounded bg-teal-200" style={{ left: `calc(${Math.min(100, (t.st.median / scale) * 100)}% - 1px)` }} />
                    {own?.terpenes[t.column] !== undefined && (
                      <span className="absolute -inset-y-1 w-1 rounded bg-leaf-300" title="Deine Probe" style={{ left: `calc(${Math.min(100, (own.terpenes[t.column]! / scale) * 100)}% - 2px)` }} />
                    )}
                  </span>
                  <span className="whitespace-nowrap text-right font-mono text-[11px] tabular text-ink-300">
                    {pct(t.st.median)} <span className="text-ink-500">· {Math.round((t.st.detected / t.st.n) * 100)} % nachgewiesen</span>
                  </span>
                </li>
              ))}
            </ul>
            {total && (
              <p className="mt-2 text-[11.5px] text-ink-400">
                Gesamt aller gemessenen Terpene (auch nicht einzeln veröffentlichte): Median <span className="font-mono tabular text-ink-200">{pct(total.median)}</span>, mittlere 50 %{' '}
                {fmt(total.p25, 2)}–{fmt(total.p75, 2)} % ({fmt(total.n, 0)} Proben)
              </p>
            )}
            {own && Object.keys(own.terpenes).length > 0 && (
              <p className="mt-1 flex items-center gap-1.5 text-[11.5px] text-ink-400">
                <span className="inline-block h-2.5 w-1 rounded bg-leaf-300" aria-hidden /> Deine Probe „{own.report.title}“ (privat, nur in diesem Browser verglichen)
              </p>
            )}
          </section>
        ) : (
          <p className="text-[12.5px] text-ink-400">Für diese Proben liegen keine Terpenmessungen vor.</p>
        )}

        <details className="text-[11.5px] text-ink-400">
          <summary className="cursor-pointer text-ink-300 hover:text-ink-100">Herkunft, Methode und Grenzen</summary>
          <ul className="mt-2 list-disc space-y-1 pl-4">
            <li>{s.source.citation}</li>
            <li>
              Datensatz der Autorinnen und Autoren, Lizenz{' '}
              <a href={s.source.licenseUrl} target="_blank" rel="noopener noreferrer" className="text-leaf-300 hover:underline">
                {s.source.license}
              </a>
              {s.source.version ? `, Stand ${s.source.version.slice(0, 7)}` : ''} ·{' '}
              <a href={`https://doi.org/${s.source.doi}`} target="_blank" rel="noopener noreferrer" className="text-leaf-300 hover:underline">
                Publikation
              </a>
            </li>
            <li>Labore und Hersteller sind in der Quelle anonymisiert; Regionen: {regions.map(([r, n]) => `${REGION_LABEL[r] ?? r} ${n}`).join(', ')}.</li>
            <li>Gesamt-THC/-CBD = neutrale Form + 0,877 × Säureform, von den Autoren berechnet; fehlende Säureformen wurden dort als 0 angenommen. Einheit: Gewichtsprozent.</li>
            <li>Terpene: nur die von allen Laboren häufig gemessenen Verbindungen; Ocimen und Nerolidol als Summe ihrer Isomere (Σ). „0“ heißt laut Quelle nicht nachgewiesen bzw. unter der Bestimmungsgrenze; nicht gemessene Werte fließen nicht ein.</li>
            <li>Zuordnung nur über den exakt gleichen Namen (inkl. Version); Autoflower-Sorten sind ausgenommen.</li>
          </ul>
          <a href={href('discover/learn/terpene-analytik')} className="mt-2 inline-flex text-leaf-300 hover:underline">
            Warum Proben gleichen Namens verschieden sind
          </a>
        </details>
      </div>
    </Card>
  );
}
