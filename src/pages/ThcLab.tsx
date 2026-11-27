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
import { useLabDraft } from '../hooks/useLabDraft';
import { type Recipe, newRecipe } from '../lib/calc/compare';
import { type EdibleInput, defaultEdibleInput } from '../lib/calc/edibles';
import { type SmokingInput, defaultSmokingInput } from '../lib/calc/smoking';
import { writeBatch } from '../lib/db/database';
import { createRecord, deleteSimple } from '../lib/db/repo';
import type { CalculationRecord } from '../lib/db/types';
import { isEdibleInput, isRecipeList, isSmokingInput } from '../lib/guards';
import type { CalculationKind, SavedCalculation } from '../lib/storage';
import { t } from '../i18n';

export type LabTab = 'edibles' | 'smoking' | 'dosage' | 'timeline' | 'tools' | 'compare' | 'saved' | 'sources';

const TABS: { id: LabTab; label: string; icon: ReactNode; title: string; subtitle: string }[] = [
  { id: 'edibles', get label() { return t('lab.tab.edibles'); }, icon: <Cookie className="size-4" />, get title() { return t('lab.tab.ediblesT'); }, get subtitle() { return t('lab.tab.ediblesS'); } },
  { id: 'smoking', get label() { return t('lab.tab.joint'); }, icon: <Cigarette className="size-4" />, get title() { return t('lab.tab.jointT'); }, get subtitle() { return t('lab.tab.jointS'); } },
  { id: 'dosage', get label() { return t('lab.tab.dosage'); }, icon: <Gauge className="size-4" />, get title() { return t('lab.tab.dosageT'); }, get subtitle() { return t('lab.tab.dosageS'); } },
  { id: 'timeline', get label() { return t('lab.tab.timeline'); }, icon: <Clock className="size-4" />, get title() { return t('lab.tab.timelineT'); }, get subtitle() { return t('lab.tab.timelineS'); } },
  { id: 'tools', get label() { return t('lab.tab.tools'); }, icon: <Calculator className="size-4" />, get title() { return t('lab.tab.tools'); }, get subtitle() { return t('lab.tab.toolsS'); } },
  { id: 'compare', get label() { return t('lab.tab.compare'); }, icon: <GitCompare className="size-4" />, get title() { return t('lab.tab.compareT'); }, get subtitle() { return t('lab.tab.compareS'); } },
  { id: 'saved', get label() { return t('lab.tab.saved'); }, icon: <Bookmark className="size-4" />, get title() { return t('lab.tab.savedT'); }, get subtitle() { return t('lab.tab.savedS'); } },
  { id: 'sources', get label() { return t('lab.tab.sources'); }, icon: <BookOpen className="size-4" />, get title() { return t('lab.tab.sourcesT'); }, get subtitle() { return t('lab.tab.sourcesS'); } },
];

const isTab = (v: unknown): v is LabTab => typeof v === 'string' && TABS.some((t) => t.id === v);
const isBool = (v: unknown): v is boolean => typeof v === 'boolean';

/**
 * THC Lab – der bisherige THC-Rechner unverändert als Unterbereich.
 * Lokalmodus: Eingaben unter den bisherigen localStorage-Schlüsseln. Servermodus: je Konto
 * getrennt und als Entwurf geräteübergreifend synchronisiert (siehe useLabDraft).
 */
export function ThcLab() {
  const route = useRoute();
  const { data } = useData();
  const toast = useToast();
  // Zuletzt genutzter Tab: kontobezogen, aber nur auf diesem Gerät (nicht synchronisiert)
  const [lastTab, setLastTab] = useLabDraft<LabTab>('tab', 'cannabisrechner.tab', () => 'edibles', isTab, { sync: false });
  const tabParam = route.path[1];
  const tab: LabTab = isTab(tabParam) ? tabParam : lastTab;

  useEffect(() => {
    if (!isTab(tabParam)) navigate(`lab/${lastTab}`, { replace: true });
    else if (tabParam !== lastTab) setLastTab(tabParam);
  }, [tabParam, lastTab, setLastTab]);

  // Entwürfe je Rechner: im Servermodus kontobezogen und geräteübergreifend synchronisiert
  const [edible, setEdible] = useLabDraft<EdibleInput>('edibles', 'cannabisrechner.edibles.v1', defaultEdibleInput, isEdibleInput);
  const [smoking, setSmoking] = useLabDraft<SmokingInput>('smoking', 'cannabisrechner.smoking.v1', defaultSmokingInput, isSmokingInput);
  const [recipes, setRecipes] = useLabDraft<Recipe[]>(
    'compare',
    'cannabisrechner.compare.v1',
    () => [newRecipe(0), newRecipe(1, { cannabisGrams: 3.5, potency: { mode: 'total', thcPercent: 22 }, fatGrams: 200 })],
    isRecipeList,
  );
  const [disclaimerSeen, setDisclaimerSeen] = useLabDraft<boolean>('disclaimer', 'cannabisrechner.disclaimer.v1', () => false, isBool, { sync: false });

  const saved: SavedCalculation[] = [...data.calculations].sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const save = useCallback(
    async <T,>(kind: CalculationKind, name: string, input: T, summary: Record<string, string>) => {
      try {
        await createRecord('calculations', { kind, name: name.trim() || t('lab.page.unnamed'), input, summary });
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
    } else toast(t('lab.page.cannotOpen'), { tone: 'error' });
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
            <span className="font-semibold text-amber-200">{t('lab.page.important')} </span>
            {t('lab.page.disclaimer')}{' '}
            <span className="text-ink-400">{t('lab.page.adults')}</span>
          </div>
          <button type="button" className="btn-ghost h-fit p-1.5" aria-label={t('lab.page.closeHint')} onClick={() => setDisclaimerSeen(true)}>
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
