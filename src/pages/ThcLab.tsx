import { BookOpen, Bookmark, Calculator, Cigarette, Clock, Cookie, Gauge, GitCompare, X } from 'lucide-react';
import { type ReactNode, useCallback, useEffect } from 'react';
import { useData } from '../app/DataProvider';
import { errorText, useToast } from '../app/Toasts';
import { href, navigate, useRoute } from '../app/router';
import { PageHeader } from '../components/ui/PageHeader';
import { CompareView } from '../features/CompareView';
import { DosageAnalyzer } from '../features/DosageAnalyzer';
import { EdiblesCalculator } from '../features/EdiblesCalculator';
import { SavedView } from '../features/SavedView';
import { SmokingCalculator } from '../features/SmokingCalculator';
import { SourcesView } from '../features/SourcesView';
import { TimelineView } from '../features/TimelineView';
import { ToolsView } from '../features/ToolsView';
import { useLocalState } from '../hooks/useLocalState';
import { type Recipe, newRecipe } from '../lib/calc/compare';
import { type EdibleInput, defaultEdibleInput } from '../lib/calc/edibles';
import { type SmokingInput, defaultSmokingInput } from '../lib/calc/smoking';
import { writeBatch } from '../lib/db/database';
import { createRecord, deleteSimple } from '../lib/db/repo';
import type { CalculationRecord } from '../lib/db/types';
import { isEdibleInput, isRecipeList, isSmokingInput } from '../lib/guards';
import type { CalculationKind, SavedCalculation } from '../lib/storage';

export type LabTab = 'edibles' | 'smoking' | 'dosage' | 'timeline' | 'tools' | 'compare' | 'saved' | 'sources';

const TABS: { id: LabTab; label: string; icon: ReactNode; title: string; subtitle: string }[] = [
  { id: 'edibles', label: 'Edibles', icon: <Cookie className="size-4" />, title: 'Edibles & Cannabutter', subtitle: 'THC-Gehalt von Butter, Rezept und Portion abschätzen – mit Schwankungsbreite.' },
  { id: 'smoking', label: 'Joint', icon: <Cigarette className="size-4" />, title: 'Joint & Rauchen', subtitle: 'Theoretischer Gehalt, theoretisch konsumierter Anteil und grobe Spanne der Aufnahme – klar getrennt.' },
  { id: 'dosage', label: 'Dosierung', icon: <Gauge className="size-4" />, title: 'Dosis & Potenz', subtitle: 'Potenz einordnen, Edible-Dosen mit vorsichtigen Referenzbereichen vergleichen.' },
  { id: 'timeline', label: 'Zeitachse', icon: <Clock className="size-4" />, title: 'Wirkungsdauer', subtitle: 'Typische Zeitbereiche für Wirkeintritt, Hauptwirkung, Abklingen und Nachwirkungen.' },
  { id: 'tools', label: 'Werkzeuge', icon: <Calculator className="size-4" />, title: 'Werkzeuge', subtitle: 'Umrechnungen, Konzentrationen, Verhältnisse und Umkehrrechner.' },
  { id: 'compare', label: 'Vergleich', icon: <GitCompare className="size-4" />, title: 'Rezeptvergleich', subtitle: 'Mehrere hypothetische Rezepte nebeneinander vergleichen.' },
  { id: 'saved', label: 'Gespeichert', icon: <Bookmark className="size-4" />, title: 'Gespeicherte Berechnungen', subtitle: 'Eigene Berechnungen – lokal gespeichert und Teil des TERPGRID-Backups.' },
  { id: 'sources', label: 'Quellen', icon: <BookOpen className="size-4" />, title: 'Formeln & Quellen', subtitle: 'Wie gerechnet wird und worauf die Annahmen beruhen.' },
];

const isTab = (v: unknown): v is LabTab => typeof v === 'string' && TABS.some((t) => t.id === v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

/**
 * THC Lab – der bisherige THC-Rechner unverändert als Unterbereich.
 * Eingaben bleiben unter den bisherigen localStorage-Schlüsseln erhalten.
 */
export function ThcLab() {
  const route = useRoute();
  const { data } = useData();
  const toast = useToast();
  const [lastTab, setLastTab] = useLocalState<LabTab>('cannabisrechner.tab', () => 'edibles', isTab);
  const tabParam = route.path[1];
  const tab: LabTab = isTab(tabParam) ? tabParam : lastTab;

  useEffect(() => {
    if (!isTab(tabParam)) navigate(`lab/${lastTab}`, { replace: true });
    else if (tabParam !== lastTab) setLastTab(tabParam);
  }, [tabParam, lastTab, setLastTab]);

  const [edible, setEdible] = useLocalState<EdibleInput>('cannabisrechner.edibles.v1', defaultEdibleInput, isEdibleInput);
  const [smoking, setSmoking] = useLocalState<SmokingInput>('cannabisrechner.smoking.v1', defaultSmokingInput, isSmokingInput);
  const [recipes, setRecipes] = useLocalState<Recipe[]>(
    'cannabisrechner.compare.v1',
    () => [newRecipe(0), newRecipe(1, { cannabisGrams: 3.5, potency: { mode: 'total', thcPercent: 22 }, fatGrams: 200 })],
    isRecipeList,
  );
  const [disclaimerSeen, setDisclaimerSeen] = useLocalState<boolean>('cannabisrechner.disclaimer.v1', () => false, isBool);

  const saved: SavedCalculation[] = [...data.calculations].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const save = useCallback(
    async <T,>(kind: CalculationKind, name: string, input: T, summary: Record<string, string>) => {
      try {
        await createRecord('calculations', { kind, name: name.trim() || 'Unbenannte Berechnung', input, summary });
      } catch (e) {
        toast(errorText(e), { tone: 'error' });
      }
    },
    [toast],
  );

  const openSaved = (item: SavedCalculation) => {
    if (item.kind === 'edibles' && isEdibleInput(item.input)) {
      setEdible(item.input);
      navigate('lab/edibles');
    } else if (item.kind === 'smoking' && isSmokingInput(item.input)) {
      setSmoking(item.input);
      navigate('lab/smoking');
    } else if (item.kind === 'compare' && isRecipeList(item.input)) {
      setRecipes(item.input);
      navigate('lab/compare');
    } else toast('Diese Berechnung kann nicht geöffnet werden.', { tone: 'error' });
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
        ((i.kind === 'edibles' && isEdibleInput(i.input)) || (i.kind === 'smoking' && isSmokingInput(i.input)) || (i.kind === 'compare' && isRecipeList(i.input))),
    );
    const existing = new Set(data.calculations.map((c) => c.id));
    const fresh: CalculationRecord[] = valid
      .filter((v) => !existing.has(v.id))
      .map((v) => ({ id: v.id, kind: v.kind, name: v.name, input: v.input, summary: v.summary, createdAt: v.createdAt, updatedAt: v.createdAt }));
    writeBatch({ put: { calculations: fresh } }).catch((e) => toast(errorText(e), { tone: 'error' }));
    return valid.length;
  };

  const current = TABS.find((t) => t.id === tab)!;

  return (
    <div>
      <PageHeader title={current.title} subtitle={current.subtitle} crumbs={[{ label: 'THC Lab', to: 'lab/edibles' }, { label: current.label }]} />

      <nav aria-label="THC Lab" className="no-print sticky top-[3.6rem] z-20 -mx-4 mb-6 border-b border-white/[0.05] bg-ink-950/85 px-4 backdrop-blur-xl sm:-mx-6 sm:px-6 lg:top-0 lg:-mx-10 lg:px-10">
        <div className="-mb-px flex gap-1 overflow-x-auto py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {TABS.map((t) => {
            const active = t.id === tab;
            return (
              <a
                key={t.id}
                href={href(`lab/${t.id}`)}
                aria-current={active ? 'page' : undefined}
                className={`relative flex shrink-0 items-center gap-2 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors ${
                  active ? 'bg-white/[0.06] text-ink-50' : 'text-ink-400 hover:bg-white/[0.03] hover:text-ink-200'
                }`}
              >
                <span className={active ? 'text-leaf-400' : ''}>{t.icon}</span>
                {t.label}
                {t.id === 'saved' && saved.length > 0 && <span className="rounded-full bg-leaf-500/15 px-1.5 text-[10px] tabular text-leaf-300">{saved.length}</span>}
              </a>
            );
          })}
        </div>
      </nav>

      {!disclaimerSeen && (
        <div className="card mb-6 flex gap-3 border-amber-400/15 p-4 animate-fade-up">
          <div className="min-w-0 flex-1 text-[13px] leading-relaxed text-ink-300">
            <span className="font-semibold text-amber-200">Wichtig: </span>
            Alle Werte sind rechnerische Schätzungen mit großer Unsicherheit, keine Dosierungsempfehlung und keine Wirkungsprognose. Selbstgemachte Edibles können
            deutlich stärker oder schwächer sein als berechnet. Edibles wirken verzögert (bis zu 2 Std.) – nicht nachdosieren.{' '}
            <span className="text-ink-400">Nur für Erwachsene. Gesetzliche Regelungen beachten.</span>
          </div>
          <button type="button" className="btn-ghost h-fit p-1.5" aria-label="Hinweis schließen" onClick={() => setDisclaimerSeen(true)}>
            <X className="size-4" />
          </button>
        </div>
      )}

      <div key={tab}>
        {tab === 'edibles' && <EdiblesCalculator input={edible} onChange={setEdible} onSave={(n, i, s) => save('edibles', n, i, s)} />}
        {tab === 'smoking' && <SmokingCalculator input={smoking} onChange={setSmoking} onSave={(n, i, s) => save('smoking', n, i, s)} onShowTimeline={() => navigate('lab/timeline')} />}
        {tab === 'dosage' && <DosageAnalyzer />}
        {tab === 'timeline' && <TimelineView />}
        {tab === 'tools' && <ToolsView />}
        {tab === 'compare' && <CompareView recipes={recipes} onChange={setRecipes} currentEdible={edible} onSave={(n, r, s) => save('compare', n, r, s)} />}
        {tab === 'saved' && (
          <SavedView
            items={saved}
            onOpen={openSaved}
            onDelete={(id) => deleteSimple('calculations', id).catch((e) => toast(errorText(e), { tone: 'error' }))}
            onClear={() => writeBatch({ clear: ['calculations'] }).catch((e) => toast(errorText(e), { tone: 'error' }))}
            onImport={importSaved}
          />
        )}
        {tab === 'sources' && <SourcesView />}
      </div>
    </div>
  );
}
