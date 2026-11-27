import { ArrowLeft, FileDown, Printer } from "lucide-react";
import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from "recharts";
import { useData } from "../../app/DataProvider";
import { href } from "../../app/router";
import { money } from "../../components/grow/ExpenseList";
import { PhotoImg } from "../../components/photos/PhotoImg";
import { EmptyState } from "../../components/ui/EmptyState";
import { fmtDate, fmtDateTime, today } from "../../lib/dates";
import { fmt } from "../../lib/format";
import {
  ACTIVITY_LABEL,
  EXPENSE_CATEGORY_LABEL,
  OBSERVATION_LABEL,
  PLANT_TYPE_LABEL,
  SETTING_LABEL,
  STATUS_LABEL,
} from "../../lib/grow/labels";
import { CONTEXT_LABEL } from "../../lib/grow/measure";
import { PHASE_LABEL, phaseSpans } from "../../lib/grow/phases";
import {
  DERIVED,
  METRICS,
  type DerivedKey,
  type MetricKey,
} from "../../lib/grow/series";
import {
  growCompleteness,
  growData,
  seriesByGrowDay,
  summarizeGrow,
} from "../../lib/grow/summary";

const SECTIONS = [
  { id: "plants", label: "Pflanzen" },
  { id: "measurements", label: "Messwerte & Diagramme" },
  { id: "timeline", label: "Verlauf" },
  { id: "photos", label: "Foto-Auswahl" },
  { id: "expenses", label: "Ausgaben" },
  { id: "experiments", label: "Experimente & Phänotypen" },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

function ReportChart({
  points,
  label,
  unit,
}: {
  points: { day: number; value: number }[];
  label: string;
  unit: string;
}) {
  return (
    <figure className="break-inside-avoid rounded-lg border border-white/[0.08] p-3 print:border-gray-300">
      <figcaption className="mb-1 text-[12px] font-medium">
        {label}
        {unit ? ` (${unit})` : ""} – Tage seit Start
      </figcaption>
      <div
        className="h-40 w-full"
        role="img"
        aria-label={`${label}: ${points.length} Messpunkte`}
      >
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={points}
            margin={{ top: 4, right: 8, bottom: 0, left: -12 }}
          >
            <CartesianGrid vertical={false} stroke="#8884" />
            <XAxis
              dataKey="day"
              type="number"
              domain={[0, "dataMax"]}
              tickLine={false}
              fontSize={10}
            />
            <YAxis
              dataKey="value"
              tickLine={false}
              fontSize={10}
              width={44}
              domain={["auto", "auto"]}
            />
            <Line
              dataKey="value"
              stroke="#23a061"
              strokeWidth={1.5}
              dot={{ r: 2.5, fill: "#23a061" }}
              isAnimationActive={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/**
 * Druckoptimierter Projektbericht. PDF: über den Druckdialog des Browsers („Als PDF speichern“) –
 * keine zusätzliche Rendering-Bibliothek, keine Übertragung an Dritte. Fotos werden wie in der App
 * aus dem eigenen, angemeldeten Speicher geladen.
 */
export function GrowReport({ growId }: { growId: string }) {
  const { data, settings } = useData();
  const grow = data.grows.find((g) => g.id === growId);
  const [on, setOn] = useState<Record<SectionId, boolean>>({
    plants: true,
    measurements: true,
    timeline: true,
    photos: true,
    expenses: true,
    experiments: true,
  });
  const d = useMemo(() => growData(growId, data), [growId, data]);
  if (!grow)
    return (
      <EmptyState
        title="Grow nicht gefunden"
        action={
          <a href={href("grows")} className="btn-primary">
            Zu den Grows
          </a>
        }
      />
    );
  const s = summarizeGrow(grow, d);
  const completeness = growCompleteness(grow, d);
  const spans = phaseSpans(grow.phaseDates, today(), grow.completedDate);
  const strainOf = (id?: string) =>
    id ? data.strains.find((x) => x.id === id) : undefined;
  const strains = [
    ...new Map(
      d.plants
        .map((p) => strainOf(p.strainId))
        .filter((x): x is NonNullable<typeof x> => !!x)
        .map((x) => [x.id, x]),
    ).values(),
  ];
  const metrics = [...METRICS, ...DERIVED]
    .map((m) => ({
      m,
      pts: seriesByGrowDay(grow, d.activities, m.key as MetricKey | DerivedKey),
    }))
    .filter((x) => x.pts.length > 0);
  const timeline = [...d.activities].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  const photos = [...d.photos].sort((a, b) =>
    a.takenAt.localeCompare(b.takenAt),
  );
  // Foto-Auswahl: gleichmäßig über die Zeit verteilt (max. 8), nicht nach „Qualität“ bewertet
  const picks =
    photos.length <= 8
      ? photos
      : Array.from(
          { length: 8 },
          (_, i) => photos[Math.round((i * (photos.length - 1)) / 7)]!,
        );
  const space = (id?: string) =>
    id ? data.inventory.find((x) => x.id === id)?.name : undefined;

  return (
    <div className="report">
      <div className="no-print mb-6 space-y-3">
        <a
          href={href(`grows/${grow.id}`)}
          className="inline-flex items-center gap-1.5 text-[12px] text-ink-400 hover:text-ink-100"
        >
          <ArrowLeft className="size-3.5" /> {grow.name}
        </a>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="page-title">
              Projektbericht
            </h1>
            <p className="mt-1 max-w-2xl text-sm text-ink-400">
              Druckansicht aus deinen eigenen Daten. Für eine PDF-Datei im
              Druckdialog „Als PDF speichern“ wählen. Der Bericht verlässt dein
              Gerät nur, wenn du die Datei selbst weitergibst.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              className="btn-ghost"
              onClick={() => window.print()}
            >
              <FileDown className="size-4" /> Als PDF
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={() => window.print()}
            >
              <Printer className="size-4" /> Drucken
            </button>
          </div>
        </div>
        <fieldset className="flex flex-wrap gap-2">
          <legend className="sr-only">Abschnitte</legend>
          {SECTIONS.map((x) => (
            <label
              key={x.id}
              className="flex min-h-9 items-center gap-2 rounded-lg border border-white/[0.07] px-3 text-[12px] text-ink-300"
            >
              <input
                type="checkbox"
                className="accent-leaf-500"
                checked={on[x.id]}
                onChange={(e) =>
                  setOn((o) => ({ ...o, [x.id]: e.target.checked }))
                }
              />{" "}
              {x.label}
            </label>
          ))}
        </fieldset>
      </div>

      <article className="report-body mx-auto max-w-4xl space-y-7 rounded-2xl border border-white/[0.06] bg-ink-900/60 p-5 sm:p-8 print:max-w-none print:rounded-none print:border-0 print:bg-white print:p-0">
        <header className="border-b border-white/[0.08] pb-4 print:border-gray-300">
          <p className="text-[11px] uppercase tracking-[0.16em] text-ink-400">
            TERPGRID · Projektbericht · erstellt {fmtDate(today())}
          </p>
          <h2 className="mt-1 text-3xl font-semibold tracking-tight">
            {grow.name}
          </h2>
          {grow.description && (
            <p className="mt-1 text-[14px] text-ink-300">{grow.description}</p>
          )}
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-4">
            {[
              ["Status", STATUS_LABEL[grow.status]],
              ["Start", fmtDate(grow.startDate)],
              [
                "Dauer",
                s.durationDays !== undefined
                  ? `${s.durationDays} Tage${s.running ? " (läuft)" : ""}`
                  : "–",
              ],
              [
                "Umgebung",
                [SETTING_LABEL[grow.setting], grow.medium, grow.environment]
                  .filter(Boolean)
                  .join(" · "),
              ],
              ["Pflanzen", String(s.plants)],
              [
                "Einträge",
                `${s.activities} (${s.measurements} mit Messwerten)`,
              ],
              ["Fotos", String(s.photos)],
              [
                "Ausgaben",
                s.expenseCount
                  ? money(s.expenses, settings.currency)
                  : "keine erfasst",
              ],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-[11px] text-ink-400">{k}</dt>
                <dd className="font-medium">{v}</dd>
              </div>
            ))}
          </dl>
          {spans.length > 0 && (
            <p className="mt-3 text-[12px] text-ink-300">
              Phasen:{" "}
              {spans
                .map(
                  (p) =>
                    `${PHASE_LABEL[p.phase]} ab ${fmtDate(p.start)} (${p.days} T.${p.ongoing ? ", läuft" : ""})`,
                )
                .join(" · ")}
            </p>
          )}
          {strains.length > 0 && (
            <p className="mt-1 text-[12px] text-ink-300">
              Sorten:{" "}
              {strains
                .map((x) => `${x.name}${x.breeder ? ` (${x.breeder})` : ""}`)
                .join(", ")}
            </p>
          )}
          <p className="mt-2 text-[11px] text-ink-400">
            Dokumentation:{" "}
            {completeness
              .map(
                (c) =>
                  `${c.label} ${c.state === "ok" ? "vollständig" : c.state === "partial" ? "teilweise" : "fehlt"} (${c.detail})`,
              )
              .join(" · ")}
          </p>
        </header>

        {on.plants && (
          <section aria-labelledby="r-plants" className="break-inside-avoid">
            <h3 id="r-plants" className="mb-2 text-lg font-semibold">
              Pflanzen
            </h3>
            {d.plants.length === 0 ? (
              <p className="text-[13px] text-ink-400">
                Keine Pflanzen erfasst.
              </p>
            ) : (
              <div className="overflow-x-auto print:overflow-visible">
                <table className="w-full text-left text-[12px]">
                  <thead className="text-ink-400">
                    <tr>
                      <th className="py-1 pr-2 font-medium">Name</th>
                      <th className="py-1 pr-2 font-medium">Sorte</th>
                      <th className="py-1 pr-2 font-medium">Typ</th>
                      <th className="py-1 pr-2 font-medium">Start</th>
                      <th className="py-1 pr-2 font-medium">Standort</th>
                      <th className="py-1 text-right font-medium">
                        Ergebnis trocken
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {d.plants.map((p) => (
                      <tr
                        key={p.id}
                        className="border-t border-white/[0.06] print:border-gray-200"
                      >
                        <td className="py-1.5 pr-2 font-medium">{p.name}</td>
                        <td className="py-1.5 pr-2">
                          {strainOf(p.strainId)?.name ?? p.strainName ?? "–"}
                        </td>
                        <td className="py-1.5 pr-2">
                          {PLANT_TYPE_LABEL[p.type]}
                        </td>
                        <td className="py-1.5 pr-2">{fmtDate(p.startDate)}</td>
                        <td className="py-1.5 pr-2">
                          {space(p.spaceId) ?? "–"}
                        </td>
                        <td className="py-1.5 text-right font-mono">
                          {p.outcome?.dryWeightG !== undefined
                            ? `${fmt(p.outcome.dryWeightG)} g`
                            : "nicht erfasst"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {on.measurements && (
          <section aria-labelledby="r-meas">
            <h3 id="r-meas" className="mb-2 text-lg font-semibold">
              Messwerte
            </h3>
            {metrics.length === 0 ? (
              <p className="text-[13px] text-ink-400">
                Keine Messwerte erfasst.
              </p>
            ) : (
              <>
                <div className="overflow-x-auto print:overflow-visible">
                  <table className="mb-3 w-full text-left text-[12px]">
                    <thead className="text-ink-400">
                      <tr>
                        <th className="py-1 pr-2 font-medium">Messgröße</th>
                        <th className="py-1 pr-2 text-right font-medium">
                          Anzahl
                        </th>
                        <th className="py-1 pr-2 text-right font-medium">
                          Min – Max
                        </th>
                        <th className="py-1 text-right font-medium">
                          Letzter Wert
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {metrics.map(({ m, pts }) => {
                        const vals = pts.map((p) => p.value);
                        const st = {
                          count: vals.length,
                          min: vals.length ? Math.min(...vals) : undefined,
                          max: vals.length ? Math.max(...vals) : undefined,
                          latest: pts.at(-1),
                        };
                        const u = m.unit ? ` ${m.unit}` : "";
                        return (
                          <tr
                            key={m.key}
                            className="border-t border-white/[0.06] print:border-gray-200"
                          >
                            <td className="py-1.5 pr-2">{m.label}</td>
                            <td className="py-1.5 pr-2 text-right font-mono">
                              {st.count}
                            </td>
                            <td className="py-1.5 pr-2 text-right font-mono">
                              {st.min !== undefined
                                ? `${fmt(st.min)} – ${fmt(st.max!)}${u}`
                                : "–"}
                            </td>
                            <td className="py-1.5 text-right font-mono">
                              {st.latest ? `${fmt(st.latest.value)}${u}` : "–"}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="mb-3 text-[11px] text-ink-400">
                  pH/EC über alle Messkontexte; berechnete Größen (VPD, DLI) aus
                  Rohwerten derselben Messung. Keine Interpolation.
                </p>
                <div className="grid gap-3 sm:grid-cols-2 print:grid-cols-2">
                  {metrics.slice(0, 6).map(({ m, pts }) => (
                    <ReportChart
                      key={m.key}
                      points={pts}
                      label={m.label}
                      unit={m.unit}
                    />
                  ))}
                </div>
              </>
            )}
          </section>
        )}

        {on.timeline && (
          <section aria-labelledby="r-time">
            <h3 id="r-time" className="mb-2 text-lg font-semibold">
              Verlauf{" "}
              <span className="text-[12px] font-normal text-ink-400">
                ({timeline.length} Einträge)
              </span>
            </h3>
            {timeline.length === 0 ? (
              <p className="text-[13px] text-ink-400">Keine Einträge.</p>
            ) : (
              <ol className="space-y-1.5 text-[12px]">
                {timeline.map((a) => {
                  const m = a.measurements;
                  const vals = m
                    ? METRICS.filter((x) => typeof m[x.key] === "number").map(
                        (x) =>
                          `${x.label} ${fmt(m[x.key] as number)}${x.unit ? ` ${x.unit}` : ""}${x.contextKey && m[x.contextKey] ? ` (${CONTEXT_LABEL[m[x.contextKey]!]})` : ""}`,
                      )
                    : [];
                  return (
                    <li
                      key={a.id}
                      className="break-inside-avoid border-l-2 border-white/[0.1] pl-3 print:border-gray-300"
                    >
                      <span className="font-mono text-ink-400">
                        {fmtDateTime(a.date)}
                      </span>{" "}
                      ·{" "}
                      <span className="font-medium">
                        {a.title || ACTIVITY_LABEL[a.type]}
                      </span>
                      {a.plantId && (
                        <span className="text-ink-400">
                          {" "}
                          · {d.plants.find((p) => p.id === a.plantId)?.name}
                        </span>
                      )}
                      {(a.observations?.length ?? 0) > 0 && (
                        <span className="text-ink-400">
                          {" "}
                          ·{" "}
                          {a
                            .observations!.map((o) => OBSERVATION_LABEL[o])
                            .join(", ")}
                        </span>
                      )}
                      {vals.length > 0 && (
                        <div className="font-mono text-[11px] text-ink-300">
                          {vals.join(" · ")}
                        </div>
                      )}
                      {a.notes && (
                        <div className="whitespace-pre-wrap text-ink-300">
                          {a.notes}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
            )}
          </section>
        )}

        {on.photos && (
          <section aria-labelledby="r-photos" className="break-inside-avoid">
            <h3 id="r-photos" className="mb-2 text-lg font-semibold">
              Foto-Auswahl{" "}
              <span className="text-[12px] font-normal text-ink-400">
                ({picks.length} von {photos.length}, gleichmäßig über die Zeit)
              </span>
            </h3>
            {picks.length === 0 ? (
              <p className="text-[13px] text-ink-400">Keine Fotos.</p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 print:grid-cols-4">
                {picks.map((p) => (
                  <figure key={p.id} className="break-inside-avoid">
                    <PhotoImg
                      photoId={p.id}
                      variant="full"
                      alt={`Foto vom ${fmtDate(p.takenAt.slice(0, 10))}`}
                      className="aspect-square w-full rounded-md"
                    />
                    <figcaption className="mt-0.5 text-[10px] text-ink-400">
                      {fmtDate(p.takenAt.slice(0, 10))}
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </section>
        )}

        {on.expenses && (
          <section aria-labelledby="r-exp" className="break-inside-avoid">
            <h3 id="r-exp" className="mb-2 text-lg font-semibold">
              Ausgaben
            </h3>
            {d.expenses.length === 0 ? (
              <p className="text-[13px] text-ink-400">
                Keine Ausgaben erfasst.
              </p>
            ) : (
              <div className="overflow-x-auto print:overflow-visible">
                <table className="w-full text-left text-[12px]">
                  <tbody>
                    {[...d.expenses]
                      .sort((a, b) => a.date.localeCompare(b.date))
                      .map((e) => (
                        <tr
                          key={e.id}
                          className="border-t border-white/[0.06] print:border-gray-200"
                        >
                          <td className="py-1.5 pr-2 font-mono text-ink-400">
                            {fmtDate(e.date)}
                          </td>
                          <td className="py-1.5 pr-2">
                            {EXPENSE_CATEGORY_LABEL[e.category]}
                          </td>
                          <td className="py-1.5 pr-2">{e.description}</td>
                          <td className="py-1.5 text-right font-mono">
                            {money(e.amount, settings.currency)}
                          </td>
                        </tr>
                      ))}
                    <tr className="border-t border-white/[0.12] font-semibold print:border-gray-400">
                      <td colSpan={3} className="py-1.5">
                        Summe
                      </td>
                      <td className="py-1.5 text-right font-mono">
                        {money(s.expenses, settings.currency)}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </section>
        )}

        {on.experiments &&
          ((grow.experiments?.length ?? 0) > 0 ||
            d.plants.some((p) => p.phenotype)) && (
            <section aria-labelledby="r-exp2">
              <h3 id="r-exp2" className="mb-2 text-lg font-semibold">
                Experimente & Phänotypen
              </h3>
              {(grow.experiments ?? []).map((x) => (
                <div key={x.id} className="mb-3 break-inside-avoid text-[12px]">
                  <p className="font-medium">
                    {x.name}{" "}
                    <span className="font-normal text-ink-400">
                      ({fmtDate(x.startDate)}
                      {x.endDate ? ` – ${fmtDate(x.endDate)}` : ""})
                    </span>
                  </p>
                  {x.purpose && <p>Ziel: {x.purpose}</p>}
                  <p className="text-ink-300">
                    Pflanzen:{" "}
                    {x.plantIds
                      .map((id) => d.plants.find((p) => p.id === id)?.name)
                      .filter(Boolean)
                      .join(", ") || "–"}
                  </p>
                  {x.observations && (
                    <p className="whitespace-pre-wrap">
                      Beobachtungen: {x.observations}
                    </p>
                  )}
                  {x.outcome && (
                    <p className="whitespace-pre-wrap">Ergebnis: {x.outcome}</p>
                  )}
                </div>
              ))}
              {d.plants
                .filter((p) => p.phenotype)
                .map((p) => (
                  <div
                    key={p.id}
                    className="mb-2 break-inside-avoid text-[12px]"
                  >
                    <p className="font-medium">Phänotyp: {p.name}</p>
                    <p className="text-ink-300">
                      {Object.entries(p.phenotype!)
                        .filter(([k, v]) => k !== "updatedAt" && v)
                        .map(([, v]) => v)
                        .join(" · ")}
                    </p>
                  </div>
                ))}
              <p className="text-[11px] text-ink-400">
                Persönliche Beobachtungen – keine belegten
                Ursache-Wirkungs-Zusammenhänge.
              </p>
            </section>
          )}

        {grow.notes && (
          <section aria-labelledby="r-notes" className="break-inside-avoid">
            <h3 id="r-notes" className="mb-2 text-lg font-semibold">
              Notizen
            </h3>
            <p className="whitespace-pre-wrap text-[13px]">{grow.notes}</p>
          </section>
        )}
        <footer className="border-t border-white/[0.08] pt-3 text-[10px] text-ink-400 print:border-gray-300">
          Erstellt mit TERPGRID aus persönlichen Aufzeichnungen. Werte sind
          eigene Angaben bzw. Messungen mit eigenen Geräten.
        </footer>
      </article>
    </div>
  );
}
