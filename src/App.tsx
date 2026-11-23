import { BookOpen, Bookmark, Calculator, Cigarette, Clock, Cookie, Gauge, GitCompare, Leaf, Lock, X } from 'lucide-react';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import { CompareView } from './features/CompareView';
import { DosageAnalyzer } from './features/DosageAnalyzer';
import { EdiblesCalculator } from './features/EdiblesCalculator';
import { SavedView } from './features/SavedView';
import { SmokingCalculator } from './features/SmokingCalculator';
import { SourcesView } from './features/SourcesView';
import { TimelineView } from './features/TimelineView';
import { ToolsView } from './features/ToolsView';
import { useLocalState } from './hooks/useLocalState';
import { type Recipe, newRecipe } from './lib/calc/compare';
import { type EdibleInput, defaultEdibleInput } from './lib/calc/edibles';
import { type SmokingInput, defaultSmokingInput } from './lib/calc/smoking';
import { isEdibleInput, isRecipeList, isSmokingInput } from './lib/guards';
import { type CalculationKind, type SavedCalculation, clearSaved, createSaved, loadSaved, persistSaved } from './lib/storage';

type TabId = 'edibles' | 'smoking' | 'dosage' | 'timeline' | 'tools' | 'compare' | 'saved' | 'sources';

const TABS: { id: TabId; label: string; icon: ReactNode; title: string; subtitle: string }[] = [
  { id: 'edibles', label: 'Edibles', icon: <Cookie className="size-4" />, title: 'Edibles & Cannabutter', subtitle: 'THC-Gehalt von Butter, Rezept und Portion abschätzen – mit Schwankungsbreite.' },
  { id: 'smoking', label: 'Joint', icon: <Cigarette className="size-4" />, title: 'Joint & Rauchen', subtitle: 'Theoretischer THC-Gehalt und grobe Spannbreite der tatsächlichen Aufnahme.' },
  { id: 'dosage', label: 'Dosierung', icon: <Gauge className="size-4" />, title: 'Dosis & Potenz', subtitle: 'Potenz einordnen, Edible-Dosen mit vorsichtigen Referenzbereichen vergleichen.' },
  { id: 'timeline', label: 'Zeitachse', icon: <Clock className="size-4" />, title: 'Wirkungsdauer', subtitle: 'Typische Zeitbereiche für Wirkeintritt, Hauptwirkung, Abklingen und Nachwirkungen.' },
  { id: 'tools', label: 'Werkzeuge', icon: <Calculator className="size-4" />, title: 'Werkzeuge', subtitle: 'Umrechnungen, Konzentrationen, Verhältnisse und Umkehrrechner.' },
  { id: 'compare', label: 'Vergleich', icon: <GitCompare className="size-4" />, title: 'Rezeptvergleich', subtitle: 'Mehrere hypothetische Rezepte nebeneinander vergleichen.' },
  { id: 'saved', label: 'Gespeichert', icon: <Bookmark className="size-4" />, title: 'Gespeichert', subtitle: 'Eigene Berechnungen – nur lokal in diesem Browser.' },
  { id: 'sources', label: 'Quellen', icon: <BookOpen className="size-4" />, title: 'Formeln & Quellen', subtitle: 'Wie gerechnet wird und worauf die Annahmen beruhen.' },
];

const isTab = (v: unknown): v is TabId => typeof v === 'string' && TABS.some((t) => t.id === v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

export default function App() {
  const [tab, setTab] = useLocalState<TabId>('cannabisrechner.tab', () => 'edibles', isTab);
  const [edible, setEdible] = useLocalState<EdibleInput>('cannabisrechner.edibles.v1', defaultEdibleInput, isEdibleInput);
  const [smoking, setSmoking] = useLocalState<SmokingInput>('cannabisrechner.smoking.v1', defaultSmokingInput, isSmokingInput);
  const [recipes, setRecipes] = useLocalState<Recipe[]>(
    'cannabisrechner.compare.v1',
    () => [newRecipe(0), newRecipe(1, { cannabisGrams: 3.5, potency: { mode: 'total', thcPercent: 22 }, fatGrams: 200 })],
    isRecipeList,
  );
  const [disclaimerSeen, setDisclaimerSeen] = useLocalState<boolean>('cannabisrechner.disclaimer.v1', () => false, isBool);
  const [saved, setSaved] = useState<SavedCalculation[]>(() => loadSaved());

  useEffect(() => {
    persistSaved(saved);
  }, [saved]);

  const save = useCallback(<T,>(kind: CalculationKind, name: string, input: T, summary: Record<string, string>) => {
    setSaved((s) => [createSaved(kind, name, input, summary), ...s]);
  }, []);

  const openSaved = (item: SavedCalculation) => {
    if (item.kind === 'edibles' && isEdibleInput(item.input)) {
      setEdible(item.input);
      setTab('edibles');
    } else if (item.kind === 'smoking' && isSmokingInput(item.input)) {
      setSmoking(item.input);
      setTab('smoking');
    } else if (item.kind === 'compare' && isRecipeList(item.input)) {
      setRecipes(item.input);
      setTab('compare');
    }
  };

  const importSaved = (items: SavedCalculation[]): number => {
    const valid = items.filter(
      (i) =>
        i &&
        typeof i.id === 'string' &&
        typeof i.name === 'string' &&
        typeof i.createdAt === 'string' &&
        i.summary &&
        typeof i.summary === 'object' &&
        ((i.kind === 'edibles' && isEdibleInput(i.input)) ||
          (i.kind === 'smoking' && isSmokingInput(i.input)) ||
          (i.kind === 'compare' && isRecipeList(i.input))),
    );
    setSaved((s) => {
      const ids = new Set(s.map((x) => x.id));
      return [...valid.filter((v) => !ids.has(v.id)), ...s];
    });
    return valid.length;
  };

  const current = TABS.find((t) => t.id === tab)!;

  const go = (id: TabId) => {
    setTab(id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <div className="mx-auto flex min-h-dvh max-w-7xl flex-col px-4 sm:px-6 lg:px-8">
      <header className="flex items-center justify-between gap-4 pt-5 pb-4 sm:pt-7">
        <div className="flex items-center gap-3">
          <div className="grid size-9 place-items-center rounded-xl border border-leaf-500/25 bg-gradient-to-b from-leaf-500/20 to-leaf-500/5 text-leaf-400 shadow-[0_0_24px_-6px_rgb(52_199_123/0.5)]">
            <Leaf className="size-[18px]" />
          </div>
          <div>
            <div className="text-[15px] font-semibold tracking-tight text-ink-50">THC-Rechner</div>
            <div className="text-xs text-ink-400">Edibles · Cannabutter · Wirkung</div>
          </div>
        </div>
        <div
          className="flex items-center gap-1.5 rounded-full border border-leaf-500/15 bg-leaf-500/[0.06] px-2.5 py-1 text-[11px] font-medium text-leaf-300"
          title="Alle Berechnungen und Speicherungen erfolgen ausschließlich lokal im Browser."
        >
          <Lock className="size-3" />
          <span className="hidden sm:inline">100 % lokal · keine Datenübertragung</span>
          <span className="sm:hidden">lokal</span>
        </div>
      </header>

      <nav
        aria-label="Bereiche"
        className="no-print sticky top-0 z-20 -mx-4 border-b border-white/[0.05] bg-ink-950/80 px-4 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8"
      >
        <div role="tablist" className="-mb-px flex gap-1 overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls="main-panel"
                onClick={() => go(t.id)}
                className={`relative flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                  active ? 'bg-white/[0.06] text-ink-50' : 'text-ink-400 hover:bg-white/[0.03] hover:text-ink-200'
                }`}
              >
                <span className={active ? 'text-leaf-400' : ''}>{t.icon}</span>
                {t.label}
                {t.id === 'saved' && saved.length > 0 && (
                  <span className="rounded-full bg-leaf-500/15 px-1.5 text-[10px] tabular text-leaf-300">{saved.length}</span>
                )}
                {active && <span className="absolute inset-x-3 -bottom-2 h-px bg-gradient-to-r from-transparent via-leaf-400 to-transparent" />}
              </button>
            );
          })}
        </div>
      </nav>

      <main id="main-panel" role="tabpanel" className="flex-1 pb-12 pt-6">
        {!disclaimerSeen && (
          <div className="card mb-6 flex gap-3 border-amber-400/15 p-4 animate-fade-up">
            <div className="min-w-0 flex-1 text-[13px] leading-relaxed text-ink-300">
              <span className="font-semibold text-amber-200">Wichtig: </span>
              Alle Werte sind rechnerische Schätzungen mit großer Unsicherheit, keine Dosierungsempfehlung und keine Wirkungsprognose. Selbstgemachte Edibles
              können deutlich stärker oder schwächer sein als berechnet. Edibles wirken verzögert (bis zu 2 Std.) – nicht nachdosieren.{' '}
              <span className="text-ink-400">Nur für Erwachsene. Gesetzliche Regelungen beachten.</span>
            </div>
            <button type="button" className="btn-ghost h-fit p-1.5" aria-label="Hinweis schließen" onClick={() => setDisclaimerSeen(true)}>
              <X className="size-4" />
            </button>
          </div>
        )}

        <div className="mb-6" key={`h-${tab}`}>
          <h1 className="animate-fade-up text-2xl font-semibold tracking-tight text-ink-50 sm:text-[28px]">{current.title}</h1>
          <p className="mt-1 animate-fade-up text-sm text-ink-400">{current.subtitle}</p>
        </div>

        <div key={tab}>
          {tab === 'edibles' && <EdiblesCalculator input={edible} onChange={setEdible} onSave={(n, i, s) => save('edibles', n, i, s)} />}
          {tab === 'smoking' && (
            <SmokingCalculator input={smoking} onChange={setSmoking} onSave={(n, i, s) => save('smoking', n, i, s)} onShowTimeline={() => go('timeline')} />
          )}
          {tab === 'dosage' && <DosageAnalyzer />}
          {tab === 'timeline' && <TimelineView />}
          {tab === 'tools' && <ToolsView />}
          {tab === 'compare' && <CompareView recipes={recipes} onChange={setRecipes} currentEdible={edible} onSave={(n, r, s) => save('compare', n, r, s)} />}
          {tab === 'saved' && (
            <SavedView
              items={saved}
              onOpen={openSaved}
              onDelete={(id) => setSaved((s) => s.filter((x) => x.id !== id))}
              onClear={() => {
                setSaved([]);
                clearSaved();
              }}
              onImport={importSaved}
            />
          )}
          {tab === 'sources' && <SourcesView />}
        </div>
      </main>

      <footer className="border-t border-white/[0.05] py-6 text-xs leading-relaxed text-ink-500">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p>
            Informationswerkzeug zur Schadensminimierung, keine medizinische Beratung. Referenzwerte u. a. nach Health Canada.{' '}
            <button type="button" className="text-ink-400 underline-offset-2 hover:text-leaf-300 hover:underline" onClick={() => go('sources')}>
              Formeln & Quellen
            </button>
          </p>
          <p className="flex items-center gap-1.5">
            <Lock className="size-3" /> Keine Server, kein Tracking, keine Cookies.
          </p>
        </div>
      </footer>
    </div>
  );
}
