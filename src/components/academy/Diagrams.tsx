import { useId, useState } from 'react';
import { SRC } from '../../lib/academy/sources';
import { fmt } from '../../lib/format';
import { dli, svpKPa, vpd } from '../../lib/grow/measure';
import type { KbDiagram } from '../../lib/knowledge';

/** VPD-Bänder laut Literaturübersicht in Corredor-Perilla et al. (2025) – Orientierung, keine geprüften Optima */
const VPD_BANDS = [
  { label: 'Steckling/Sämling', lo: 0.5, hi: 1.0, color: '#7cc7d9' },
  { label: 'Wachstum', lo: 0.7, hi: 1.2, color: '#5fe39a' },
  { label: 'Blüte', lo: 1.0, hi: 1.5, color: '#f5d061' },
];

function Slider({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }) {
  const id = useId();
  return (
    <div className="min-w-0 flex-1">
      <label htmlFor={id} className="flex justify-between text-[12px] text-ink-300">
        <span>{label}</span>
        <span className="font-mono text-ink-100">
          {fmt(value)} {unit}
        </span>
      </label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1.5 w-full accent-leaf-400" />
    </div>
  );
}

function Frame({ title, children, caption }: { title: string; children: React.ReactNode; caption: React.ReactNode }) {
  return (
    <figure className="mt-6 rounded-2xl border border-white/[0.07] bg-ink-900/60 p-4 sm:p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-400">{title}</p>
      <div className="mt-3">{children}</div>
      <figcaption className="mt-3 text-[11.5px] leading-relaxed text-ink-500">{caption}</figcaption>
    </figure>
  );
}

/** Interaktives VPD-Diagramm: Temperatur × relative Feuchte, mit Orientierungsbändern */
export function VpdDiagram() {
  const [t, setT] = useState(25);
  const [rh, setRh] = useState(60);
  const v = vpd({ temperatureC: t, humidityPct: rh })!.value;
  const temps = Array.from({ length: 11 }, (_, i) => 16 + i * 2); // 16–36 °C
  const rhs = Array.from({ length: 13 }, (_, i) => 30 + i * 5); // 30–90 %
  const near = (xs: number[], v: number) => xs.reduce((a, b) => (Math.abs(b - v) < Math.abs(a - v) ? b : a));
  const nearT = near(temps, t);
  const nearRh = near(rhs, rh);
  const color = (x: number) => (x < 0.4 ? '#38bdf8' : x < 0.8 ? '#7cc7d9' : x < 1.2 ? '#5fe39a' : x < 1.6 ? '#f5d061' : '#f59e8b');
  return (
    <Frame
      title="Dampfdruckdefizit (Luft-VPD)"
      caption={
        <>
          VPD = SVP(T) × (1 − rF/100), SVP nach Tetens; Blatttemperatur = Lufttemperatur angenommen. Farbige Bänder: in der Literatur genannte Bereiche laut{' '}
          <a className="text-leaf-300 hover:underline" href={SRC.corredor2025.url} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer">
            Corredor-Perilla et al. (2025)
          </a>{' '}
          – Orientierung, keine für jede Sorte geprüften Optima.
        </>
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <Slider label="Lufttemperatur" value={t} min={14} max={36} step={0.5} unit="°C" onChange={setT} />
        <Slider label="Relative Feuchte" value={rh} min={20} max={95} step={1} unit="%" onChange={setRh} />
      </div>
      <p className="mt-3 text-[13px] text-ink-200" aria-live="polite">
        VPD bei {fmt(t)} °C und {rh} %: <span className="font-mono text-[15px] font-semibold text-ink-50">{fmt(v)} kPa</span>
        <span className="text-ink-500"> · Sättigungsdampfdruck {fmt(Math.round(svpKPa(t) * 100) / 100)} kPa</span>
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {VPD_BANDS.map((b) => {
          const inBand = v >= b.lo && v <= b.hi;
          return (
            <span key={b.label} className={`rounded-full border px-2.5 py-1 text-[11.5px] ${inBand ? 'text-ink-50' : 'border-white/[0.07] text-ink-500'}`} style={inBand ? { borderColor: `${b.color}80`, background: `${b.color}1f` } : undefined}>
              {inBand ? '✓ ' : ''}
              {b.label}: {fmt(b.lo)}–{fmt(b.hi)} kPa
            </span>
          );
        })}
      </div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[480px] border-separate border-spacing-0.5 text-center text-[10px]" aria-label="VPD-Tabelle in kPa">
          <thead>
            <tr>
              <th className="pr-1 text-right font-normal text-ink-500">°C / rF</th>
              {rhs.map((r) => (
                <th key={r} scope="col" className="font-normal text-ink-500">
                  {r}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {temps.map((tt) => (
              <tr key={tt}>
                <th scope="row" className="pr-1 text-right font-normal text-ink-500">
                  {tt}
                </th>
                {rhs.map((r) => {
                  const x = vpd({ temperatureC: tt, humidityPct: r })!.value;
                  const sel = tt === nearT && r === nearRh;
                  return (
                    <td key={r} className={`rounded font-mono ${sel ? 'ring-2 ring-white' : ''}`} style={{ background: `${color(x)}${sel ? 'cc' : '40'}`, color: sel ? '#0a0d0c' : '#dfe7e3' }}>
                      {x.toFixed(1)}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Frame>
  );
}

/** DLI aus PPFD und Lichtdauer, mit den Lichtstufen aus den Academy-Studien als Bezug */
export function DliDiagram() {
  const [ppfd, setPpfd] = useState(800);
  const [h, setH] = useState(12);
  const value = dli({ ppfd, photoperiodH: h })!;
  const max = (1800 * 18 * 3600) / 1e6;
  const marks = [
    { p: 600, label: '600' },
    { p: 1000, label: '1.000' },
    { p: 1800, label: '1.800' },
  ];
  return (
    <Frame
      title="Tageslichtintegral (DLI)"
      caption={
        <>
          DLI = PPFD × Stunden × 3600 / 10⁶ (konstante PPFD angenommen). Markiert sind Lichtstufen aus den Studien von{' '}
          <a className="text-leaf-300 hover:underline" href={SRC.llewellyn2022.url} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer">
            Llewellyn et al. (2022)
          </a>{' '}
          (600–1.000) und{' '}
          <a className="text-leaf-300 hover:underline" href={SRC.rodriguez2021.url} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer">
            Rodriguez-Morrison et al. (2021)
          </a>{' '}
          (bis 1.800 µmol·m⁻²·s⁻¹) bei 12 Stunden.
        </>
      }
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <Slider label="PPFD" value={ppfd} min={100} max={1800} step={50} unit="µmol·m⁻²·s⁻¹" onChange={setPpfd} />
        <Slider label="Lichtdauer" value={h} min={8} max={18} step={0.5} unit="h" onChange={setH} />
      </div>
      <p className="mt-3 text-[13px] text-ink-200" aria-live="polite">
        DLI: <span className="font-mono text-[15px] font-semibold text-ink-50">{fmt(value)} mol·m⁻²·d⁻¹</span>
      </p>
      <svg viewBox="0 0 400 54" className="mt-3 w-full" aria-hidden>
        <rect x="0" y="16" width="400" height="12" rx="6" fill="rgb(255 255 255 / 0.06)" />
        <rect x="0" y="16" width={(value / max) * 400} height="12" rx="6" fill="#f5d061" fillOpacity="0.85" />
        {marks.map((m) => {
          const x = (((m.p * 12 * 3600) / 1e6) / max) * 400;
          return (
            <g key={m.p}>
              <line x1={x} x2={x} y1="10" y2="34" stroke="#dfe7e3" strokeOpacity="0.5" strokeDasharray="2 2" />
              <text x={x} y="46" fill="#8c9a95" fontSize="9" textAnchor="middle">
                {m.label} × 12 h
              </text>
            </g>
          );
        })}
      </svg>
    </Frame>
  );
}

/** Lebenszyklus photoperiodischer Pflanzen (schematisch, ohne Zeitangaben je Sorte) */
export function LifecycleDiagram() {
  const steps = [
    { t: 'Keimung / Steckling', d: 'Bewurzelung', c: '#7cc7d9' },
    { t: 'Wachstum', d: 'langer Tag, z. B. 18 h', c: '#5fe39a' },
    { t: 'Blüte', d: 'lange Nacht, üblich 12 h', c: '#f5d061' },
    { t: 'Ernte', d: 'Narbenfarbe als Hinweis', c: '#f59e8b' },
    { t: 'Trocknen & Curen', d: 'Feuchte senken, lagern', c: '#b39ddb' },
  ];
  return (
    <Frame title="Ablauf (photoperiodische Sorten)" caption="Schema. Dauer je Phase hängt von Sorte, Umwelt und Zielen ab; Autoflowering-Sorten blühen weitgehend unabhängig von der Tageslänge.">
      <ol className="grid gap-2 sm:grid-cols-5">
        {steps.map((s, i) => (
          <li key={s.t} className="relative rounded-xl border border-white/[0.07] p-3" style={{ background: `${s.c}12` }}>
            <span className="font-mono text-[10px] text-ink-500">{i + 1}</span>
            <p className="text-[12.5px] font-semibold" style={{ color: s.c }}>
              {s.t}
            </p>
            <p className="mt-0.5 text-[11px] text-ink-400">{s.d}</p>
          </li>
        ))}
      </ol>
    </Frame>
  );
}

/** Vier Stufen der Narbenfarbe nach Tran et al. (2025) */
export function StigmaDiagram() {
  const stages = [
    { n: 1, label: 'ganz weiß', amber: 0 },
    { n: 2, label: 'teilweise bernstein', amber: 0.35 },
    { n: 3, label: 'überwiegend bernstein', amber: 0.7 },
    { n: 4, label: 'ganz bernstein', amber: 1 },
  ];
  const mix = (a: number) => {
    const w = [236, 236, 228];
    const b = [214, 140, 52];
    return `rgb(${w.map((x, i) => Math.round(x + (b[i]! - x) * a)).join(',')})`;
  };
  return (
    <Frame
      title="Narbenfarbe in vier Stufen"
      caption={
        <>
          Einteilung nach{' '}
          <a className="text-leaf-300 hover:underline" href={SRC.tran2025.url} target="_blank" rel="noopener noreferrer nofollow" referrerPolicy="no-referrer">
            Tran et al. (2025)
          </a>
          . Bei 22 von 25 Genotypen lag das Cannabinoid-Maximum zwischen Stufe 3 und 4; einige erreichten es früher. Schematische Darstellung, kein Foto.
        </>
      }
    >
      <div className="grid grid-cols-4 gap-2">
        {stages.map((s) => (
          <div key={s.n} className={`rounded-xl border p-2 text-center ${s.n >= 3 ? 'border-leaf-500/30' : 'border-white/[0.07]'}`}>
            <svg viewBox="0 0 60 60" className="mx-auto h-14 w-14" aria-hidden>
              {Array.from({ length: 9 }, (_, i) => {
                const a = (i / 9) * Math.PI - Math.PI;
                const isAmber = i / 9 < s.amber;
                return <path key={i} d={`M30 52 Q ${30 + 26 * Math.cos(a) * 0.5} ${40 + 22 * Math.sin(a) * 0.5} ${30 + 26 * Math.cos(a)} ${44 + 34 * Math.sin(a)}`} stroke={isAmber ? mix(1) : mix(0)} strokeWidth="2.2" fill="none" strokeLinecap="round" />;
              })}
            </svg>
            <p className="font-mono text-[11px] text-ink-300">Stufe {s.n}</p>
            <p className="text-[10.5px] text-ink-500">{s.label}</p>
          </div>
        ))}
      </div>
    </Frame>
  );
}

export function KbDiagramView({ id }: { id: KbDiagram }) {
  if (id === 'vpd') return <VpdDiagram />;
  if (id === 'dli') return <DliDiagram />;
  if (id === 'lifecycle') return <LifecycleDiagram />;
  return <StigmaDiagram />;
}
