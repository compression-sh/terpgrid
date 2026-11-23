import { ArrowLeftRight, CalendarRange, Columns2, FlaskConical, Plus, Receipt, Trash2, Zap } from 'lucide-react';
import { useState } from 'react';
import { useData } from '../app/DataProvider';
import { href } from '../app/router';
import { OptionalNumber, SelectField, TextField, toOptionalNumber } from '../components/forms/Fields';
import { money } from '../components/grow/ExpenseList';
import { CompareSlider } from '../components/photos/CompareSlider';
import { Card } from '../components/ui/Card';
import { EmptyState } from '../components/ui/EmptyState';
import { PageHeader } from '../components/ui/PageHeader';
import { Segmented } from '../components/ui/Segmented';
import { Stat } from '../components/ui/Stat';
import {
  CM_PER_INCH,
  GRAMS_PER_OUNCE,
  LITERS_PER_GALLON,
  celsiusToFahrenheit,
  electricityCost,
  expenseTotal,
  fahrenheitToCelsius,
} from '../lib/analytics';
import { addDays, daysBetween, fmtDateLong, fmtDateTime, today } from '../lib/dates';
import { fmt } from '../lib/format';

function Formula({ children }: { children: React.ReactNode }) {
  return <div className="mt-4 overflow-x-auto rounded-lg border border-white/[0.05] bg-ink-850 px-3 py-2 font-mono text-[11.5px] text-ink-300">{children}</div>;
}

type UnitKind = 'temp' | 'weight' | 'volume' | 'length';
const UNITS: Record<UnitKind, { a: string; b: string; toB: (v: number) => number; toA: (v: number) => number; formula: string }> = {
  temp: { a: '°C', b: '°F', toB: celsiusToFahrenheit, toA: fahrenheitToCelsius, formula: '°F = °C × 9/5 + 32' },
  weight: { a: 'g', b: 'oz', toB: (g) => g / GRAMS_PER_OUNCE, toA: (oz) => oz * GRAMS_PER_OUNCE, formula: `1 oz = ${GRAMS_PER_OUNCE.toLocaleString('de-DE', { maximumFractionDigits: 4 })} g` },
  volume: { a: 'l', b: 'gal (US)', toB: (l) => l / LITERS_PER_GALLON, toA: (g) => g * LITERS_PER_GALLON, formula: `1 US-Gallone = ${LITERS_PER_GALLON.toLocaleString('de-DE', { maximumFractionDigits: 4 })} l` },
  length: { a: 'cm', b: 'in', toB: (c) => c / CM_PER_INCH, toA: (i) => i * CM_PER_INCH, formula: '1 in = 2,54 cm' },
};

function UnitConverter() {
  const [kind, setKind] = useState<UnitKind>('temp');
  const [a, setA] = useState('25');
  const [b, setB] = useState(String(fmt(celsiusToFahrenheit(25), 2)));
  const u = UNITS[kind];
  const sync = (from: 'a' | 'b', text: string) => {
    const n = toOptionalNumber(text);
    if (from === 'a') {
      setA(text);
      setB(n === undefined ? '' : fmt(u.toB(n), 3));
    } else {
      setB(text);
      setA(n === undefined ? '' : fmt(u.toA(n), 3));
    }
  };
  return (
    <Card title="Einheiten umrechnen" icon={<ArrowLeftRight className="size-4" />}>
      <Segmented
        size="sm"
        value={kind}
        onChange={(k) => {
          setKind(k);
          setA('');
          setB('');
        }}
        options={[
          { value: 'temp', label: 'Temperatur' },
          { value: 'weight', label: 'Gewicht' },
          { value: 'volume', label: 'Volumen' },
          { value: 'length', label: 'Länge' },
        ]}
      />
      <div className="mt-4 grid grid-cols-2 gap-3">
        <OptionalNumber label={u.a} unit={u.a} text={a} onText={(t) => sync('a', t)} min={kind === 'temp' ? -273.15 : 0} />
        <OptionalNumber label={u.b} unit={u.b.split(' ')[0]} text={b} onText={(t) => sync('b', t)} min={kind === 'temp' ? -459.67 : 0} />
      </div>
      <Formula>{u.formula}</Formula>
      <p className="hint mt-3">
        THC-spezifische Umrechnungen (g, mg, %) findest du im{' '}
        <a className="text-leaf-300 hover:underline" href={href('lab/tools')}>
          THC Lab
        </a>
        .
      </p>
    </Card>
  );
}

function ElectricityCalc() {
  const { settings } = useData();
  const [watts, setWatts] = useState('240');
  const [hours, setHours] = useState('18');
  const [days, setDays] = useState('30');
  const [price, setPrice] = useState('0,35');
  const r = electricityCost(toOptionalNumber(watts) ?? 0, toOptionalNumber(hours) ?? 0, toOptionalNumber(days) ?? 0, toOptionalNumber(price) ?? 0);
  return (
    <Card title="Stromkosten schätzen" subtitle="Für Lampen, Lüfter oder Heizmatten" icon={<Zap className="size-4" />}>
      <div className="grid grid-cols-2 gap-3">
        <OptionalNumber label="Leistung" unit="W" text={watts} onText={setWatts} min={0} max={100000} hint="Tatsächliche Aufnahme, nicht „entspricht … W“." />
        <OptionalNumber label="Betrieb pro Tag" unit="h" text={hours} onText={setHours} min={0} max={24} />
        <OptionalNumber label="Dauer" unit="Tage" text={days} onText={setDays} min={0} max={3650} />
        <OptionalNumber label="Strompreis" unit={`${settings.currency}/kWh`} text={price} onText={setPrice} min={0} max={10} />
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Stat label="Energie" value={r.kwh} unit="kWh" />
        <Stat label="Kosten" value={r.cost} unit={settings.currency} emphasis />
      </div>
      <Formula>kWh = W × h/Tag × Tage ÷ 1000 · Kosten = kWh × Preis</Formula>
      <p className="hint mt-3">Rechnerischer Wert bei konstanter Leistung. Dimmer, Steuerung und Standby verändern den echten Verbrauch – ein Messgerät liefert genauere Werte.</p>
    </Card>
  );
}

function ExpenseCalc() {
  const { settings, data } = useData();
  const recorded = data.expenses.reduce((sum, e) => sum + e.amount, 0);
  const [lines, setLines] = useState([
    { label: 'Erde / Substrat', amount: '', quantity: '1' },
    { label: 'Samen', amount: '', quantity: '1' },
  ]);
  const [yieldG, setYieldG] = useState('');
  const parsed = lines.map((l) => ({ label: l.label, amount: toOptionalNumber(l.amount) ?? 0, quantity: toOptionalNumber(l.quantity) ?? 0 }));
  const r = expenseTotal(parsed, toOptionalNumber(yieldG));
  return (
    <Card title="Grow-Kosten überschlagen" subtitle="Einfache Summe – nichts wird gespeichert" icon={<Receipt className="size-4" />}>
      <div className="space-y-2">
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_6.5rem_4.5rem_auto] items-end gap-2">
            <TextField label={i === 0 ? 'Posten' : ''} aria-label="Posten" value={l.label} onChange={(v) => setLines((s) => s.map((x, j) => (j === i ? { ...x, label: v } : x)))} />
            <TextField label={i === 0 ? `Preis (${settings.currency})` : ''} aria-label="Preis" inputMode="decimal" value={l.amount} onChange={(v) => setLines((s) => s.map((x, j) => (j === i ? { ...x, amount: v } : x)))} />
            <TextField label={i === 0 ? 'Anzahl' : ''} aria-label="Anzahl" inputMode="decimal" value={l.quantity} onChange={(v) => setLines((s) => s.map((x, j) => (j === i ? { ...x, quantity: v } : x)))} />
            <button type="button" className="btn-ghost mb-0.5 p-2" aria-label="Posten entfernen" onClick={() => setLines((s) => s.filter((_, j) => j !== i))}>
              <Trash2 className="size-4" />
            </button>
          </div>
        ))}
        <button type="button" className="btn-ghost py-1.5 text-xs" onClick={() => setLines((s) => [...s, { label: '', amount: '', quantity: '1' }])}>
          <Plus className="size-3.5" /> Posten
        </button>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        <OptionalNumber label="Ertrag (optional)" unit="g" text={yieldG} onText={setYieldG} min={0} />
        <div />
        <Stat label="Summe" value={r.total} unit={settings.currency} emphasis />
        <Stat label="Kosten je Gramm" value={r.perGram ?? Number.NaN} unit={r.perGram !== undefined ? settings.currency : ''} hint={r.perGram === undefined ? 'Ertrag angeben' : undefined} />
      </div>
      <Formula>Summe = Σ (Preis × Anzahl) · je Gramm = Summe ÷ Ertrag</Formula>
      <p className="hint mt-3">
        Dauerhaft erfasste Ausgaben gehören in einen Grow oder in die{' '}
        <a href={href('collection')} className="text-leaf-300 hover:underline">
          Sammlung
        </a>{' '}
        (aktuell erfasst: {money(recorded, settings.currency)}).
      </p>
    </Card>
  );
}

function DateCalc() {
  const { data } = useData();
  const t = today();
  const [from, setFrom] = useState(t);
  const [to, setTo] = useState(addDays(t, 56));
  const [base, setBase] = useState(t);
  const [offset, setOffset] = useState('70');
  const [growId, setGrowId] = useState(data.grows[0]?.id ?? '');
  const [growDate, setGrowDate] = useState(t);
  const diff = from && to ? daysBetween(from, to) : undefined;
  const off = toOptionalNumber(offset);
  const grow = data.grows.find((g) => g.id === growId);
  const growDayN = grow && growDate ? daysBetween(grow.startDate, growDate) + 1 : undefined;
  return (
    <Card title="Datum & Dauer" icon={<CalendarRange className="size-4" />}>
      <div className="space-y-5">
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">Tage zwischen zwei Daten</h3>
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Von" type="date" value={from} onChange={setFrom} />
            <TextField label="Bis" type="date" value={to} onChange={setTo} />
          </div>
          {diff !== undefined && (
            <p className="mt-2 font-mono text-[13px] text-ink-100">
              {diff} Tage · {fmt(diff / 7)} Wochen
            </p>
          )}
        </div>
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">Datum + Tage</h3>
          <div className="grid grid-cols-2 gap-3">
            <TextField label="Ausgangsdatum" type="date" value={base} onChange={setBase} />
            <OptionalNumber label="Tage (±)" text={offset} onText={setOffset} min={-36500} max={36500} />
          </div>
          {base && off !== undefined && <p className="mt-2 text-[13px] text-ink-100">{fmtDateLong(addDays(base, Math.round(off)))}</p>}
          <p className="hint mt-1">Reine Datumsrechnung – keine Vorhersage von Ernte- oder Blütezeiten.</p>
        </div>
        {data.grows.length > 0 && (
          <div>
            <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-500">Grow-Tag zu einem Datum</h3>
            <div className="grid grid-cols-2 gap-3">
              <SelectField label="Grow" value={growId} onChange={setGrowId} options={data.grows.map((g) => ({ value: g.id, label: g.name }))} />
              <TextField label="Datum" type="date" value={growDate} onChange={setGrowDate} />
            </div>
            {growDayN !== undefined && <p className="mt-2 font-mono text-[13px] text-ink-100">{growDayN > 0 ? `Tag ${growDayN} · Woche ${Math.ceil(growDayN / 7)}` : 'vor dem Start'}</p>}
          </div>
        )}
      </div>
    </Card>
  );
}

function PhotoCompareTool() {
  const { data } = useData();
  const photos = [...data.photos].sort((a, b) => a.takenAt.localeCompare(b.takenAt));
  const [a, setA] = useState(photos[0]?.id ?? '');
  const [b, setB] = useState(photos.at(-1)?.id ?? '');
  const pa = photos.find((p) => p.id === a);
  const pb = photos.find((p) => p.id === b);
  const label = (id: string) => {
    const p = photos.find((x) => x.id === id)!;
    const g = p.growId ? data.grows.find((x) => x.id === p.growId)?.name : undefined;
    const pl = p.plantId ? data.plants.find((x) => x.id === p.plantId)?.name : undefined;
    return [fmtDateTime(p.takenAt), g, pl].filter(Boolean).join(' · ');
  };
  return (
    <Card title="Foto-Vergleich" subtitle="Zwei beliebige eigene Fotos überlagern" icon={<Columns2 className="size-4" />}>
      {photos.length < 2 ? (
        <EmptyState compact title="Mindestens zwei Fotos nötig" action={<a href={href('photos')} className="btn-ghost">Zu den Fotos</a>} />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <SelectField label="Vorher" value={a} onChange={setA} options={photos.map((p) => ({ value: p.id, label: label(p.id) }))} />
            <SelectField label="Nachher" value={b} onChange={setB} options={photos.map((p) => ({ value: p.id, label: label(p.id) }))} />
          </div>
          {pa && pb && <CompareSlider before={pa} after={pb} />}
        </div>
      )}
    </Card>
  );
}

export function UtilitiesPage() {
  return (
    <div>
      <PageHeader
        title="Werkzeuge"
        subtitle="Kleine Rechner mit transparenten Formeln und Einheiten."
        actions={
          <a href={href('lab/tools')} className="btn-ghost">
            <FlaskConical className="size-4" /> THC-Werkzeuge
          </a>
        }
      />
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <UnitConverter />
        <ElectricityCalc />
        <ExpenseCalc />
        <DateCalc />
        <div className="lg:col-span-2">
          <PhotoCompareTool />
        </div>
      </div>
    </div>
  );
}
