import { ArrowLeft, Printer, QrCode } from 'lucide-react';
import QRCode from 'qrcode';
import { useEffect, useMemo, useState } from 'react';
import { useData } from '../../app/DataProvider';
import { href, setQuery, useRoute } from '../../app/router';
import { EmptyState } from '../../components/ui/EmptyState';
import type { Plant } from '../../lib/db/types';

/** Kurzkennung für das Etikett: aus der (zufälligen) Datensatz-ID abgeleitet, keine zweite Identität. */
export const shortId = (id: string) => id.replace(/[^A-Za-z0-9]/g, '').slice(-6).toUpperCase();

/**
 * QR-Inhalt: nur der App-Link zur Pflanze (Hash-Route) – keine Zugangsdaten, keine Inhalte.
 * Ohne Anmeldung und ohne Besitz der Pflanze zeigt der Link nichts an.
 */
export function plantLabelUrl(origin: string, path: string, p: Pick<Plant, 'id' | 'growId'>): string {
  return `${origin}${path}#/grows/${encodeURIComponent(p.growId)}/plants/${encodeURIComponent(p.id)}`;
}

function QrSvg({ text }: { text: string }) {
  const [svg, setSvg] = useState('');
  useEffect(() => {
    let alive = true;
    QRCode.toString(text, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, color: { dark: '#000000', light: '#ffffff' } })
      .then((s) => alive && setSvg(s))
      .catch(() => alive && setSvg(''));
    return () => {
      alive = false;
    };
  }, [text]);
  // SVG stammt aus der QR-Bibliothek (nur Pfade, kein Nutzer-HTML)
  return svg ? <div className="aspect-square h-full [&>svg]:h-full [&>svg]:w-full" role="img" aria-label="QR-Code zur Pflanzenseite" dangerouslySetInnerHTML={{ __html: svg }} /> : <div className="aspect-square h-full bg-ink-800" />;
}

const SIZES = {
  s: { label: 'Klein (50 × 30 mm)', w: '50mm', h: '30mm' },
  m: { label: 'Mittel (70 × 40 mm)', w: '70mm', h: '40mm' },
} as const;

export function LabelsPage() {
  const route = useRoute();
  const { data } = useData();
  const growId = route.query.get('grow') ?? '';
  const only = route.query.get('plants')?.split(',').filter(Boolean);
  const size = (route.query.get('size') === 'm' ? 'm' : 's') as keyof typeof SIZES;
  const showStrain = route.query.get('strain') !== '0';
  const grow = data.grows.find((g) => g.id === growId);
  const plants = useMemo(() => data.plants.filter((p) => p.growId === growId && (!only || only.includes(p.id))).sort((a, b) => a.name.localeCompare(b.name, 'de')), [data.plants, growId, only?.join(',')]); // eslint-disable-line react-hooks/exhaustive-deps
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const path = typeof window !== 'undefined' ? window.location.pathname : '/';

  if (!grow) return <EmptyState icon={<QrCode />} title="Grow nicht gefunden" action={<a href={href('grows')} className="btn-primary">Zu den Grows</a>} />;
  const S = SIZES[size];
  const strainName = (p: Plant) => (p.strainId ? data.strains.find((s) => s.id === p.strainId)?.name : p.strainName);

  return (
    <div>
      <div className="no-print mb-6 space-y-4">
        <a href={href(`grows/${grow.id}?tab=plants`)} className="inline-flex items-center gap-1.5 text-[12px] text-ink-400 hover:text-ink-100">
          <ArrowLeft className="size-3.5" /> {grow.name}
        </a>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="page-title">Pflanzen-Etiketten</h1>
            <p className="mt-1 max-w-2xl text-sm text-ink-400">
              {plants.length} {plants.length === 1 ? 'Etikett' : 'Etiketten'} zum Ausdrucken. Der QR-Code enthält nur den Link zur Pflanzenseite in TERPGRID – kein Passwort, keine Daten. Ohne Anmeldung mit deinem Konto öffnet er nichts.
            </p>
          </div>
          <button type="button" className="btn-primary" onClick={() => window.print()} disabled={!plants.length}>
            <Printer className="size-4" /> Drucken
          </button>
        </div>
        <div className="flex flex-wrap gap-3 text-[13px]">
          <select className="input-base h-9 w-auto" aria-label="Etikettengröße" value={size} onChange={(e) => setQuery(route, { size: e.target.value === 's' ? undefined : e.target.value })}>
            {Object.entries(SIZES).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-ink-300">
            <input type="checkbox" className="accent-leaf-500" checked={showStrain} onChange={(e) => setQuery(route, { strain: e.target.checked ? undefined : '0' })} /> Sorte aufdrucken
          </label>
          {only && (
            <button type="button" className="btn-ghost h-9" onClick={() => setQuery(route, { plants: undefined })}>
              Alle Pflanzen des Grows
            </button>
          )}
        </div>
      </div>

      {plants.length === 0 ? (
        <EmptyState icon={<QrCode />} title="Keine Pflanzen" text="Dieser Grow hat noch keine Pflanzen." />
      ) : (
        <div className="label-sheet flex flex-wrap gap-3 print:gap-[2mm]">
          {plants.map((p) => (
            <div key={p.id} className="flex items-center gap-[2.5mm] overflow-hidden rounded-md border border-black/20 bg-white p-[2mm] text-black" style={{ width: S.w, height: S.h, breakInside: 'avoid' }}>
              <QrSvg text={plantLabelUrl(origin, path, p)} />
              <div className="min-w-0 flex-1 leading-tight">
                <p className="truncate font-semibold" style={{ fontSize: size === 'm' ? '11pt' : '9pt' }}>
                  {p.name}
                </p>
                {showStrain && strainName(p) && (
                  <p className="truncate" style={{ fontSize: size === 'm' ? '8pt' : '7pt' }}>
                    {strainName(p)}
                  </p>
                )}
                <p className="truncate" style={{ fontSize: '6.5pt' }}>
                  {grow.name}
                </p>
                <p className="mt-[1mm] font-mono" style={{ fontSize: '6.5pt' }}>
                  ID {shortId(p.id)} · ab {p.startDate.split('-').reverse().join('.')}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
